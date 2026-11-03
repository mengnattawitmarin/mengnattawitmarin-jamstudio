import { analyzeMix, resampleLinear, waveformPeaks } from "@/lib/audio/engine";
import { ANALYSIS_SR, MAX_SECONDS } from "@/lib/audio/stems";
import type { Analysis } from "@/lib/audio/types";

export type Prepared = {
  analysis: Analysis;
  peaks: Float32Array;
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
};

const STAGES: Record<string, string> = {
  spectro: "อ่านสเปกตรัมของเพลง",
  separate: "แยกเสียงกลมออกจากจังหวะ",
  chords: "แกะคอร์ด คีย์ และบีพีเอ็ม",
  stems: "เรนเดอร์เลนเสียง",
};

export async function analyzeChannels(
  leftIn: Float32Array,
  rightIn: Float32Array,
  sampleRate: number,
  onProgress: (label: string, ratio: number) => void,
): Promise<Prepared> {
  const maxFrames = Math.floor(MAX_SECONDS * sampleRate);
  const truncated = leftIn.length > maxFrames;
  const length = Math.min(leftIn.length, maxFrames);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  left.set(leftIn.subarray(0, length));
  right.set(rightIn.subarray(0, length));
  const mid = new Float32Array(length);
  const side = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    mid[i] = 0.5 * (left[i] + right[i]);
    side[i] = 0.5 * (left[i] - right[i]);
  }
  onProgress("ย่อความละเอียดสำหรับแยกเลน", 0.01);
  const midR = resampleLinear(mid, sampleRate, ANALYSIS_SR);
  const sideR = resampleLinear(side, sampleRate, ANALYSIS_SR);
  const peaks = waveformPeaks(mid, 960);

  try {
    const analysis = await runWorker(midR, sideR, left.length / sampleRate, truncated, onProgress);
    return { analysis, peaks, left, right, sampleRate };
  } catch (error) {
    console.warn("worker failed, analyzing on the main thread", error);
    const analysis = await analyzeMix({
      mid: midR,
      side: sideR,
      sampleRate: ANALYSIS_SR,
      sourceDuration: left.length / sampleRate,
      truncated,
      onProgress: (stage, ratio) => onProgress(STAGES[stage] ?? stage, ratio),
    });
    return { analysis, peaks, left, right, sampleRate };
  }
}

function runWorker(
  mid: Float32Array,
  side: Float32Array,
  sourceDuration: number,
  truncated: boolean,
  onProgress: (label: string, ratio: number) => void,
): Promise<Analysis> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      reject(error);
      return;
    }
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("การวิเคราะห์ใช้เวลานานเกินไป"));
    }, 180_000);
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: "progress"; stage: string; ratio: number }
        | { type: "done"; result: Analysis }
        | { type: "error"; message: string };
      if (data.type === "progress") {
        onProgress(STAGES[data.stage] ?? data.stage, data.ratio);
        return;
      }
      window.clearTimeout(timer);
      worker.terminate();
      if (data.type === "error") reject(new Error(data.message));
      else resolve(data.result);
    };
    worker.onerror = (event) => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message || "วิเคราะห์ไม่สำเร็จ"));
    };
    worker.postMessage(
      { type: "analyze", mid, side, sampleRate: ANALYSIS_SR, sourceDuration, truncated },
      [mid.buffer, side.buffer],
    );
  });
}
