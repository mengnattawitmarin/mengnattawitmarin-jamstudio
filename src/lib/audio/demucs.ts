/**
 * HT-Demucs 6-stem (MIT, Meta) chunking maths — pure, no DOM, unit-tested.
 * The ONNX export takes exactly SEGMENT stereo samples at 44.1 kHz and
 * returns 6 stems. We follow demucs `apply_model`: normalise the track by
 * its mono mean/std, cut 25%-overlapping segments, weight each segment with
 * a triangular window, overlap-add, divide by the summed weights, de-normalise.
 */
export const DEMUCS_SR = 44100;
export const SEGMENT = 343980; // 7.8 s
export const OVERLAP = 0.25;
export const AI_STEMS = ["drums", "bass", "other", "vocals", "guitar", "piano"] as const;
export type AiStemId = (typeof AI_STEMS)[number];

export const AI_STEM_LABELS: Record<AiStemId, { name: string; en: string }> = {
  vocals: { name: "เสียงร้อง", en: "Vocals" },
  drums: { name: "กลอง", en: "Drums" },
  bass: { name: "เบส", en: "Bass" },
  guitar: { name: "กีตาร์", en: "Guitar" },
  piano: { name: "คีย์บอร์ด / เปียโน", en: "Keys" },
  other: { name: "อื่นๆ", en: "Other" },
};

/** Default model: fp16-stored weights (~136 MB), downloaded once and cached. */
export const DEMUCS_MODEL_URL = "https://huggingface.co/StemSplitio/htdemucs-6s-onnx/resolve/main/htdemucs_6s_fp16weights.onnx";

/** Segment start offsets covering `length` samples. */
export function planChunks(length: number, segment: number = SEGMENT, overlap: number = OVERLAP): number[] {
  const stride = Math.max(1, Math.round(segment * (1 - overlap)));
  const out: number[] = [];
  for (let start = 0; start < length; start += stride) {
    out.push(start);
    if (start + segment >= length) break;
  }
  return out.length ? out : [0];
}

/** Triangular weight like demucs (1..peak..1), normalised to max 1. */
export function triangleWeight(segment: number = SEGMENT): Float32Array {
  const w = new Float32Array(segment);
  const half = Math.floor(segment / 2);
  for (let i = 0; i < segment; i++) w[i] = i < half ? i + 1 : segment - i;
  let max = 0;
  for (let i = 0; i < segment; i++) max = Math.max(max, w[i]);
  for (let i = 0; i < segment; i++) w[i] /= max;
  return w;
}

export function monoStats(left: Float32Array, right: Float32Array): { mean: number; std: number } {
  const n = left.length;
  if (!n) return { mean: 0, std: 1 };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (left[i] + right[i]) * 0.5;
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = (left[i] + right[i]) * 0.5 - mean;
    sq += d * d;
  }
  const std = Math.sqrt(sq / n);
  return { mean, std: std > 1e-8 ? std : 1 };
}

/** Build the model input [1, 2, SEGMENT] (normalised, zero-padded) for one chunk. */
export function chunkInput(left: Float32Array, right: Float32Array, start: number, stats: { mean: number; std: number }, segment: number = SEGMENT): Float32Array {
  const input = new Float32Array(2 * segment);
  const end = Math.min(left.length, start + segment);
  for (let i = start; i < end; i++) {
    input[i - start] = (left[i] - stats.mean) / stats.std;
    input[segment + i - start] = (right[i] - stats.mean) / stats.std;
  }
  return input;
}

/** Accumulates weighted chunk outputs into full-length stems. */
export class OverlapAdd {
  readonly stems: Float32Array[][]; // [stem][channel]
  private readonly weightSum: Float32Array;
  private readonly weight: Float32Array;
  private readonly length: number;
  private readonly segment: number;

  constructor(length: number, stemCount: number = AI_STEMS.length, segment: number = SEGMENT) {
    this.length = length;
    this.segment = segment;
    this.stems = Array.from({ length: stemCount }, () => [new Float32Array(length), new Float32Array(length)]);
    this.weightSum = new Float32Array(length);
    this.weight = triangleWeight(segment);
  }

  /** `out` is the model output [1, stems, 2, segment] flattened. */
  add(out: Float32Array, start: number) {
    const seg = this.segment;
    const end = Math.min(this.length, start + seg);
    for (let i = start; i < end; i++) this.weightSum[i] += this.weight[i - start];
    for (let s = 0; s < this.stems.length; s++) {
      for (let c = 0; c < 2; c++) {
        const dst = this.stems[s][c];
        const base = (s * 2 + c) * seg;
        for (let i = start; i < end; i++) dst[i] += out[base + i - start] * this.weight[i - start];
      }
    }
  }

  /** Divide by weights and undo normalisation. */
  finish(stats: { mean: number; std: number }): Float32Array[][] {
    for (const stem of this.stems) {
      for (const ch of stem) {
        for (let i = 0; i < this.length; i++) {
          const w = this.weightSum[i] || 1;
          ch[i] = (ch[i] / w) * stats.std + stats.mean / this.stems.length;
        }
      }
    }
    return this.stems;
  }
}
