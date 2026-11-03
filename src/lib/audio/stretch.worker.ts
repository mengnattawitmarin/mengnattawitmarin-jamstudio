import { stretchChannels, type StretchJob } from "./stretch";

type Request = { type: "stretch"; id: number } & StretchJob;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = (event) => {
  const data = event.data;
  if (!data || data.type !== "stretch") return;
  try {
    const result = stretchChannels(data, (ratio) => scope.postMessage({ type: "progress", id: data.id, ratio }));
    scope.postMessage(
      { type: "done", id: data.id, channels: result },
      result.map((ch) => ch.buffer),
    );
  } catch (error) {
    scope.postMessage({ type: "error", id: data.id, message: error instanceof Error ? error.message : "stretch failed" });
  }
};
