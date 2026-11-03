/** Guitar chord voicings (standard tuning). Frets low E → high e; -1 = muted. */
export type Shape = { frets: number[]; barre: number | null };

const E_SHAPE: Record<string, number[]> = {
  "": [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  "7": [0, 2, 0, 1, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0],
};
const A_SHAPE: Record<string, number[]> = {
  "": [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  "7": [-1, 0, 2, 0, 2, 0],
  maj7: [-1, 0, 2, 1, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  sus4: [-1, 0, 2, 2, 3, 0],
  sus2: [-1, 0, 2, 2, 0, 0],
  dim: [-1, 0, 1, 2, 1, -1],
  aug: [-1, 0, 3, 2, 2, 1],
};
const OPEN: Record<string, number[]> = {
  "0:": [-1, 3, 2, 0, 1, 0],
  "0:7": [-1, 3, 2, 3, 1, 0],
  "0:maj7": [-1, 3, 2, 0, 0, 0],
  "2:": [-1, -1, 0, 2, 3, 2],
  "2:m": [-1, -1, 0, 2, 3, 1],
  "2:7": [-1, -1, 0, 2, 1, 2],
  "2:maj7": [-1, -1, 0, 2, 2, 2],
  "2:m7": [-1, -1, 0, 2, 1, 1],
  "2:sus4": [-1, -1, 0, 2, 3, 3],
  "2:sus2": [-1, -1, 0, 2, 3, 0],
  "7:": [3, 2, 0, 0, 0, 3],
  "7:7": [3, 2, 0, 0, 0, 1],
  "5:maj7": [-1, -1, 3, 2, 1, 0],
};

function place(template: number[], base: number): Shape {
  return { frets: template.map((f) => (f < 0 ? -1 : f + base)), barre: base > 0 ? base : null };
}

export function guitarShape(root: number, suffix: string): Shape | null {
  if (root < 0) return null;
  const pc = ((root % 12) + 12) % 12;
  const open = OPEN[`${pc}:${suffix}`];
  if (open) return { frets: open, barre: null };
  const eBase = (pc - 4 + 12) % 12;
  const aBase = (pc - 9 + 12) % 12;
  const e = E_SHAPE[suffix];
  const a = A_SHAPE[suffix] ?? A_SHAPE[""];
  if (e && (eBase <= aBase || !A_SHAPE[suffix])) return place(e, eBase);
  return place(a, aBase);
}
