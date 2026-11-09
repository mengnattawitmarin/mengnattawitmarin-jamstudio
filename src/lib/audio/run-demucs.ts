import { AI_STEMS, DEMUCS_MODEL_URL, DEMUCS_SR, type AiStemId } from "./demucs";

export const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

export type DemucsProgress = { phase: "resample" | "download" | "load" | "separate"; ratio: number; detail?: string };
export type DemucsJob = {
  promise: Promise<{ stems: Map<AiStemId, AudioBuffer>; backend: string; seconds: number }>;
  cancel: () => void;
};

async function toStereo44k(buffer: AudioBuffer): Promise<{ left: Float32Array; right: Float32Array }> {
  if (buffer.sampleRate === DEMUCS_SR && buffer.numberOfChannels >= 2) {
    return { left: new Float32Array(buffer.getChannelData(0)), right: new Float32Array(buffer.getChannelData(1)) };
  }
  const length = Math.ceil(buffer.duration * DEMUCS_SR);
  const Offline = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const off = new Offline(2, length, DEMUCS_SR);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return { left: new Float32Array(out.getChannelData(0)), right: new Float32Array(out.getChannelData(1)) };
}

/** Separate a song into 6 stems with HT-Demucs on this device (worker + WebGPU/WASM). */
export function runDemucs(ctx: BaseAudioContext, buffer: AudioBuffer, onProgress: (p: DemucsProgress) => void): DemucsJob {
  let worker: Worker | null = null;
  let cancelled = false;
  const promise = (async () => {
    onProgress({ phase: "resample", ratio: 0 });
    const { left, right } = await toStereo44k(buffer);
    if (cancelled) throw new Error("cancelled");
    worker = new Worker(new URL("./demucs.worker.ts", import.meta.url), { type: "module" });
    const w = worker;
    return new Promise<{ stems: Map<AiStemId, AudioBuffer>; backend: string; seconds: number }>((resolve, reject) => {
      w.onmessage = (event: MessageEvent) => {
        const msg = event.data as
          | { type: "progress"; phase: "download" | "load" | "separate"; ratio: number; detail?: string }
          | { type: "done"; stems: Float32Array[][]; backend: string; seconds: number }
          | { type: "error"; message: string };
        if (msg.type === "progress") onProgress(msg);
        else if (msg.type === "error") {
          w.terminate();
          reject(new Error(msg.message));
        } else if (msg.type === "done") {
          w.terminate();
          const stems = new Map<AiStemId, AudioBuffer>();
          AI_STEMS.forEach((id, index) => {
            const [l, r] = msg.stems[index];
            const out = ctx.createBuffer(2, l.length, DEMUCS_SR);
            out.copyToChannel(l as Float32Array<ArrayBuffer>, 0);
            out.copyToChannel(r as Float32Array<ArrayBuffer>, 1);
            stems.set(id, out);
          });
          resolve({ stems, backend: msg.backend, seconds: msg.seconds });
        }
      };
      w.onerror = (event) => {
        w.terminate();
        reject(new Error(event.message || "worker error"));
      };
      w.postMessage({ type: "start", left, right, modelUrl: DEMUCS_MODEL_URL, ortBase: ORT_BASE }, [left.buffer, right.buffer]);
    });
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      worker?.terminate();
    },
  };
}
