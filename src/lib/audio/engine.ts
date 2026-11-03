import { ANALYSIS_SR, STEM_IDS, type StemId } from "./stems.ts";
import type { Analysis, ChordEvent } from "./types.ts";

const FFT_SIZE = 2048;
const HOP = 512;
const BINS = FFT_SIZE / 2 + 1;

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const QUALITIES: { suffix: string; tones: number[]; bias: number }[] = [
  { suffix: "", tones: [0, 4, 7], bias: 1.05 },
  { suffix: "m", tones: [0, 3, 7], bias: 1.05 },
  { suffix: "7", tones: [0, 4, 7, 10], bias: 0.98 },
  { suffix: "maj7", tones: [0, 4, 7, 11], bias: 0.97 },
  { suffix: "m7", tones: [0, 3, 7, 10], bias: 0.97 },
  { suffix: "sus4", tones: [0, 5, 7], bias: 0.96 },
  { suffix: "sus2", tones: [0, 2, 7], bias: 0.94 },
  { suffix: "dim", tones: [0, 3, 6], bias: 0.9 },
  { suffix: "aug", tones: [0, 4, 8], bias: 0.88 },
];

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

type Progress = (stage: string, ratio: number) => void;

export type AnalyzeInput = {
  mid: Float32Array;
  side: Float32Array;
  sampleRate: number;
  sourceDuration: number;
  truncated: boolean;
  onProgress?: Progress;
};

export function fft(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const aRe = re[i + j];
        const aIm = im[i + j];
        const bRe = re[i + j + half];
        const bIm = im[i + j + half];
        const vRe = bRe * wRe - bIm * wIm;
        const vIm = bRe * wIm + bIm * wRe;
        re[i + j] = aRe + vRe;
        im[i + j] = aIm + vIm;
        re[i + j + half] = aRe - vRe;
        im[i + j + half] = aIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0 || 1)));
  return t * t * (3 - 2 * t);
}

function bell(f: number, lo: number, hi: number): number {
  const up = smoothstep(lo * 0.45, lo, f);
  const down = 1 - smoothstep(hi, hi * 1.55, f);
  return Math.max(0, up * down);
}

function medianInto(
  src: Float32Array,
  frameCount: number,
  bins: number,
  horizontal: boolean,
  win: number,
  dst: Float32Array,
): void {
  const half = win >> 1;
  const tmp = new Float32Array(win);
  if (horizontal) {
    for (let b = 0; b < bins; b++) {
      for (let t = 0; t < frameCount; t++) {
        const t0 = Math.max(0, t - half);
        const t1 = Math.min(frameCount - 1, t + half);
        let c = 0;
        for (let k = t0; k <= t1; k++) tmp[c++] = src[k * bins + b];
        dst[t * bins + b] = medianSorted(tmp, c);
      }
    }
    return;
  }
  for (let t = 0; t < frameCount; t++) {
    const base = t * bins;
    for (let b = 0; b < bins; b++) {
      const b0 = Math.max(0, b - half);
      const b1 = Math.min(bins - 1, b + half);
      let c = 0;
      for (let k = b0; k <= b1; k++) tmp[c++] = src[base + k];
      dst[base + b] = medianSorted(tmp, c);
    }
  }
}

function medianSorted(tmp: Float32Array, count: number): number {
  for (let i = 1; i < count; i++) {
    const v = tmp[i];
    let j = i - 1;
    while (j >= 0 && tmp[j] > v) {
      tmp[j + 1] = tmp[j];
      j--;
    }
    tmp[j + 1] = v;
  }
  return tmp[count >> 1];
}

function buildShapes(sr: number): Float32Array[] {
  const shapes = STEM_IDS.map(() => new Float32Array(BINS));
  for (let k = 0; k < BINS; k++) {
    const f = (k * sr) / FFT_SIZE;
    const vocal = bell(f, 420, 3000);
    const bass = 1 - smoothstep(80, 260, f);
    const kick = 1 - smoothstep(40, 150, f);
    const drums = bell(f, 180, 2400) * (1 - kick * 0.5);
    const hats = smoothstep(3400, 7000, f);
    const harmony = bell(f, 160, 4800) * (1 - bass * 0.8);
    shapes[0][k] = vocal;
    shapes[1][k] = bass;
    shapes[2][k] = kick;
    shapes[3][k] = drums;
    shapes[4][k] = hats;
    shapes[5][k] = harmony;
  }
  return shapes;
}

