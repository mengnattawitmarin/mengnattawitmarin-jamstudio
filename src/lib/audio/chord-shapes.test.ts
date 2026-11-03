import { test } from "node:test";
import assert from "node:assert/strict";
import { guitarShape } from "./chord-shapes.ts";

const OPEN = [40, 45, 50, 55, 59, 64];
const INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
  "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
};

test("every root × suffix shape sounds only chord tones and includes the root", () => {
  for (let root = 0; root < 12; root++) {
    for (const [suffix, steps] of Object.entries(INTERVALS)) {
      const shape = guitarShape(root, suffix);
      assert.ok(shape, `${root}${suffix}`);
      const allowed = new Set(steps.map((s) => (root + s) % 12));
      const pcs = shape.frets.map((f, s) => (f < 0 ? -1 : (OPEN[s] + f) % 12)).filter((p) => p >= 0);
      assert.ok(pcs.length >= 3, `${root}${suffix} too few strings`);
      for (const pc of pcs) assert.ok(allowed.has(pc), `${root}${suffix} has stray pc ${pc} in ${shape.frets}`);
      assert.ok(pcs.includes(root), `${root}${suffix} missing root`);
      assert.ok(Math.max(...shape.frets) <= 15);
    }
  }
});

test("open C and G voicings", () => {
  assert.deepEqual(guitarShape(0, "")?.frets, [-1, 3, 2, 0, 1, 0]);
  assert.deepEqual(guitarShape(7, "")?.frets, [3, 2, 0, 0, 0, 3]);
});
