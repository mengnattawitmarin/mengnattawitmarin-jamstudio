import { test } from "node:test";
import assert from "node:assert/strict";
import { stretchChannels } from "./stretch.ts";

const SR = 22050;
function sine(hz: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / SR) * 0.5;
  return out;
}
/** Zero-crossing frequency estimate over the middle of the signal. */
function freq(x: Float32Array): number {
  const a = Math.floor(x.length * 0.25);
  const b = Math.floor(x.length * 0.75);
  let crossings = 0;
  for (let i = a + 1; i < b; i++) if (x[i - 1] <= 0 && x[i] > 0) crossings++;
  return (crossings * SR) / (b - a);
}

test("half speed doubles length and keeps pitch", () => {
  const [out] = stretchChannels({ channels: [sine(440, 1)], sampleRate: SR, rate: 0.5, semitones: 0 });
  assert.ok(Math.abs(out.length - SR * 2) < SR * 0.01, `length ${out.length}`);
  assert.ok(Math.abs(freq(out) - 440) < 8, `freq ${freq(out)}`);
});

test("+12 semitones keeps length and doubles pitch", () => {
  const [out] = stretchChannels({ channels: [sine(220, 1)], sampleRate: SR, rate: 1, semitones: 12 });
  assert.ok(Math.abs(out.length - SR) < SR * 0.01, `length ${out.length}`);
  assert.ok(Math.abs(freq(out) - 440) < 10, `freq ${freq(out)}`);
});

test("identity returns a copy", () => {
  const input = sine(300, 0.2);
  const [out] = stretchChannels({ channels: [input], sampleRate: SR, rate: 1, semitones: 0 });
  assert.equal(out.length, input.length);
  assert.notEqual(out, input);
});

test("output stays bounded (no overlap-add blow-up)", () => {
  const [out] = stretchChannels({ channels: [sine(440, 1)], sampleRate: SR, rate: 0.75, semitones: -3 });
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak < 0.75, `peak ${peak}`);
});
