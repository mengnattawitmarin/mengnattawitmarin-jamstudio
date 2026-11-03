import { stretchChannels } from "./stretch";

let worker: Worker | null = null;
let seq = 0;

/** Run WSOLA off the main thread; falls back to the main thread if workers fail. */
export function stretchBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  rate: number,
  semitones: number,
  onProgress?: (ratio: number) => void,
): Promise<AudioBuffer> {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(new Float32Array(buffer.getChannelData(c)));
  const id = ++seq;
  const toBuffer = (data: Float32Array[]) => {
    const out = ctx.createBuffer(data.length, Math.max(1, data[0].length), buffer.sampleRate);
    data.forEach((ch, c) => out.copyToChannel(ch as Float32Array<ArrayBuffer>, c));
    return out;
  };
  return new Promise((resolve, reject) => {
    try {
      worker ??= new Worker(new URL("./stretch.worker.ts", import.meta.url), { type: "module" });
    } catch {
      worker = null;
    }
    if (!worker) {
      try {
        resolve(toBuffer(stretchChannels({ channels, sampleRate: buffer.sampleRate, rate, semitones }, onProgress)));
      } catch (error) {
        reject(error);
      }
      return;
    }
    const w = worker;
    const onMessage = (event: MessageEvent<{ type: string; id: number; ratio?: number; channels?: Float32Array[]; message?: string }>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") onProgress?.(msg.ratio ?? 0);
      else if (msg.type === "done" && msg.channels) {
        w.removeEventListener("message", onMessage);
        resolve(toBuffer(msg.channels));
      } else if (msg.type === "error") {
        w.removeEventListener("message", onMessage);
        reject(new Error(msg.message ?? "stretch failed"));
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage(
      { type: "stretch", id, channels, sampleRate: buffer.sampleRate, rate, semitones },
      channels.map((ch) => ch.buffer),
    );
  });
}
