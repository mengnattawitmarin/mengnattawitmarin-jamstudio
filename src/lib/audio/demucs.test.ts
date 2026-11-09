import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkInput, monoStats, OverlapAdd, planChunks, triangleWeight } from "./demucs.ts";

test("chunks cover the whole track with 25% overlap", () => {
  const seg = 1000;
  const starts = planChunks(3200, seg, 0.25);
  assert.deepEqual(starts, [0, 750, 1500, 2250]);
  assert.ok(starts[starts.length - 1] + seg >= 3200);
  assert.deepEqual(planChunks(10, seg), [0]);
});

test("triangle weight peaks at 1 and is positive at edges", () => {
  const w = triangleWeight(100);
  assert.ok(Math.abs(Math.max(...w) - 1) < 1e-6);
  assert.ok(w[0] > 0 && w[99] > 0);
});

test("identity model reconstructs the input (overlap-add is unbiased)", () => {
  const seg = 400;
  const n = 1500;
  const left = new Float32Array(n).map((_, i) => Math.sin(i / 7) * 0.5 + 0.1);
  const right = new Float32Array(n).map((_, i) => Math.cos(i / 11) * 0.4 + 0.1);
  const stats = monoStats(left, right);
  const ola = new OverlapAdd(n, 2, seg);
  for (const start of planChunks(n, seg, 0.25)) {
    const input = chunkInput(left, right, start, stats, seg);
    // Fake model: stem 0 = input, stem 1 = zeros.
    const out = new Float32Array(2 * 2 * seg);
    out.set(input, 0);
    ola.add(out, start);
  }
  const [s0, s1] = ola.finish(stats);
  // stem0 + stem1 must equal the mix (mean is split across stems).
  for (let i = 0; i < n; i += 37) {
    assert.ok(Math.abs(s0[0][i] + s1[0][i] - left[i]) < 1e-4, `L ${i}`);
    assert.ok(Math.abs(s0[1][i] + s1[1][i] - right[i]) < 1e-4, `R ${i}`);
  }
});
