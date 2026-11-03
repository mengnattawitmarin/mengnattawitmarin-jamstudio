/** Instruments and tunings for the tuner. Strings are listed low → high as MIDI notes. */
export type Tuning = { id: string; name: string; notes: number[] };
export type TunerInstrument = { id: string; name: string; tunings: Tuning[] };

const n = (name: string): number => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as "C"];
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + base + acc;
};
const t = (id: string, name: string, notes: string) => ({ id, name, notes: notes.split(" ").map(n) });

export const TUNER_INSTRUMENTS: TunerInstrument[] = [
  {
    id: "guitar6",
    name: "กีตาร์ 6 สาย",
    tunings: [
      t("std", "Standard", "E2 A2 D3 G3 B3 E4"),
      t("half", "ลดครึ่งเสียง (Eb)", "Eb2 Ab2 Db3 Gb3 Bb3 Eb4"),
      t("full", "ลดหนึ่งเสียง (D)", "D2 G2 C3 F3 A3 D4"),
      t("dropd", "Drop D", "D2 A2 D3 G3 B3 E4"),
      t("dropcs", "Drop C#", "C#2 G#2 C#3 F#3 A#3 D#4"),
      t("dropc", "Drop C", "C2 G2 C3 F3 A3 D4"),
      t("dbld", "Double Drop D", "D2 A2 D3 G3 B3 D4"),
      t("dadgad", "DADGAD", "D2 A2 D3 G3 A3 D4"),
      t("openg", "Open G", "D2 G2 D3 G3 B3 D4"),
      t("opend", "Open D", "D2 A2 D3 F#3 A3 D4"),
      t("opene", "Open E", "E2 B2 E3 G#3 B3 E4"),
      t("openc", "Open C", "C2 G2 C3 G3 C4 E4"),
      t("opena", "Open A", "E2 A2 E3 A3 C#4 E4"),
      t("dmodal", "Open Dsus4", "D2 A2 D3 G3 A3 D4"),
      t("nashville", "Nashville", "E3 A3 D4 G4 B3 E4"),
    ],
  },
  {
    id: "guitar7",
    name: "กีตาร์ 7 สาย",
    tunings: [t("std", "Standard", "B1 E2 A2 D3 G3 B3 E4"), t("dropa", "Drop A", "A1 E2 A2 D3 G3 B3 E4")],
  },
  {
    id: "guitar12",
    name: "กีตาร์ 12 สาย (คอร์สล่าง)",
    tunings: [t("std", "Standard", "E3 A3 D4 G4 B3 E4")],
  },
  {
    id: "bass4",
    name: "เบส 4 สาย",
    tunings: [
      t("std", "Standard", "E1 A1 D2 G2"),
      t("half", "ลดครึ่งเสียง", "Eb1 Ab1 Db2 Gb2"),
      t("dropd", "Drop D", "D1 A1 D2 G2"),
      t("bead", "BEAD", "B0 E1 A1 D2"),
      t("dropc", "Drop C", "C1 G1 C2 F2"),
    ],
  },
  {
    id: "bass5",
    name: "เบส 5 สาย",
    tunings: [t("std", "Standard", "B0 E1 A1 D2 G2"), t("high", "High C", "E1 A1 D2 G2 C3")],
  },
  {
    id: "bass6",
    name: "เบส 6 สาย",
    tunings: [t("std", "Standard", "B0 E1 A1 D2 G2 C3")],
  },
  {
    id: "uke",
    name: "อูคูเลเล่",
    tunings: [
      t("std", "Standard (gCEA)", "G4 C4 E4 A4"),
      t("low", "Low G", "G3 C4 E4 A4"),
      t("d", "D tuning (aDF#B)", "A4 D4 F#4 B4"),
      t("bari", "บาริโทน (DGBE)", "D3 G3 B3 E4"),
    ],
  },
  {
    id: "mandolin",
    name: "แมนโดลิน",
    tunings: [t("std", "Standard", "G3 D4 A4 E5")],
  },
  {
    id: "banjo",
    name: "แบนโจ 5 สาย",
    tunings: [t("openg", "Open G (gDGBD)", "G4 D3 G3 B3 D4"), t("dbl", "Double C", "G4 C3 G3 C4 D4")],
  },
  {
    id: "violin",
    name: "ไวโอลิน",
    tunings: [t("std", "Standard", "G3 D4 A4 E5")],
  },
  {
    id: "viola",
    name: "วิโอลา",
    tunings: [t("std", "Standard", "C3 G3 D4 A4")],
  },
  {
    id: "cello",
    name: "เชลโล",
    tunings: [t("std", "Standard", "C2 G2 D3 A3")],
  },
  {
    id: "phin",
    name: "พิณ 3 สาย",
    tunings: [t("aea", "A-E-A", "A3 E4 A4"), t("ebe", "E-B-E", "E3 B3 E4")],
  },
  {
    id: "chromatic",
    name: "โครมาติก (ทุกโน้ต)",
    tunings: [t("all", "ทุกโน้ต", "C4")],
  },
];

export const TUNING_COUNT = TUNER_INSTRUMENTS.reduce((sum, inst) => sum + inst.tunings.length, 0);

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function noteName(midi: number, flats = false): string {
  return (flats ? FLATS : NAMES)[((midi % 12) + 12) % 12];
}

export function midiToHz(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

export function centsOff(hz: number, midi: number, a4 = 440): number {
  return 1200 * Math.log2(hz / midiToHz(midi, a4));
}

/** Pick the string whose target is closest (in cents) to the heard pitch. */
export function nearestString(hz: number, notes: number[], a4 = 440): number {
  let best = 0;
  let bestAbs = Infinity;
  notes.forEach((midi, index) => {
    const abs = Math.abs(centsOff(hz, midi, a4));
    if (abs < bestAbs) {
      bestAbs = abs;
      best = index;
    }
  });
  return best;
}
