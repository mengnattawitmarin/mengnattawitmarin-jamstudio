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
    const ort = await import("onnxruntime-web/webgpu");
    ort.env.wasm.wasmPaths = msg.ortBase;
    ort.env.wasm.numThreads = (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    let session: Awaited<ReturnType<typeof ort.InferenceSession.create>> | null = null;
    let backend = "wasm";
    const hasGpu = typeof (navigator as Navigator & { gpu?: unknown }).gpu !== "undefined";
    if (hasGpu) {
      try {
        session = await ort.InferenceSession.create(model, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" });
        backend = "webgpu";
      } catch {
        session = null;
      }
    }
    if (!session) session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    post({ type: "progress", phase: "load", ratio: 1, detail: backend === "webgpu" ? "ใช้การ์ดจอ (WebGPU)" : "ใช้ CPU" });

    const { left, right } = msg;
    const stats = monoStats(left, right);
    const starts = planChunks(left.length);
    const ola = new OverlapAdd(left.length, AI_STEMS.length);
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    for (let i = 0; i < starts.length; i++) {
      const input = new ort.Tensor("float32", chunkInput(left, right, starts[i], stats), [1, 2, SEGMENT]);
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
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