function fillMasks(
  harm: number,
  center: number,
  shapes: Float32Array[],
  bin: number,
  out: Float32Array,
): void {
  const perc = 1 - harm;
  const c = center;
  out[0] = harm * shapes[0][bin] * (0.22 + 1.45 * c);
  out[1] = harm * shapes[1][bin] * (0.5 + 0.75 * c);
  out[2] = perc * shapes[2][bin] * (0.65 + 0.55 * c);
  out[3] = perc * shapes[3][bin];
  out[4] = perc * shapes[4][bin] * (0.85 + 0.35 * (1 - c));
  out[5] =
    harm * shapes[5][bin] * (0.4 + c * 0.15 + (1 - c) * 0.95) +
    harm * (1 - shapes[0][bin]) * (1 - shapes[1][bin]) * 0.45;
  let sum = 0;
  for (let i = 0; i < out.length; i++) sum += out[i];
  if (sum < 1e-8) {
    out.fill(0);
    out[5] = 1;
    return;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
}

const sleep = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function analyzeMix(input: AnalyzeInput): Promise<Analysis> {
  const { mid, side, sampleRate, sourceDuration, truncated } = input;
  const report = input.onProgress ?? (() => {});
  if (mid.length < FFT_SIZE * 2) {
    throw new Error("ไฟล์สั้นเกินไป — ลองคลิปที่ยาวอย่างน้อยสองวินาที");
  }

  const window = hann(FFT_SIZE);
  const frameCount = Math.floor((mid.length - FFT_SIZE) / HOP) + 1;
  const spec = new Float32Array(frameCount * BINS);
  const centerU = new Uint8Array(frameCount * BINS);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const reS = new Float32Array(FFT_SIZE);
  const imS = new Float32Array(FFT_SIZE);
  const frameRms = new Float32Array(frameCount);

  report("spectro", 0.02);
  for (let t = 0; t < frameCount; t++) {
    const start = t * HOP;
    let energy = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const sMid = mid[start + i] ?? 0;
      const sSide = side[start + i] ?? 0;
      re[i] = sMid * window[i];
      im[i] = 0;
      reS[i] = sSide * window[i];
      imS[i] = 0;
      energy += sMid * sMid;
    }
    frameRms[t] = Math.sqrt(energy / FFT_SIZE);
    fft(re, im, false);
    fft(reS, imS, false);
    const base = t * BINS;
    for (let k = 0; k < BINS; k++) {
      const m = Math.hypot(re[k], im[k]);
      const s = Math.hypot(reS[k], imS[k]);
      spec[base + k] = m;
      centerU[base + k] = Math.max(0, Math.min(255, Math.round((255 * m) / (m + s + 1e-8))));
    }
    if (t % 80 === 0) {
      report("spectro", 0.04 + (0.28 * t) / frameCount);
      await sleep();
    }
  }

  report("separate", 0.34);
  const harmF = new Float32Array(spec.length);
  const percF = new Float32Array(spec.length);
  medianInto(spec, frameCount, BINS, true, 15, harmF);
  await sleep();
  report("separate", 0.42);
  medianInto(spec, frameCount, BINS, false, 17, percF);
  const harmMask = new Uint8Array(spec.length);
  let harmEnergy = 0;
  let percEnergy = 0;
  let lowEnergy = 0;
  let totalEnergy = 0;
  let centroidNum = 0;
  for (let i = 0; i < spec.length; i++) {
    const h = harmF[i];
    const p = percF[i];
    const h2 = h * h;
    const p2 = p * p;
    const mask = h2 / (h2 + p2 + 1e-8);
    harmMask[i] = Math.max(0, Math.min(255, Math.round(mask * 255)));
    const mag = spec[i];
    harmEnergy += mag * mask;
    percEnergy += mag * (1 - mask);
    totalEnergy += mag;
    const bin = i % BINS;
    const freq = (bin * sampleRate) / FFT_SIZE;
    centroidNum += freq * mag;
    if (freq < 280) lowEnergy += mag * mask;
  }
  harmF.fill(0);
  percF.fill(0);

  report("chords", 0.5);
  const frameChroma = new Float32Array(frameCount * 12);
  const meanChroma = new Float32Array(12);
  for (let t = 0; t < frameCount; t++) {
    const base = t * BINS;
    const row = t * 12;
    for (let k = 1; k < BINS; k++) {
      const freq = (k * sampleRate) / FFT_SIZE;
      if (freq < 55 || freq > 4200) continue;
      const mag = spec[base + k] * (harmMask[base + k] / 255);
      if (mag <= 1e-7) continue;
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      const w = Math.log1p(mag) * (freq < 220 ? 1.8 : 1);
      frameChroma[row + pc] += w;
      meanChroma[pc] += w;
    }
  }

  const flux = new Float32Array(frameCount);
  const prev = new Float32Array(BINS);
  for (let t = 0; t < frameCount; t++) {
    const base = t * BINS;
    let fsum = 0;
    for (let k = 0; k < BINS; k++) {
      const p = spec[base + k] * (1 - harmMask[base + k] / 255);
      const d = p - prev[k];
      if (d > 0) fsum += d;
      prev[k] = p;
    }
    flux[t] = fsum;
  }
  smoothInPlace(flux, 2);
  const hopSec = HOP / sampleRate;
  const tempo = estimateTempo(flux, hopSec);
  const beats = estimateBeats(flux, hopSec, tempo.bpm);
  const chords = chordTrack(frameChroma, frameCount, hopSec, beats, tempo.confidence);
  const key = estimateKey(meanChroma);

  const melody: { time: number; midi: number }[] = [];
  const melodyStep = Math.max(1, Math.round(0.12 / hopSec));
  for (let t = 0; t < frameCount; t += melodyStep) {
    const base = t * BINS;
    let best = 0;
    let bestK = -1;
    let count = 0;
    let medianScratch = 0;
    const lo = Math.max(1, Math.floor((110 * FFT_SIZE) / sampleRate));
    const hi = Math.min(BINS - 1, Math.floor((1600 * FFT_SIZE) / sampleRate));
    const vals: number[] = [];
    for (let k = lo; k <= hi; k++) {
      const mag = spec[base + k] * (harmMask[base + k] / 255);
      vals.push(mag);
      if (mag > best) {
        best = mag;
        bestK = k;
      }
    }
    vals.sort((a, b) => a - b);
    medianScratch = vals[vals.length >> 1] ?? 0;
    count = vals.length;
    if (bestK > 0 && count > 0 && best > medianScratch * 4 && best > 1e-4) {
      const freq = (bestK * sampleRate) / FFT_SIZE;
      melody.push({ time: t * hopSec, midi: 69 + 12 * Math.log2(freq / 440) });
    }
  }

  const meters = buildMeters({
    frameRms,
    harmEnergy,
    percEnergy,
    lowEnergy,
    totalEnergy,
    centroidNum,
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
  });

  report("stems", 0.62);
  const shapes = buildShapes(sampleRate);
  const stems = STEM_IDS.map(() => new Float32Array(mid.length));
  const weight = new Float32Array(mid.length);
  const savedRe = new Float32Array(FFT_SIZE);
  const savedIm = new Float32Array(FFT_SIZE);
  const mask = new Float32Array(STEM_IDS.length);
  const envBuckets = 160;
  const envelopes = STEM_IDS.map(() => new Float32Array(envBuckets));

  for (let t = 0; t < frameCount; t++) {
    const start = t * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = mid[start + i] ?? 0;
      re[i] = s * window[i];
      im[i] = 0;
    }
    fft(re, im, false);
    savedRe.set(re);
    savedIm.set(im);
    const base = t * BINS;
    for (let s = 0; s < STEM_IDS.length; s++) {
      for (let k = 0; k < BINS; k++) {
        const harm = harmMask[base + k] / 255;
        const center = centerU[base + k] / 255;
        fillMasks(harm, center, shapes, k, mask);
        const m = mask[s];
        re[k] = savedRe[k] * m;
        im[k] = savedIm[k] * m;
        if (k > 0 && k < FFT_SIZE / 2) {
          re[FFT_SIZE - k] = savedRe[FFT_SIZE - k] * m;
          im[FFT_SIZE - k] = savedIm[FFT_SIZE - k] * m;
        }
      }
      fft(re, im, true);
      const stem = stems[s];
      const env = envelopes[s];
      for (let i = 0; i < FFT_SIZE; i++) {
        const idx = start + i;
        if (idx >= stem.length) break;
        const sample = re[i] * window[i];
        stem[idx] += sample;
        if (s === 0) weight[idx] += window[i] * window[i];
        const bucket = Math.min(envBuckets - 1, Math.floor((idx / stem.length) * envBuckets));
        const a = Math.abs(sample);
        if (a > env[bucket]) env[bucket] = a;
      }
    }
    if (t % 24 === 0) {
      report("stems", 0.62 + (0.34 * t) / frameCount);
      await sleep();
    }
  }

  for (let s = 0; s < stems.length; s++) {
    const stem = stems[s];
    for (let i = 0; i < stem.length; i++) {
      const w = weight[i];
      if (w > 1e-6) stem[i] /= w;
    }
    normalizeEnvelope(envelopes[s]);
  }

  let vocalRms = 0;
  let mixRms = 0;
  const vocal = stems[0];
  for (let i = 0; i < vocal.length; i += 8) {
    vocalRms += vocal[i] * vocal[i];
    mixRms += mid[i] * mid[i];
  }
  meters.vocal = clamp(Math.sqrt(vocalRms / (mixRms + 1e-8)) / 0.72);

  const tags = buildTags(meters, key, tempo.bpm);
  const sections = buildSections(frameRms, flux, hopSec);
  const spectro = buildSpectro(spec, frameCount, sampleRate);

  report("stems", 1);

  return {
    sampleRate,
    duration: mid.length / sampleRate,
    sourceDuration,
    truncated,
    stems: STEM_IDS.map((id, i) => ({ id, samples: stems[i], envelope: envelopes[i] })),
    spectro,
    chords,
    key,
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
    beats,
    meters,
    tags,
    sections,
    melody,
  };
}

