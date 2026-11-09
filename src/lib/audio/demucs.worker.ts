import { AI_STEMS, chunkInput, monoStats, OverlapAdd, planChunks, SEGMENT } from "./demucs";

type Start = { type: "start"; left: Float32Array; right: Float32Array; modelUrl: string; ortBase: string };
type Out =
  | { type: "progress"; phase: "download" | "load" | "separate"; ratio: number; detail?: string }
  | { type: "done"; stems: Float32Array[][]; backend: string; seconds: number }
  | { type: "error"; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Start>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
const post = (msg: Out, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);

async function fetchModel(url: string): Promise<ArrayBuffer> {
  const cacheName = "kakun-models-v1";
  let cache: Cache | null = null;
  try {
    cache = await caches.open(cacheName);
    const hit = await cache.match(url);
    if (hit) {
      post({ type: "progress", phase: "download", ratio: 1, detail: "ใช้โมเดลที่เก็บไว้ในเครื่อง" });
      return await hit.arrayBuffer();
    }
  } catch {
    cache = null; // private mode / no Cache API
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`ดาวน์โหลดโมเดลไม่สำเร็จ (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 136 * 1024 * 1024;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    post({ type: "progress", phase: "download", ratio: Math.min(0.999, got / total), detail: `${Math.round(got / 1048576)} / ${Math.round(total / 1048576)} MB` });
  }
  const bytes = new Uint8Array(got);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  try {
    await cache?.put(url, new Response(bytes.slice().buffer, { headers: { "content-type": "application/octet-stream" } }));
  } catch {
    // quota exceeded: still usable this time
  }
  return bytes.buffer;
}

scope.onmessage = async (event: MessageEvent<Start>) => {
  const msg = event.data;
  if (msg?.type !== "start") return;
  const t0 = performance.now();
  try {
    const model = await fetchModel(msg.modelUrl);
    post({ type: "progress", phase: "load", ratio: 0, detail: "กำลังเตรียม AI" });
    type Ort = typeof import("onnxruntime-web/wasm");
    let stage = "init";
    let ort: Ort | null = null;
    let session: Awaited<ReturnType<Ort["InferenceSession"]["create"]>> | null = null;
    let backend = "wasm";
    const threads = (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    // Only try WebGPU when a real adapter exists; a failed WebGPU init can leave
    // that wasm instance aborted, so the CPU path uses a separate module.
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    let adapter: unknown = null;
    try {
      adapter = gpu ? await gpu.requestAdapter() : null;
    } catch {
      adapter = null;
    }
    if (adapter) {
      try {
        stage = "webgpu";
        (self as unknown as { __stage?: string }).__stage = stage;
        const gpuOrt = (await import("onnxruntime-web/webgpu")) as unknown as Ort;
        gpuOrt.env.wasm.wasmPaths = msg.ortBase;
        gpuOrt.env.wasm.numThreads = threads;
        session = await gpuOrt.InferenceSession.create(model, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" });
        ort = gpuOrt;
        backend = "webgpu";
      } catch {
        session = null;
      }
    }
    if (!session) {
      stage = "wasm";
      (self as unknown as { __stage?: string }).__stage = stage;
      const cpuOrt = await import("onnxruntime-web/wasm");
      cpuOrt.env.wasm.wasmPaths = msg.ortBase;
      cpuOrt.env.wasm.numThreads = threads;
      ort = cpuOrt;
      // Graph optimisation (constant folding of the conv-STFT kernels) blows the
      // 4 GB wasm heap; with it disabled the fp16 model needs ~0.65 GB to load
      // and ~1.4 GB while running (verified on CI, ORT-web 1.22/1.23).
      session = await cpuOrt.InferenceSession.create(model, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "disabled",
        enableCpuMemArena: false,
        enableMemPattern: false,
      });
    }
    stage = "run";
    (self as unknown as { __stage?: string }).__stage = stage;
    post({ type: "progress", phase: "load", ratio: 1, detail: backend === "webgpu" ? "ใช้การ์ดจอ (WebGPU)" : "ใช้ CPU" });

    const { left, right } = msg;
    const stats = monoStats(left, right);
    const starts = planChunks(left.length);
    const ola = new OverlapAdd(left.length, AI_STEMS.length);
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    for (let i = 0; i < starts.length; i++) {
      const input = new ort!.Tensor("float32", chunkInput(left, right, starts[i], stats), [1, 2, SEGMENT]);
      const result = await session.run({ [inputName]: input });
      const out = result[outputName];
      ola.add(out.data as Float32Array, starts[i]);
      input.dispose?.();
      out.dispose?.();
      post({ type: "progress", phase: "separate", ratio: (i + 1) / starts.length, detail: `ช่วง ${i + 1}/${starts.length}` });
    }
    await session.release?.();
    const stems = ola.finish(stats);
    post({ type: "done", stems, backend, seconds: (performance.now() - t0) / 1000 }, stems.flat().map((ch) => ch.buffer));
  } catch (error) {
    post({ type: "error", message: `[${(self as unknown as { __stage?: string }).__stage ?? "?"}] ${error instanceof Error ? error.message : String(error)}` });
  }
};
