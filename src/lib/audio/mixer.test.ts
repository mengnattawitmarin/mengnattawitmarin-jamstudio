import { test } from "node:test";
import assert from "node:assert/strict";
import { audibleMap, KINDS, newChannel } from "./mixer.ts";

test("presets set sensible routing", () => {
  assert.equal(newChannel("guitar", 1).route, "amp");
  assert.equal(newChannel("bass", 1).route, "direct");
  assert.ok(KINDS.vocal.hpf > KINDS.bass.hpf);
});

test("solo silences others, mute wins", () => {
  const a = { ...newChannel("guitar", 1), id: "a" };
  const b = { ...newChannel("bass", 2), id: "b", solo: true };
  const c = { ...newChannel("keys", 3), id: "c", solo: true, mute: true };
  assert.deepEqual(audibleMap([a, b, c]), { a: false, b: true, c: false });
  assert.deepEqual(audibleMap([{ ...a, solo: false }]), { a: true });
});
