import type { StemId } from "@/lib/audio/stems";

export type ChordEvent = {
  time: number;
  duration: number;
  symbol: string;
  root: number;
  suffix: string;
  confidence: number;
};

export type Analysis = {
  sampleRate: number;
  duration: number;
  sourceDuration: number;
  truncated: boolean;
  stems: { id: StemId; samples: Float32Array; envelope: Float32Array }[];
  spectro: { cols: number; rows: number; values: Uint8Array };
  chords: ChordEvent[];
  key: { tonicPc: number; mode: "major" | "minor"; confidence: number };
  bpm: number;
  bpmConfidence: number;
  beats: number[];
  meters: {
    energy: number;
    brightness: number;
    warmth: number;
    dance: number;
    vocal: number;
    dynamic: number;
  };
  tags: { id: string; label: string; detail: string }[];
  sections: { time: number; duration: number; label: string }[];
  melody: { time: number; midi: number }[];
};
