import { test } from "node:test";
import assert from "node:assert/strict";
import { AVATARS, parseAvatar, resolveAvatar } from "./avatars.ts";

test("resolveAvatar falls back safely on junk", () => {
  const look = resolveAvatar({ char: "nope", outfit: "red; background:url(x)", inst: "laser" as never });
  assert.equal(look.id, AVATARS[0].id);
  assert.equal(look.shirt, AVATARS[0].shirt);
  assert.equal(look.inst, AVATARS[0].inst);
});

test("outfit and instrument override", () => {
  const look = resolveAvatar({ char: "beat", outfit: "#C6FF3D", inst: "guitar" });
  assert.equal(look.shirt, "#C6FF3D");
  assert.equal(look.inst, "guitar");
});

test("parseAvatar rejects non-objects and sanitises", () => {
  assert.equal(parseAvatar("x"), null);
  assert.deepEqual(parseAvatar({ char: "mint", outfit: "javascript:1", inst: "mic" }), { char: "mint", outfit: null, inst: "mic" });
});