function normalizeEnvelope(env: Float32Array): void {
  let max = 1e-6;
  for (let i = 0; i < env.length; i++) if (env[i] > max) max = env[i];
  for (let i = 0; i < env.length; i++) env[i] /= max;
}

function smoothInPlace(data: Float32Array, radius: number): void {
  const copy = data.slice();
  for (let i = 0; i < data.length; i++) {
    let s = 0;
    let c = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= data.length) continue;
      s += copy[j];
      c++;
    }
    data[i] = s / c;
  }
}

function estimateTempo(flux: Float32Array, hopSec: number): { bpm: number; confidence: number } {
  let mean = 0;
  for (let i = 0; i < flux.length; i++) mean += flux[i];
  mean /= Math.max(1, flux.length);
  const env = new Float32Array(flux.length);
  let peak = 1e-8;
  for (let i = 0; i < flux.length; i++) {
    const v = Math.max(0, flux[i] - mean);
    env[i] = v;
    if (v > peak) peak = v;
  }
  for (let i = 0; i < env.length; i++) env[i] /= peak;

  const minBpm = 68;
  const maxBpm = 186;
  const minLag = Math.max(2, Math.round(60 / maxBpm / hopSec));
  const maxLag = Math.min(env.length - 2, Math.round(60 / minBpm / hopSec));
  let bestLag = minLag;
  let best = -1;
  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    let n = 0;
    for (let i = 0; i + lag < env.length; i += 1) {
      acc += env[i] * env[i + lag];
      n++;
    }
    const score = acc / Math.max(1, n);
    scores.push(score);
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  scores.sort((a, b) => a - b);
  const median = scores[scores.length >> 1] ?? 0;
  let bpm = 60 / (bestLag * hopSec);
  const candidates = [bpm / 2, bpm, bpm * 2].filter((v) => v >= 70 && v <= 180);
  let chosen = bpm;
  let chosenScore = -1;
  for (const cand of candidates) {
    const lag = Math.round(60 / cand / hopSec);
    let acc = 0;
    let n = 0;
    for (let i = 0; i + lag < env.length; i++) {
      acc += env[i] * env[i + lag];
      n++;
    }
    let score = acc / Math.max(1, n);
    if (cand >= 84 && cand <= 148) score *= 1.08;
    if (score > chosenScore) {
      chosenScore = score;
      chosen = 60 / (lag * hopSec);
    }
  }
  bpm = Math.round(chosen);
  const confidence = clamp((best - median) / (best + 1e-6));
  return { bpm, confidence };
}

