/**
 * Pitch-preserving tempo change and tempo-preserving key change.
 *
 * WSOLA (waveform-similarity overlap-add): the output is built from
 * Hann-windowed grains read from the input at a slower/faster pace; each
 * grain's read position is nudged (±tolerance) to the spot whose waveform best
 * continues the previous grain, which avoids the phasey "chorus" of naive OLA.
 *
 * Key change = resample by the pitch ratio, then WSOLA back to the target
 * length, so the result plays at rate 1 with the new pitch and tempo.
 */
export type StretchJob = {
  channels: Float32Array[];
  sampleRate: number;
  /** Tempo ratio: 0.5 = half speed, 1.25 = 25% faster. */
  rate: number;
  /** Key shift in semitones (-12..+12). */
  semitones: number;
};

export function stretchChannels(job: StretchJob, onProgress?: (ratio: number) => void): Float32Array[] {
  const { channels, sampleRate } = job;
  const rate = Math.min(2, Math.max(0.25, job.rate));
  const q = 2 ** (Math.max(-12, Math.min(12, job.semitones)) / 12);
  if (Math.abs(rate - 1) < 1e-3 && Math.abs(q - 1) < 1e-4) return channels.map((ch) => new Float32Array(ch));

  // 1) Resample by the pitch ratio (played at rate 1 this is q× higher and q× faster).
  const shifted = Math.abs(q - 1) < 1e-4 ? channels : channels.map((ch) => resample(ch, q));
  // 2) Time-stretch so final length = original / rate.
  const targetLength = Math.round(channels[0].length / rate);
  const factor = targetLength / shifted[0].length;
  return wsola(shifted, factor, sampleRate, onProgress);
}

function resample(input: Float32Array, ratio: number): Float32Array {
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = input[i0] ?? 0;
    const b = input[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function wsola(input: Float32Array[], factor: number, sampleRate: number, onProgress?: (ratio: number) => void): Float32Array[] {
  const n = input[0].length;
  // ~46 ms grains at 44.1 kHz, scaled for other rates; power of two not required.
  const frame = Math.max(256, Math.round((sampleRate * 0.046) / 2) * 2);
  const hs = frame / 2; // synthesis hop (50% overlap with a periodic Hann sums to 1)
  const ha = hs / factor; // analysis hop
  const tol = Math.round(sampleRate * 0.012); // ±12 ms search
  const outLength = Math.round(n * factor);
  const out = input.map(() => new Float32Array(outLength + frame));
  const win = new Float32Array(frame);
  for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame);

  // Mono guide signal for the similarity search.
  const guide = new Float32Array(n);
  for (const ch of input) for (let i = 0; i < n; i++) guide[i] += ch[i] / input.length;

  const coarse = 4;
  const corrLen = hs;
  let prev = 0; // input position of the previous grain
  const frames = Math.ceil(outLength / hs);
  for (let k = 0; k < frames; k++) {
    const outPos = k * hs;
    const nominal = Math.round(k * ha);
    let best = nominal;
    if (k > 0) {
      const natural = prev + hs; // where the previous grain would naturally continue
      const lo = Math.max(0, nominal - tol);
      const hi = Math.min(n - frame - 1, nominal + tol);
      if (hi > lo && natural + corrLen < n) {
        let bestScore = -Infinity;
        const score = (cand: number, step: number) => {
          let s = 0;
          for (let i = 0; i < corrLen; i += step) s += guide[natural + i] * guide[cand + i];
          return s;
        };
        for (let cand = lo; cand <= hi; cand += coarse) {
          const s = score(cand, 4);
          if (s > bestScore) {
            bestScore = s;
            best = cand;
          }
        }
        const fineLo = Math.max(lo, best - coarse);
        const fineHi = Math.min(hi, best + coarse);
        bestScore = -Infinity;
        for (let cand = fineLo; cand <= fineHi; cand++) {
          const s = score(cand, 2);
          if (s > bestScore) {
            bestScore = s;
            best = cand;
          }
        }
      }
    }
    best = Math.max(0, Math.min(best, n - 1));
    for (let c = 0; c < input.length; c++) {
      const src = input[c];
      const dst = out[c];
      const limit = Math.min(frame, n - best);
      for (let i = 0; i < limit; i++) dst[outPos + i] += src[best + i] * win[i];
    }
    prev = best;
    if (onProgress && k % 256 === 0) onProgress(k / frames);
  }
  return out.map((ch) => ch.subarray(0, outLength).slice());
}
