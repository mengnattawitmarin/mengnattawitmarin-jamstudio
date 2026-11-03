import type { ChordEvent } from "@/lib/audio/types";

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const SOLFEGE = ["โด", "โด♯", "เร", "เร♯", "มี", "ฟา", "ฟา♯", "ซอล", "ซอล♯", "ลา", "ลา♯", "ที"] as const;

const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]);
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]);

export function preferFlats(tonicPc: number, mode: "major" | "minor"): boolean {
  return mode === "major" ? FLAT_MAJOR.has(tonicPc) : FLAT_MINOR.has(tonicPc);
}

export function formatPc(pc: number, flats: boolean): string {
  const i = ((pc % 12) + 12) % 12;
  return flats ? FLAT[i] : SHARP[i];
}

export function solfege(pc: number): string {
  return SOLFEGE[((pc % 12) + 12) % 12];
}

export function chordIntervals(suffix: string): number[] {
  switch (suffix) {
    case "m":
      return [0, 3, 7];
    case "dim":
      return [0, 3, 6];
    case "aug":
      return [0, 4, 8];
    case "sus2":
      return [0, 2, 7];
    case "sus4":
      return [0, 5, 7];
    case "7":
      return [0, 4, 7, 10];
    case "maj7":
      return [0, 4, 7, 11];
    case "m7":
      return [0, 3, 7, 10];
    default:
      return [0, 4, 7];
  }
}

export function scalePcs(mode: "major" | "minor"): number[] {
  return mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
}

export function spellChord(root: number, suffix: string, flats: boolean): string {
  if (root < 0) return "N.C.";
  return formatPc(root, flats) + suffix;
}

export function shiftChord(chord: ChordEvent, semis: number, flats: boolean): ChordEvent {
  if (chord.root < 0 || semis === 0) {
    if (chord.root < 0) return chord;
    return { ...chord, symbol: spellChord(chord.root, chord.suffix, flats) };
  }
  const root = (chord.root + semis + 120) % 12;
  return { ...chord, root, symbol: spellChord(root, chord.suffix, flats) };
}

const DEGREE_MAJ: Record<number, string> = {
  0: "I",
  2: "ii",
  4: "iii",
  5: "IV",
  7: "V",
  9: "vi",
  11: "vii",
};

const DEGREE_MIN: Record<number, string> = {
  0: "i",
  2: "ii",
  3: "III",
  5: "iv",
  7: "v",
  8: "VI",
  10: "VII",
  11: "vii",
};

export function degreeLabel(
  root: number,
  suffix: string,
  tonicPc: number,
  mode: "major" | "minor",
): string {
  if (root < 0) return "—";
  const rel = (root - tonicPc + 12) % 12;
  const base = (mode === "major" ? DEGREE_MAJ : DEGREE_MIN)[rel];
  if (!base) return "·";
  if (suffix === "7" || suffix === "maj7" || suffix === "m7") return `${base}7`;
  if (suffix === "sus4" || suffix === "sus2") return `${base}sus`;
  return base;
}

const OPEN_SHAPES: { pc: number; mode: "major" | "minor"; name: string }[] = [
  { pc: 9, mode: "minor", name: "Am" },
  { pc: 4, mode: "minor", name: "Em" },
  { pc: 2, mode: "minor", name: "Dm" },
  { pc: 0, mode: "major", name: "C" },
  { pc: 7, mode: "major", name: "G" },
  { pc: 2, mode: "major", name: "D" },
  { pc: 9, mode: "major", name: "A" },
  { pc: 4, mode: "major", name: "E" },
];

export function capoSuggestion(
  tonicPc: number,
  mode: "major" | "minor",
): { capo: number; shape: string } {
  let best = { capo: 0, shape: spellChord(tonicPc, mode === "minor" ? "m" : "", preferFlats(tonicPc, mode)), rank: 99 };
  for (const shape of OPEN_SHAPES) {
    if (shape.mode !== mode) continue;
    const capo = (tonicPc - shape.pc + 12) % 12;
    const rank = capo === 0 ? -1 : capo <= 7 ? capo : capo + 5;
    if (rank < best.rank) best = { capo, shape: shape.name, rank };
  }
  return { capo: best.capo, shape: best.shape };
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function modeLabel(mode: "major" | "minor"): string {
  return mode === "major" ? "เมเจอร์" : "ไมเนอร์";
}
