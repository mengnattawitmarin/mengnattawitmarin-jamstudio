// Try onnxruntime-web versions × session options to find a config that loads
// the Demucs model inside the wasm memory limits.
import { readFileSync } from "node:fs";
const SEG = 343980;
const files = { fp16: "/tmp/m16.onnx", fp32: "/tmp/m32.onnx" };
const versions = ["ortw120", "ortw121", "ortw122", "ortw123"];
const optionSets = {
  default: {},
  lean: { graphOptimizationLevel: "disabled", enableCpuMemArena: false, enableMemPattern: false },
  basic: { graphOptimizationLevel: "basic", enableCpuMemArena: false },
};
for (const v of versions) {
  let ort;
  try {
    ort = await import(v);
  } catch (e) {
    console.log(`${v}: import failed ${String(e).slice(0, 120)}`);
    continue;
  }
  ort.env.wasm.numThreads = 1;
  for (const [fname, path] of Object.entries(files)) {
    const bytes = new Uint8Array(readFileSync(path));
    for (const [oname, opts] of Object.entries(optionSets)) {
      const tag = `${v} ${fname} ${oname}`;
      try {
        const t0 = Date.now();
        const s = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], ...opts });
        const t1 = Date.now();
        const out = await s.run({ mix: new ort.Tensor("float32", new Float32Array(2 * SEG).fill(0.01), [1, 2, SEG]) });
        console.log(`OK   ${tag}: load ${t1 - t0}ms run ${Date.now() - t1}ms dims=${JSON.stringify(out.stems.dims)}`);
        await s.release?.();
      } catch (e) {
        console.log(`FAIL ${tag}: ${String(e && e.message ? e.message : e).slice(0, 160)}`);
      }
    }
  }
}
