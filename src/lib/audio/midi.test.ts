import { test } from "node:test";
import assert from "node:assert/strict";
import { gmDrumPad, noteOffBytes, noteOnBytes, parseMidi } from "./midi.ts";

test("note on / off / running-zero velocity", () => {
  assert.deepEqual(parseMidi([0x90, 60, 127]), { type: "on", channel: 1, note: 60, velocity: 1 });
  assert.deepEqual(parseMidi([0x99, 36, 64]), { type: "on", channel: 10, note: 36, velocity: 64 / 127 });
  assert.deepEqual(parseMidi([0x80, 60, 10]), { type: "off", channel: 1, note: 60 });
  assert.deepEqual(parseMidi([0x90, 60, 0]), { type: "off", channel: 1, note: 60 });
});

test("cc and pitch bend", () => {
  assert.deepEqual(parseMidi([0xb3, 7, 127]), { type: "cc", channel: 4, cc: 7, value: 1 });
  const bend = parseMidi([0xe0, 0, 64]);
  assert.equal(bend.type, "pitch");
  assert.ok(bend.type === "pitch" && Math.abs(bend.value) < 1e-9);
});

test("GM drum map", () => {
  assert.equal(gmDrumPad(36), 0);
  assert.equal(gmDrumPad(38), 1);
  assert.equal(gmDrumPad(42), 2);
  assert.equal(gmDrumPad(49), 3);
  assert.equal(gmDrumPad(45), 4);
  assert.equal(gmDrumPad(39), 5);
});

test("outgoing bytes round-trip", () => {
  assert.deepEqual(parseMidi(noteOnBytes(64, 0.5, 2)), { type: "on", channel: 2, note: 64, velocity: 64 / 127 });
  assert.deepEqual(parseMidi(noteOffBytes(64, 2)), { type: "off", channel: 2, note: 64 });
});
