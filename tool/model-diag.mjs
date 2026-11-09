// Diagnose the Demucs ONNX model: load + run one segment in onnxruntime-node
// and onnxruntime-web (wasm, in Node). Prints shapes, timings, and errors.
import { readFileSync, statSync } from "node:fs";

const files = process.argv.slice(2);
const SEG = 343980;
for (const file of files) {
  console.log(`\n=== ${file} (${(statSync(file).size / 1048576).toFixed(1)} MB) ===`);
  const bytes = readFileSync(file);
  for (const [label, mod] of [
    ["node", "onnxruntime-node"],
    ["web-wasm", "onnxruntime-web"],
  ]) {
    try {
      const ort = await import(mod);
      if (label === "web-wasm") ort.env.wasm.numThreads = 1;
      const t0 = Date.now();
      const session = await ort.InferenceSession.create(label === "node" ? file : new Uint8Array(bytes), { executionProviders: [label === "node" ? "cpu" : "wasm"] });
      console.log(`[${label}] loaded in ${Date.now() - t0} ms; inputs=${JSON.stringify(session.inputNames)} outputs=${JSON.stringify(session.outputNames)}`);
      const input = new Float32Array(2 * SEG);
      for (let i = 0; i < SEG; i++) {
        input[i] = Math.sin(i / 50) * 0.3;
        input[SEG + i] = Math.sin(i / 50) * 0.3;
      }
      const t1 = Date.now();
      const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 2, SEG]) });
      const o = out[session.outputNames[0]];
      let finite = true;
      for (let i = 0; i < o.data.length; i += 997) if (!Number.isFinite(o.data[i])) finite = false;
      console.log(`[${label}] run ${Date.now() - t1} ms dims=${JSON.stringify(o.dims)} finite=${finite}`);
    } catch (e) {
      console.log(`[${label}] ERROR: ${e && e.stack ? e.stack.slice(0, 800) : String(e)}`);
    }
  }
}