function estimateBeats(flux: Float32Array, hopSec: number, bpm: number): number[] {
  const period = 60 / Math.max(40, bpm);
  const steps = 48;
  let bestPhase = 0;
  let bestScore = -1;
  const dur = flux.length * hopSec;
  for (let s = 0; s < steps; s++) {
    const phase = (period * s) / steps;
    let score = 0;
    for (let t = phase; t < dur; t += period) {
      const idx = Math.min(flux.length - 1, Math.max(0, Math.round(t / hopSec)));
      score += flux[idx];
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }
  const beats: number[] = [];
  for (let t = bestPhase; t < dur - 0.02; t += period) beats.push(t);
  return beats;
}

function scoreTemplates(chroma: Float32Array): { root: number; suffix: string; score: number } {
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
  norm = Math.sqrt(norm) + 1e-8;
  let best = { root: 0, suffix: "", score: -1 };
  for (let root = 0; root < 12; root++) {
    for (const q of QUALITIES) {
      let dot = 0;
      let tn = 0;
      const weight = 1 / q.tones.length;
      for (const tone of q.tones) {
        const pc = (root + tone) % 12;
        dot += (chroma[pc] / norm) * weight;
        tn += weight * weight;
      }
      const score = (dot / Math.sqrt(tn)) * q.bias;
      if (score > best.score) best = { root, suffix: q.suffix, score };
    }
  }
  return best;
}

function chordTrack(
  frameChroma: Float32Array,
  frameCount: number,
  hopSec: number,
  beats: number[],
  bpmConfidence: number,
): ChordEvent[] {
  const windows: { a: number; b: number; time: number; duration: number }[] = [];
  if (bpmConfidence > 0.28 && beats.length > 3) {
    for (let i = 0; i + 2 < beats.length; i += 2) {
      const t0 = beats[i];
      const t1 = beats[Math.min(beats.length - 1, i + 2)];
      const a = Math.max(0, Math.min(frameCount - 1, Math.floor(t0 / hopSec)));
      const b = Math.max(a + 1, Math.min(frameCount, Math.floor(t1 / hopSec)));
      windows.push({ a, b, time: t0, duration: Math.max(hopSec, t1 - t0) });
    }
    const lastBeat = beats[beats.length - 1];
    const end = frameCount * hopSec;
    if (end - lastBeat > 0.35) {
      const a = Math.max(0, Math.floor(lastBeat / hopSec));
      windows.push({ a, b: frameCount, time: lastBeat, duration: end - lastBeat });
    }
  } else {
    const win = Math.max(2, Math.round(0.85 / hopSec));
    for (let a = 0; a < frameCount; a += win) {
      const b = Math.min(frameCount, a + win);
      windows.push({ a, b, time: a * hopSec, duration: (b - a) * hopSec });
    }
  }

  const raw: ChordEvent[] = [];
  let prevSymbol = "";
  let prevRoot = -1;
  let prevSuffix = "";
  for (const w of windows) {
    const chroma = new Float32Array(12);
    for (let t = w.a; t < w.b; t++) {
      for (let p = 0; p < 12; p++) chroma[p] += frameChroma[t * 12 + p];
    }
    const best = scoreTemplates(chroma);
    let root = best.root;
    let suffix = best.suffix;
    let score = best.score;
    if (prevSymbol && score < 0.72) {
      const kept = new Float32Array(12);
      kept.set(chroma);
      const alt = scoreTemplates(kept);
      if (alt.suffix === prevSuffix && alt.root === prevRoot && alt.score > score * 0.9) {
        root = prevRoot;
        suffix = prevSuffix;
        score = alt.score;
      }
    }
    const symbol = score < 0.55 ? "N.C." : SHARP[root] + suffix;
    if (symbol === "N.C.") {
      root = -1;
      suffix = "";
    }
    raw.push({
      time: w.time,
      duration: w.duration,
      symbol,
      root,
      suffix,
      confidence: clamp(score),
    });
    if (symbol !== "N.C.") {
      prevSymbol = symbol;
      prevRoot = root;
      prevSuffix = suffix;
    }
  }

  const merged: ChordEvent[] = [];
  for (const event of raw) {
    const last = merged[merged.length - 1];
    if (last && last.symbol === event.symbol) {
      last.duration = event.time + event.duration - last.time;
      last.confidence = Math.max(last.confidence, event.confidence);
    } else {
      merged.push({ ...event });
    }
  }
  for (let i = 1; i < merged.length - 1; i++) {
    const cur = merged[i];
    if (cur.duration >= 0.55 || cur.symbol === "N.C.") continue;
    if (merged[i - 1].symbol === merged[i + 1].symbol) {
      merged[i].symbol = merged[i - 1].symbol;
      merged[i].root = merged[i - 1].root;
      merged[i].suffix = merged[i - 1].suffix;
    }
  }
  const folded: ChordEvent[] = [];
  for (const event of merged) {
    const last = folded[folded.length - 1];
    if (last && last.symbol === event.symbol) {
      last.duration = event.time + event.duration - last.time;
      last.confidence = Math.max(last.confidence, event.confidence);
    } else folded.push({ ...event });
  }
  if (folded.length > 0) {
    const first = folded[0];
    first.duration += first.time;
    first.time = 0;
    const end = frameCount * hopSec;
    const last = folded[folded.length - 1];
    last.duration = Math.max(0.05, end - last.time);
  }
  if (folded.length > 1 && folded[folded.length - 1].duration < 0.95) {
    const tail = folded.pop();
    if (tail) folded[folded.length - 1].duration += tail.duration;
  }
  return tidyPassing(folded);
}

function tidyPassing(events: ChordEvent[]): ChordEvent[] {
  const copy = events.map((event) => ({ ...event }));
  for (let i = 0; i < copy.length; i++) {
    const cur = copy[i];
    if (cur.root < 0 || cur.duration >= 1.7) continue;
    const passing = cur.suffix === "sus2" || cur.suffix === "sus4" || cur.suffix === "maj7" || cur.suffix === "m7" || cur.suffix === "7";
    if (!passing) continue;
    const neighbor = [copy[i - 1], copy[i + 1]].find(
      (item) => item && item.root === cur.root && (item.suffix === "" || item.suffix === "m"),
    );
    if (!neighbor) continue;
    cur.suffix = neighbor.suffix;
    cur.symbol = neighbor.symbol;
  }
  const merged: ChordEvent[] = [];
  for (const event of copy) {
    const last = merged[merged.length - 1];
    if (last && last.symbol === event.symbol) {
      last.duration = event.time + event.duration - last.time;
      last.confidence = Math.max(last.confidence, event.confidence);
    } else merged.push(event);
  }
  return merged;
}

function estimateKey(chroma: Float32Array): Analysis["key"] {
  let best: { tonicPc: number; mode: "major" | "minor"; confidence: number } = {
    tonicPc: 0,
    mode: "major",
    confidence: -2,
  };
  let runner = -2;
  for (const mode of ["major", "minor"] as const) {
    const profile = mode === "major" ? MAJOR : MINOR;
    for (let tonic = 0; tonic < 12; tonic++) {
      const rotated = new Float32Array(12);
      for (let i = 0; i < 12; i++) rotated[i] = profile[(i - tonic + 12) % 12];
      const score = pearson(chroma, rotated);
      if (score > best.confidence) {
        runner = best.confidence;
        best = { tonicPc: tonic, mode, confidence: score };
      } else if (score > runner) runner = score;
    }
  }
  const span = Math.max(0.05, best.confidence - runner);
  return { ...best, confidence: clamp(0.45 + span * 1.4) };
}

function pearson(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return num / Math.sqrt(da * db + 1e-12);
}

function buildMeters(args: {
  frameRms: Float32Array;
  harmEnergy: number;
  percEnergy: number;
  lowEnergy: number;
  totalEnergy: number;
  centroidNum: number;
  bpm: number;
  bpmConfidence: number;
}): Analysis["meters"] {
  const rmsSorted = Array.from(args.frameRms).sort((a, b) => a - b);
  const avg = rmsSorted.reduce((s, v) => s + v, 0) / Math.max(1, rmsSorted.length);
  const p20 = rmsSorted[Math.floor(rmsSorted.length * 0.2)] ?? 0;
  const p90 = rmsSorted[Math.floor(rmsSorted.length * 0.9)] ?? avg;
  const energy = clamp(avg / 0.16);
  const centroid = args.centroidNum / (args.totalEnergy + 1e-8);
  const brightness = clamp((centroid - 500) / 3800);
  const warmth = clamp((args.lowEnergy / (args.harmEnergy + 1e-8)) * 2.4);
  const percRatio = args.percEnergy / (args.harmEnergy + args.percEnergy + 1e-8);
  const tempoScore = args.bpm >= 96 && args.bpm <= 130 ? 1 : args.bpm >= 84 && args.bpm <= 150 ? 0.62 : 0.28;
  const dance = clamp(0.42 * args.bpmConfidence + 0.38 * tempoScore + 0.2 * clamp(percRatio * 1.6));
  const dynamic = clamp((p90 - p20) / (p90 + 1e-6));
  return { energy, brightness, warmth, dance, vocal: 0, dynamic };
}

function buildTags(
  meters: Analysis["meters"],
  key: Analysis["key"],
  bpm: number,
): Analysis["tags"] {
  let mood = "บาลานซ์";
  let moodDetail = "พลังงานและคีย์อยู่ตรงกลาง";
  if (key.mode === "major" && meters.energy > 0.58 && bpm >= 100) {
    mood = "สดใส ขยับได้";
    moodDetail = "เมเจอร์ จังหวะไม่ช้า และพลังงานสูง";
  } else if (key.mode === "minor" && meters.energy < 0.42) {
    mood = "มืดและช้า";
    moodDetail = "ไมเนอร์กับพลังงานต่ำ";
  } else if (key.mode === "minor" && meters.energy >= 0.58) {
    mood = "ดาร์กแต่มีแรง";
    moodDetail = "ไมเนอร์ที่ยังดันจังหวะอยู่";
  } else if (meters.warmth > 0.58 && meters.energy < 0.62) {
    mood = "อบอุ่น ฟังสบาย";
    moodDetail = "ความถี่ต่ำแน่นกว่าเสียงแหลม";
  }
  const tags: Analysis["tags"] = [
    { id: "mood", label: mood, detail: moodDetail },
    {
      id: "energy",
      label: meters.energy > 0.66 ? "พลังงานสูง" : meters.energy < 0.38 ? "พลังงานต่ำ" : "พลังงานกลาง",
      detail: "จากความดังเฉลี่ยของทั้งเพลง",
    },
    {
      id: "tone",
      label: meters.brightness > 0.62 ? "โทนสว่าง" : meters.brightness < 0.38 ? "โทนมืด" : "โทนกลาง",
      detail: meters.warmth > 0.55 ? "มีน้ำหนักย่านต่ำ" : "โปร่ง ไม่อ้วนที่เบส",
    },
    {
      id: "dance",
      label: meters.dance > 0.62 ? "จังหวะเต้นได้" : "ไม่เน้นแดนซ์",
      detail: `${bpm} BPM และความสม่ำเสมอของจังหวะ`,
    },
    {
      id: "vocal",
      label: meters.vocal > 0.32 ? "เสียงกลางชัด" : "เครื่องดนตรีนำ",
      detail: "สัดส่วนเลนร้องต่อมิกซ์กลางสนาม",
    },
  ];
  if (meters.dynamic > 0.55) {
    tags.push({ id: "dyn", label: "ไดนามิกกว้าง", detail: "มีทั้งท่อนเบาและท่อนดังชัด" });
  }
  return tags;
}

function buildSections(frameRms: Float32Array, flux: Float32Array, hopSec: number): Analysis["sections"] {
  const chunk = Math.max(4, Math.round(4 / hopSec));
  const rmsHi = percentile(frameRms, 0.72);
  const rmsLo = percentile(frameRms, 0.35);
  const fluxHi = percentile(flux, 0.7);
  const slices: { time: number; duration: number; label: string }[] = [];
  for (let a = 0; a < frameRms.length; a += chunk) {
    const b = Math.min(frameRms.length, a + chunk);
    let rms = 0;
    let perc = 0;
    for (let i = a; i < b; i++) {
      rms += frameRms[i];
      perc += flux[i];
    }
    const n = Math.max(1, b - a);
    rms /= n;
    perc /= n;
    let label = "ท่อนดำเนิน";
    const quietCut = Math.min(rmsLo, (rmsLo + rmsHi) / 2);
    if (rmsHi > rmsLo * 1.25 && rms < quietCut * 0.9) label = "ช่วงเบา";
    else if (rms >= rmsHi * 0.97 && perc >= fluxHi * 0.8) label = "ท่อนแน่น";
    else if (perc >= fluxHi * 1.05) label = "ท่อนยก";
    slices.push({ time: a * hopSec, duration: (b - a) * hopSec, label });
  }
  const merged: Analysis["sections"] = [];
  for (const slice of slices) {
    const last = merged[merged.length - 1];
    if (last && last.label === slice.label) last.duration += slice.duration;
    else merged.push({ ...slice });
  }
  return merged;
}

function percentile(data: Float32Array, p: number): number {
  const copy = Array.from(data).sort((a, b) => a - b);
  const idx = Math.min(copy.length - 1, Math.max(0, Math.floor(p * (copy.length - 1))));
  return copy[idx] ?? 0;
}

function buildSpectro(spec: Float32Array, frameCount: number, sampleRate: number): Analysis["spectro"] {
  const cols = Math.min(220, frameCount);
  const rows = 72;
  const values = new Uint8Array(cols * rows);
  const fLo = Math.log(50);
  const fHi = Math.log(Math.min(10000, sampleRate / 2));
  let max = 1e-6;
  const grid = new Float32Array(cols * rows);
  for (let c = 0; c < cols; c++) {
    const t0 = Math.floor((c / cols) * frameCount);
    const t1 = Math.max(t0 + 1, Math.floor(((c + 1) / cols) * frameCount));
    for (let r = 0; r < rows; r++) {
      const freq = Math.exp(fLo + ((rows - 1 - r) / (rows - 1)) * (fHi - fLo));
      const k = Math.min(BINS - 1, Math.max(0, Math.round((freq * FFT_SIZE) / sampleRate)));
      let acc = 0;
      let n = 0;
      for (let t = t0; t < t1; t++) {
        acc += spec[t * BINS + k];
        n++;
      }
      const v = Math.log1p(acc / Math.max(1, n));
      grid[c * rows + r] = v;
      if (v > max) max = v;
    }
  }
  for (let i = 0; i < grid.length; i++) values[i] = Math.round((grid[i] / max) * 255);
  return { cols, rows, values };
}

function clamp(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function resampleLinear(input: Float32Array, fromSr: number, toSr: number): Float32Array {
  if (fromSr === toSr) return new Float32Array(input);
  const outLen = Math.max(1, Math.floor((input.length * toSr) / fromSr));
  const out = new Float32Array(outLen);
  const ratio = fromSr / toSr;
  const last = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i0 = Math.min(last, Math.floor(x));
    const i1 = Math.min(last, i0 + 1);
    const frac = x - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

export function waveformPeaks(samples: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets);
  if (samples.length === 0) return out;
  const size = samples.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const a = Math.floor(i * size);
    const b = Math.min(samples.length, Math.max(a + 1, Math.floor((i + 1) * size)));
    let m = 0;
    for (let j = a; j < b; j++) {
      const v = Math.abs(samples[j]);
      if (v > m) m = v;
    }
    out[i] = m;
  }
  return out;
}

export { ANALYSIS_SR };
export type { StemId };
