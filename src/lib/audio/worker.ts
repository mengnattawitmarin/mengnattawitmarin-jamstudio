import { analyzeMix } from "./engine";

type Request = {
  type: "analyze";
  mid: Float32Array;
  side: Float32Array;
  sampleRate: number;
  sourceDuration: number;
  truncated: boolean;
};

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = (event) => {
  const data = event.data;
  if (!data || data.type !== "analyze") return;
  analyzeMix({
    mid: data.mid,
    side: data.side,
    sampleRate: data.sampleRate,
    sourceDuration: data.sourceDuration,
    truncated: data.truncated,
    onProgress: (stage, ratio) => {
      scope.postMessage({ type: "progress", stage, ratio });
    },
  })
    .then((result) => {
      const transfer: Transferable[] = [result.spectro.values.buffer];
      for (const stem of result.stems) {
        transfer.push(stem.samples.buffer, stem.envelope.buffer);
      }
      scope.postMessage({ type: "done", result }, transfer);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "วิเคราะห์ไม่สำเร็จ";
      scope.postMessage({ type: "error", message });
    });
};