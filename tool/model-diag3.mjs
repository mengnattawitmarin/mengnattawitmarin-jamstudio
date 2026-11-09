// One config per process: node tool/model-diag3.mjs <pkg> <file> <opt>
import { readFileSync } from "node:fs";
const [pkg, file, opt] = process.argv.slice(2);
const SEG = 343980;
const mb = () => Math.round(process.memoryUsage().rss / 1e6) + "MB";
const opts = {
  default: {},
  noarena: { enableCpuMemArena: false, enableMemPattern: false },
  noopt: { graphOptimizationLevel: "disabled", enableCpuMemArena: false, enableMemPattern: false },
  ext: { graphOptimizationLevel: "extended" },
}[opt];
const tag = `${pkg} ${file.split("/").pop()} ${opt}`;
let stage = "import";
try {
  const ort = await import(pkg);
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = "warning";
  stage = "read";
  const bytes = new Uint8Array(readFileSync(file));
  stage = "create";
  const t0 = Date.now();
  const s = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], logSeverityLevel: 2, ...opts });
  const t1 = Date.now();
  console.log(`  ${tag}: created ${t1 - t0}ms rss=${mb()}`);
  stage = "run";
  const out = await s.run({ mix: new ort.Tensor("float32", new Float32Array(2 * SEG).fill(0.01), [1, 2, SEG]) });
  console.log(`OK   ${tag}: run ${Date.now() - t1}ms dims=${JSON.stringify(out.stems.dims)} rss=${mb()}`);
} catch (e) {
  console.log(`FAIL ${tag} @${stage}: ${String(e && e.message ? e.message : e).slice(0, 300)} rss=${mb()}`);
}
