import { test } from "node:test";
import assert from "node:assert/strict";
import { TUNER_INSTRUMENTS, centsOff, midiToHz, nearestString, noteName } from "./tunings.ts";

test("standard guitar is E2 A2 D3 G3 B3 E4", () => {
  const std = TUNER_INSTRUMENTS[0].tunings[0];
  assert.deepEqual(std.notes, [40, 45, 50, 55, 59, 64]);
  assert.deepEqual(std.notes.map((n) => noteName(n)), ["E", "A", "D", "G", "B", "E"]);
});

test("A4 reference and cents", () => {
  assert.equal(Math.round(midiToHz(69)), 440);
  assert.equal(Math.round(midiToHz(69, 432)), 432);
  assert.ok(Math.abs(centsOff(445, 69)) - 19.6 < 0.5);
});

test("auto string detection picks the closest string", () => {
  const notes = TUNER_INSTRUMENTS[0].tunings[0].notes;
  assert.equal(nearestString(82.4, notes), 0);
  assert.equal(nearestString(108, notes), 1);
  assert.equal(nearestString(250, notes), 4);
});

test("every tuning has notes and unique ids", () => {
  for (const inst of TUNER_INSTRUMENTS) {
    const ids = new Set(inst.tunings.map((t) => t.id));
    assert.equal(ids.size, inst.tunings.length, inst.id);
    for (const t of inst.tunings) assert.ok(t.notes.every((n) => Number.isFinite(n) && n > 10 && n < 100));
  }
});
