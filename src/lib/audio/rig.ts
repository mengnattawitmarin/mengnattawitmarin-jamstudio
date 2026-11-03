export type SourceId = "line" | "guitar" | "bass";
export type AmpShape = "clean" | "tube" | "hot";
export type AmpId =
  | "crystal"
  | "tweed"
  | "brit"
  | "hot"
  | "jazz"
  | "acoustic"
  | "bass-tube"
  | "bass-stack"
  | "bass-modern"
  | "bass-di"
  | "plexi"
  | "blackface"
  | "dumble"
  | "lab";
export type PedalKind =
  | "gate"
  | "comp"
  | "drive"
  | "dist"
  | "fuzz"
  | "octave"
  | "wah"
  | "eq"
  | "chorus"
  | "phaser"
  | "flanger"
  | "tremolo"
  | "delay"
  | "spring"
  | "boost"
  | "klon"
  | "univibe"
  | "varitone";
export type CabId = "auto" | "1x12-open" | "2x12-open" | "4x12-closed" | "4x10-bass" | "8x10-bass" | "ir";
export type MicId = "sm57" | "md421" | "r121" | "u87";
export type RoomKind = "off" | "room" | "hall" | "spring" | "plate";

export type KnobSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  def: number;
  unit: "plain" | "hz" | "s" | "db" | "pct" | "step";
};

export type PedalState = {
  id: string;
  kind: PedalKind;
  on: boolean;
  params: Record<string, number>;
};

export type AmpKnobs = {
  gain: number;
  bass: number;
  mid: number;
  treble: number;
  presence: number;
  master: number;
  sag: number;
};

export type Ambience = {
  kind: RoomKind;
  decay: number;
  mix: number;
  tone: number;
};

export type RigSnapshot = {
  v: 1;
  source: SourceId;
  input: number;
  master: number;
  amp: AmpId;
  knobs: AmpKnobs;
  ambience: Ambience;
  pedals: PedalState[];
  bpm: number;
  click: boolean;
  capo: number;
  a4: number;
  /** Speaker cabinet profile ("auto" follows the amp model, "ir" = user impulse). */
  cab: CabId;
  /** Virtual microphone in front of the cabinet. */
  mic: MicId;
  /** Early-reflection "room" picked up by the mic, 0..1. */
  air: number;
};

export const CABS: { id: CabId; name: string; family: "guitar" | "bass" | "any" }[] = [
  { id: "auto", name: "ตามแอมป์", family: "any" },
  { id: "1x12-open", name: "1x12 เปิดหลัง", family: "guitar" },
  { id: "2x12-open", name: "2x12 คอมโบ", family: "guitar" },
  { id: "4x12-closed", name: "4x12 British", family: "guitar" },
  { id: "4x10-bass", name: "4x10 เบส", family: "bass" },
  { id: "8x10-bass", name: "8x10 เบส", family: "bass" },
  { id: "ir", name: "ไฟล์ IR ของฉัน", family: "any" },
];

export const MICS: { id: MicId; name: string; blurb: string }[] = [
  { id: "sm57", name: "SM57", blurb: "ไดนามิก มิดหน้า คมชัด" },
  { id: "md421", name: "MD421", blurb: "ไดนามิก โลว์แน่น กว้างกว่า" },
  { id: "r121", name: "R121", blurb: "ริบบอน นุ่ม หวาน ปลายมน" },
  { id: "u87", name: "U87", blurb: "คอนเดนเซอร์ ใส เปิด" },
];

type CabProfile = { lo: number; hi: number; bumpHz: number; bumpDb: number; notchHz: number; notchDb: number };
const CAB_PROFILES: Record<Exclude<CabId, "auto" | "ir">, CabProfile> = {
  "1x12-open": { lo: 95, hi: 5600, bumpHz: 2400, bumpDb: 2.5, notchHz: 380, notchDb: -2 },
  "2x12-open": { lo: 80, hi: 5200, bumpHz: 2000, bumpDb: 3, notchHz: 420, notchDb: -2.5 },
  "4x12-closed": { lo: 70, hi: 4700, bumpHz: 1700, bumpDb: 3.5, notchHz: 500, notchDb: -3 },
  "4x10-bass": { lo: 45, hi: 4200, bumpHz: 900, bumpDb: 2, notchHz: 300, notchDb: -1.5 },
  "8x10-bass": { lo: 38, hi: 3200, bumpHz: 600, bumpDb: 3, notchHz: 250, notchDb: -1 },
};
type MicProfile = { peakHz: number; peakDb: number; q: number; hiMul: number; lowDb: number };
const MIC_PROFILES: Record<MicId, MicProfile> = {
  sm57: { peakHz: 5200, peakDb: 4, q: 1.1, hiMul: 1, lowDb: -1.5 },
  md421: { peakHz: 4000, peakDb: 2.5, q: 0.9, hiMul: 1.05, lowDb: 1.5 },
  r121: { peakHz: 3000, peakDb: -3, q: 0.6, hiMul: 0.72, lowDb: 2 },
  u87: { peakHz: 8000, peakDb: 3, q: 0.8, hiMul: 1.35, lowDb: 0.5 },
};

export type AmpModel = {
  id: AmpId;
  name: string;
  family: "guitar" | "bass";
  tube: boolean;
  blurb: string;
  shape: AmpShape;
  drive: number;
  bass: number;
  mid: number;
  treble: number;
  presence: number;
  bassHz: number;
  midHz: number;
  trebleHz: number;
  cabLo: number;
  cabHi: number;
  cabBumpHz: number;
  cabBumpDb: number;
};

type PedalNode = {
  kind: PedalKind;
  input: GainNode;
  output: GainNode;
  apply: (params: Record<string, number>, on: boolean) => void;
  follow?: (hz: number) => void;
  dispose: () => void;
};

export const MAX_PEDALS = 8;

export const GUITAR_STRINGS = [
  { name: "e", midi: 64 },
  { name: "B", midi: 59 },
  { name: "G", midi: 55 },
  { name: "D", midi: 50 },
  { name: "A", midi: 45 },
  { name: "E", midi: 40 },
];

export const BASS_STRINGS = [
  { name: "G", midi: 43 },
  { name: "D", midi: 38 },
  { name: "A", midi: 33 },
  { name: "E", midi: 28 },
];

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const PEDAL_LIST: { kind: PedalKind; name: string; blurb: string; knobs: KnobSpec[] }[] = [
  {
    kind: "gate",
    name: "นอยส์เกต",
    blurb: "ตัดเสียงฮัมตอนไม่เล่น",
    knobs: [{ key: "thresh", label: "ระดับตัด", min: 0.005, max: 0.2, def: 0.03, unit: "plain" }],
  },
  {
    kind: "comp",
    name: "คอมเพรสเซอร์",
    blurb: "บีบไดนามิกให้เสมอกัน",
    knobs: [
      { key: "amount", label: "บีบ", min: 0, max: 1, def: 0.4, unit: "pct" },
      { key: "attack", label: "แอทแทค", min: 0, max: 1, def: 0.3, unit: "pct" },
      { key: "level", label: "เลเวล", min: 0, max: 1, def: 0.6, unit: "pct" },
    ],
  },
  {
    kind: "drive",
    name: "โอเวอร์ไดรฟ์",
    blurb: "แตกนุ่มแบบหลอดเล็ก",
    knobs: [
      { key: "drive", label: "ไดรฟ์", min: 0, max: 1, def: 0.45, unit: "pct" },
      { key: "tone", label: "โทน", min: 0, max: 1, def: 0.55, unit: "pct" },
      { key: "level", label: "เลเวล", min: 0, max: 1, def: 0.6, unit: "pct" },
    ],
  },
  {
    kind: "dist",
    name: "ดิสทอร์ชัน",
    blurb: "แตกหนักกว่าไดรฟ์",
    knobs: [
      { key: "drive", label: "เกน", min: 0, max: 1, def: 0.5, unit: "pct" },
      { key: "tone", label: "โทน", min: 0, max: 1, def: 0.5, unit: "pct" },
      { key: "level", label: "เลเวล", min: 0, max: 1, def: 0.55, unit: "pct" },
    ],
  },
  {
    kind: "fuzz",
    name: "ฟัซซ์",
    blurb: "อิ่ม ฟู ขอบคม",
    knobs: [
      { key: "drive", label: "ฟัซซ์", min: 0, max: 1, def: 0.6, unit: "pct" },
      { key: "tone", label: "โทน", min: 0, max: 1, def: 0.45, unit: "pct" },
      { key: "level", label: "เลเวล", min: 0, max: 1, def: 0.5, unit: "pct" },
    ],
  },
  {
    kind: "octave",
    name: "อ็อกเทฟ",
    blurb: "ซับโมโนและเสียงขึ้นสูง",
    knobs: [
      { key: "sub", label: "ซับ", min: 0, max: 1, def: 0.4, unit: "pct" },
      { key: "up", label: "ขึ้น", min: 0, max: 1, def: 0.2, unit: "pct" },
    ],
  },
  {
    kind: "wah",
    name: "วา",
    blurb: "กรองกลางหรือโยกอัตโนมัติ",
    knobs: [
      { key: "position", label: "ตำแหน่ง", min: 0, max: 1, def: 0.35, unit: "pct" },
      { key: "auto", label: "ออโต้", min: 0, max: 1, def: 0, unit: "pct" },
    ],
  },
  {
    kind: "eq",
    name: "อีคิว",
    blurb: "เบส มิด เทรเบิล",
    knobs: [
      { key: "bass", label: "เบส", min: -12, max: 12, def: 0, unit: "db" },
      { key: "mid", label: "มิด", min: -12, max: 12, def: 0, unit: "db" },
      { key: "treble", label: "เทรเบิล", min: -12, max: 12, def: 0, unit: "db" },
    ],
  },
  {
    kind: "chorus",
    name: "โครัส",
    blurb: "กว้าง นุ่ม",
    knobs: [
      { key: "rate", label: "สปีด", min: 0.2, max: 6, def: 0.9, unit: "hz" },
      { key: "depth", label: "ความลึก", min: 0.001, max: 0.006, def: 0.003, unit: "plain" },
      { key: "mix", label: "มิกซ์", min: 0, max: 1, def: 0.45, unit: "pct" },
    ],
  },
  {
    kind: "phaser",
    name: "เฟสเซอร์",
    blurb: "กวาดเฟสแบบหลอด",
    knobs: [
      { key: "rate", label: "สปีด", min: 0.1, max: 5, def: 0.4, unit: "hz" },
      { key: "depth", label: "ความลึก", min: 200, max: 900, def: 500, unit: "hz" },
      { key: "feedback", label: "ฟีดแบ็ก", min: 0, max: 0.35, def: 0.15, unit: "pct" },
    ],
  },
  {
    kind: "flanger",
    name: "แฟลงเจอร์",
    blurb: "หวีดสั้นแบบเครื่องบิน",
    knobs: [
      { key: "rate", label: "สปีด", min: 0.1, max: 5, def: 0.3, unit: "hz" },
      { key: "depth", label: "ความลึก", min: 0.0004, max: 0.002, def: 0.0012, unit: "plain" },
      { key: "feedback", label: "ฟีดแบ็ก", min: 0, max: 0.7, def: 0.35, unit: "pct" },
    ],
  },
  {
    kind: "tremolo",
    name: "เทรโมโล",
    blurb: "วูบตามจังหวะ",
    knobs: [
      { key: "rate", label: "สปีด", min: 1, max: 12, def: 4, unit: "hz" },
      { key: "depth", label: "ความลึก", min: 0, max: 1, def: 0.6, unit: "pct" },
    ],
  },
  {
    kind: "delay",
    name: "ดีเลย์",
    blurb: "สะท้อนตามเวลาที่ตั้ง",
    knobs: [
      { key: "time", label: "เวลา", min: 0.08, max: 1.2, def: 0.32, unit: "s" },
      { key: "feedback", label: "ฟีดแบ็ก", min: 0, max: 0.85, def: 0.35, unit: "pct" },
      { key: "mix", label: "มิกซ์", min: 0, max: 1, def: 0.3, unit: "pct" },
    ],
  },
  {
    kind: "spring",
    name: "สปริง",
    blurb: "รีเวิร์บสปริงในก้อน",
    knobs: [
      { key: "decay", label: "หาง", min: 0.2, max: 1, def: 0.45, unit: "pct" },
      { key: "tone", label: "โทน", min: 0, max: 1, def: 0.6, unit: "pct" },
      { key: "mix", label: "มิกซ์", min: 0, max: 1, def: 0.3, unit: "pct" },
    ],
  },
  {
    kind: "boost",
    name: "เทรเบิลบูสต์",
    blurb: "ดันมิดสูงเข้าแอมป์ แบบบูสเตอร์ยุค 60",
    knobs: [
      { key: "boost", label: "บูสต์", min: 0, max: 1, def: 0.5, unit: "pct" },
      { key: "range", label: "เต็ม↔แหลม", min: 0, max: 1, def: 0.7, unit: "pct" },
      { key: "level", label: "เลเวล", min: 0, max: 1, def: 0.6, unit: "pct" },
    ],
  },
  {
    kind: "klon",
    name: "โอดีใส",
    blurb: "ผสมเสียงสะอาดกับเสียงแตก ไม่กินเบส",
    knobs: [
      { key: "gain", label: "เกน", min: 0, max: 1, def: 0.35, unit: "pct" },
      { key: "treble", label: "เทรเบิล", min: 0, max: 1, def: 0.5, unit: "pct" },
      { key: "level", label: "เอาต์พุต", min: 0, max: 1, def: 0.62, unit: "pct" },
    ],
  },
  {
    kind: "univibe",
    name: "ยูนิไวบ์",
    blurb: "เฟสหลอดไฟ สวิงไม่สมมาตร โยกแบบปลาย 60",
    knobs: [
      { key: "speed", label: "สปีด", min: 0.4, max: 9, def: 2.2, unit: "hz" },
      { key: "intensity", label: "ความเข้ม", min: 0, max: 1, def: 0.7, unit: "pct" },
      { key: "mode", label: "โครัส↔ไวบราโต", min: 0, max: 1, def: 0, unit: "pct" },
    ],
  },
  {
    kind: "varitone",
    name: "วาริโทน",
    blurb: "สวิตช์ตัดย่านความถี่ 6 ตำแหน่ง แบบกีตาร์แจ๊ส-บลูส์",
    knobs: [{ key: "pos", label: "ตำแหน่ง", min: 0, max: 6, def: 2, unit: "step" }],
  },
];

export const PEDALS = PEDAL_LIST;

/** Rough stomp colour per pedal kind, used by the visual pedalboard. */
export const PEDAL_COLORS: Record<PedalKind, string> = {
  gate: "#3a3f4b",
  comp: "#1f8a70",
  drive: "#2e9d4f",
  dist: "#e46a1b",
  fuzz: "#b3262e",
  octave: "#8a5cf6",
  wah: "#2b2b2b",
  eq: "#cfd5df",
  chorus: "#2f7fe0",
  phaser: "#ef7d22",
  flanger: "#6b7280",
  tremolo: "#0f9fb0",
  delay: "#7b3fe4",
  spring: "#139c9c",
  boost: "#c7a64a",
  klon: "#c9a227",
  univibe: "#1e3a8a",
  varitone: "#5b3a1f",
};

export const AMPS: AmpModel[] = [
  {
    id: "plexi",
    name: "British 800 · เพล็กซี่ 100W",
    family: "guitar",
    tube: true,
    blurb: "หัวอังกฤษไม่มีมาสเตอร์ เปิดดังแล้วแตกเอง โทนร็อกปลาย 60",
    shape: "tube",
    drive: 4.2,
    bass: -1,
    mid: 2.5,
    treble: 3,
    presence: 3,
    bassHz: 100,
    midHz: 650,
    trebleHz: 2800,
    cabLo: 85,
    cabHi: 5000,
    cabBumpHz: 2000,
    cabBumpDb: 3,
  },
  {
    id: "blackface",
    name: "แบล็กเฟซ คลีน",
    family: "guitar",
    tube: true,
    blurb: "คลีนอเมริกัน มิดเว้า ประกายสูง รับก้อนไดรฟ์ได้ดี",
    shape: "clean",
    drive: 1.3,
    bass: 2,
    mid: -3,
    treble: 3,
    presence: 2,
    bassHz: 100,
    midHz: 500,
    trebleHz: 3000,
    cabLo: 75,
    cabHi: 6000,
    cabBumpHz: 2500,
    cabBumpDb: 1.5,
  },
  {
    id: "dumble",
    name: "สมูทโอดี",
    family: "guitar",
    tube: true,
    blurb: "ลีดเนียน มิดอวบ ซัสเทนยาว ตอบสนองน้ำหนักมือ",
    shape: "tube",
    drive: 3,
    bass: 0,
    mid: 3,
    treble: 0,
    presence: 1,
    bassHz: 110,
    midHz: 750,
    trebleHz: 2600,
    cabLo: 80,
    cabHi: 4800,
    cabBumpHz: 1200,
    cabBumpDb: 2,
  },
  {
    id: "lab",
    name: "โซลิด L5 บลูส์",
    family: "guitar",
    tube: false,
    blurb: "โซลิดสเตตคลีนสนิท มีคอมเพรสเซอร์ในตัว เสียงร้องเป็นโน้ต",
    shape: "clean",
    drive: 0.9,
    bass: 0,
    mid: 2,
    treble: 1,
    presence: 1,
    bassHz: 120,
    midHz: 900,
    trebleHz: 3000,
    cabLo: 90,
    cabHi: 5200,
    cabBumpHz: 1000,
    cabBumpDb: 2,
  },
  {
    id: "crystal",
    name: "คลีนคริสตัล",
    family: "guitar",
    tube: false,
    blurb: "หัวโซลิด ใส แตกน้อย",
    shape: "clean",
    drive: 0.85,
    bass: 1,
    mid: -1,
    treble: 3,
    presence: 2,
    bassHz: 120,
    midHz: 800,
    trebleHz: 3200,
    cabLo: 90,
    cabHi: 6400,
    cabBumpHz: 2200,
    cabBumpDb: 2,
  },
  {
    id: "tweed",
    name: "ทวีดหลอด",
    family: "guitar",
    tube: true,
    blurb: "หลอดอุ่น แตกนุ่มเมื่อดันเกน",
    shape: "tube",
    drive: 2.4,
    bass: 3,
    mid: 2,
    treble: 0,
    presence: 1,
    bassHz: 110,
    midHz: 700,
    trebleHz: 2800,
    cabLo: 80,
    cabHi: 4800,
    cabBumpHz: 380,
    cabBumpDb: 3,
  },
  {
    id: "brit",
    name: "สแตกบริติช",
    family: "guitar",
    tube: true,
    blurb: "มิดเด่นแบบตู้หลอดอังกฤษ",
    shape: "tube",
    drive: 3.6,
    bass: 0,
    mid: 4,
    treble: 2,
    presence: 3,
    bassHz: 120,
    midHz: 900,
    trebleHz: 3000,
    cabLo: 90,
    cabHi: 5200,
    cabBumpHz: 1800,
    cabBumpDb: 2.5,
  },
  {
    id: "hot",
    name: "ไฮเกนหลอด",
    family: "guitar",
    tube: true,
    blurb: "เกนสูง แน่น เหมาะลีด",
    shape: "hot",
    drive: 6.2,
    bass: -1,
    mid: 1,
    treble: 2,
    presence: 4,
    bassHz: 130,
    midHz: 720,
    trebleHz: 3400,
    cabLo: 100,
    cabHi: 5600,
    cabBumpHz: 2400,
    cabBumpDb: 1.5,
  },
  {
    id: "jazz",
    name: "แจ๊สคอมโบ",
    family: "guitar",
    tube: true,
    blurb: "กลม มืด ไม่คม",
    shape: "clean",
    drive: 1.15,
    bass: 2,
    mid: -2,
    treble: -3,
    presence: -1,
    bassHz: 100,
    midHz: 600,
    trebleHz: 2400,
    cabLo: 70,
    cabHi: 3600,
    cabBumpHz: 280,
    cabBumpDb: 2,
  },
  {
    id: "acoustic",
    name: "โปร่งไดเรกต์",
    family: "guitar",
    tube: false,
    blurb: "ใสแบบปิ๊กอัปโปร่ง",
    shape: "clean",
    drive: 0.7,
    bass: -2,
    mid: 0,
    treble: 4,
    presence: 3,
    bassHz: 140,
    midHz: 1000,
    trebleHz: 4000,
    cabLo: 70,
    cabHi: 9000,
    cabBumpHz: 4200,
    cabBumpDb: 1,
  },
  {
    id: "bass-tube",
    name: "เบสหลอดวินเทจ",
    family: "bass",
    tube: true,
    blurb: "หลอดอุ่น โต่งเมื่อตบแรง",
    shape: "tube",
    drive: 2,
    bass: 4,
    mid: 1,
    treble: -1,
    presence: 0,
    bassHz: 70,
    midHz: 420,
    trebleHz: 1500,
    cabLo: 30,
    cabHi: 3200,
    cabBumpHz: 90,
    cabBumpDb: 4,
  },
  {
    id: "bass-stack",
    name: "ตู้เบสใหญ่",
    family: "bass",
    tube: true,
    blurb: "มิดเว้า กำปั้นหนัก",
    shape: "tube",
    drive: 1.7,
    bass: 5,
    mid: -4,
    treble: 2,
    presence: 1,
    bassHz: 60,
    midHz: 520,
    trebleHz: 1800,
    cabLo: 28,
    cabHi: 2800,
    cabBumpHz: 80,
    cabBumpDb: 5,
  },
  {
    id: "bass-modern",
    name: "เบสโมเดิร์น",
    family: "bass",
    tube: false,
    blurb: "แน่น ชัด เกนสะอาด",
    shape: "clean",
    drive: 1.05,
    bass: 2,
    mid: 1,
    treble: 2,
    presence: 2,
    bassHz: 80,
    midHz: 480,
    trebleHz: 2000,
    cabLo: 35,
    cabHi: 4200,
    cabBumpHz: 140,
    cabBumpDb: 2,
  },
  {
    id: "bass-di",
    name: "ดีไออุ่น",
    family: "bass",
    tube: false,
    blurb: "ตรง อุ่นนิด ซ้อมกับเพลง",
    shape: "clean",
    drive: 0.8,
    bass: 1,
    mid: 0,
    treble: 1,
    presence: 0,
    bassHz: 70,
    midHz: 500,
    trebleHz: 2200,
    cabLo: 30,
    cabHi: 5200,
    cabBumpHz: 200,
    cabBumpDb: 1,
  },
];

export const ROOMS: { id: RoomKind; name: string }[] = [
  { id: "off", name: "แห้ง" },
  { id: "room", name: "ห้อง" },
  { id: "hall", name: "โถง" },
  { id: "spring", name: "สปริง" },
  { id: "plate", name: "เพลท" },
];

export const AMP_KNOBS: { key: keyof AmpKnobs; label: string }[] = [
  { key: "gain", label: "เกน" },
  { key: "bass", label: "เบส" },
  { key: "mid", label: "มิด" },
  { key: "treble", label: "เทรเบิล" },
  { key: "presence", label: "เพรสเซนส์" },
  { key: "sag", label: "แซกหลอด" },
  { key: "master", label: "มาสเตอร์ตู้" },
];

const DEFAULT_KNOBS: AmpKnobs = {
  gain: 0.48,
  bass: 0.55,
  mid: 0.5,
  treble: 0.52,
  presence: 0.5,
  master: 0.62,
  sag: 0.4,
};

export function pedalMeta(kind: PedalKind) {
  return PEDAL_LIST.find((item) => item.kind === kind) ?? PEDAL_LIST[0];
}

export function defaultParams(kind: PedalKind): Record<string, number> {
  const params: Record<string, number> = {};
  for (const knob of pedalMeta(kind).knobs) params[knob.key] = knob.def;
  return params;
}

export function makePedal(kind: PedalKind, on = false, overrides?: Record<string, number>, id?: string): PedalState {
  return {
    id: id ?? `p-${Math.random().toString(36).slice(2, 9)}`,
    kind,
    on,
    params: { ...defaultParams(kind), ...overrides },
  };
}

export function ampById(id: string): AmpModel | null {
  return AMPS.find((amp) => amp.id === id) ?? null;
}

export const DEFAULT_RIG: RigSnapshot = {
  v: 1,
  source: "guitar",
  input: 0.85,
  master: 0.8,
  amp: "tweed",
  knobs: { ...DEFAULT_KNOBS },
  ambience: { kind: "spring", decay: 0.42, mix: 0.38, tone: 0.58 },
  pedals: [
    makePedal("comp", true, { amount: 0.35, attack: 0.28, level: 0.6 }, "p-comp"),
    makePedal("drive", false, { drive: 0.42, tone: 0.55, level: 0.58 }, "p-drive"),
    makePedal("chorus", false, undefined, "p-chorus"),
    makePedal("delay", false, { time: 0.36, feedback: 0.32, mix: 0.28 }, "p-delay"),
  ],
  bpm: 96,
  click: false,
  capo: 0,
  a4: 440,
  cab: "auto",
  mic: "sm57",
  air: 0.2,
};

type PresetDef = {
  id: string;
  name: string;
  source: SourceId;
  amp: AmpId;
  knobs: AmpKnobs;
  ambience: Ambience;
  pedals: () => PedalState[];
  cab?: CabId;
  mic?: MicId;
  air?: number;
  /** "artist" presets are tone studies inspired by documented rigs, not endorsements. */
  group?: "basic" | "artist";
  blurb?: string;
};

const PRESETS: PresetDef[] = [
  // ── Tone studies built from publicly documented rigs ─────────────────────
  // Hendrix: Strat → (wah) → Fuzz Face → Uni-Vibe → 100W non-master-volume
  // British head cranked into 4x12s. Fuzz cleans up with picking/volume.
  {
    id: "hendrix-haze",
    name: "สไตล์ Hendrix · ฟัซซ์",
    group: "artist",
    blurb: "ฟัซซ์เจอร์เมเนียมเข้าหัวอังกฤษ 100W เปิดดัง + 4x12 · ลองริฟแบบ Purple Haze",
    source: "guitar",
    amp: "plexi",
    knobs: { gain: 0.72, bass: 0.78, mid: 0.52, treble: 0.55, presence: 0.55, master: 0.66, sag: 0.62 },
    ambience: { kind: "room", decay: 0.35, mix: 0.22, tone: 0.55 },
    cab: "4x12-closed",
    mic: "sm57",
    air: 0.3,
    pedals: () => [
      makePedal("wah", false, { position: 0.45, auto: 0 }),
      makePedal("fuzz", true, { drive: 0.72, tone: 0.55, level: 0.55 }),
      makePedal("octave", false, { sub: 0, up: 0.55 }),
      makePedal("univibe", false, { speed: 2.4, intensity: 0.7, mode: 0 }),
    ],
  },
  {
    id: "hendrix-vibe",
    name: "สไตล์ Hendrix · ยูนิไวบ์",
    group: "artist",
    blurb: "ยูนิไวบ์โหมดโครัสหมุนช้า + ไดรฟ์จากแอมป์ · โทนแบบ Machine Gun / Little Wing",
    source: "guitar",
    amp: "plexi",
    knobs: { gain: 0.58, bass: 0.62, mid: 0.5, treble: 0.58, presence: 0.5, master: 0.62, sag: 0.55 },
    ambience: { kind: "hall", decay: 0.4, mix: 0.2, tone: 0.5 },
    cab: "4x12-closed",
    mic: "sm57",
    air: 0.35,
    pedals: () => [
      makePedal("fuzz", false, { drive: 0.55, tone: 0.5, level: 0.5 }),
      makePedal("univibe", true, { speed: 1.4, intensity: 0.85, mode: 0 }),
    ],
  },
  {
    id: "hendrix-wah",
    name: "สไตล์ Hendrix · วา",
    group: "artist",
    blurb: "วา + ฟัซซ์ + แอมป์แตก · ใช้แป้นวา (ตำแหน่ง/ออโต้) แบบ Voodoo Child",
    source: "guitar",
    amp: "plexi",
    knobs: { gain: 0.7, bass: 0.7, mid: 0.55, treble: 0.5, presence: 0.55, master: 0.66, sag: 0.6 },
    ambience: { kind: "room", decay: 0.3, mix: 0.18, tone: 0.5 },
    cab: "4x12-closed",
    mic: "sm57",
    air: 0.3,
    pedals: () => [
      makePedal("wah", true, { position: 0.4, auto: 0.55 }),
      makePedal("fuzz", true, { drive: 0.62, tone: 0.5, level: 0.52 }),
    ],
  },
  // John Mayer: Strat (pickup pos. 4/5) → low-gain TS-808 / Klon-style OD →
  // blackface Deluxe/Twin clean or Dumble/Two-Rock style lead, spring reverb.
  {
    id: "mayer-clean",
    name: "สไตล์ John Mayer · คลีน",
    group: "artist",
    blurb: "คลีนแบล็กเฟซ + คอมเพรสเบา + สปริง · โทน neck/middle แบบ Neon / Wonderland",
    source: "guitar",
    amp: "blackface",
    knobs: { gain: 0.38, bass: 0.48, mid: 0.4, treble: 0.62, presence: 0.55, master: 0.68, sag: 0.35 },
    ambience: { kind: "spring", decay: 0.5, mix: 0.36, tone: 0.55 },
    cab: "1x12-open",
    mic: "r121",
    air: 0.25,
    pedals: () => [makePedal("comp", true, { amount: 0.28, attack: 0.45, level: 0.62 }), makePedal("klon", false)],
  },
  {
    id: "mayer-gravity",
    name: "สไตล์ John Mayer · Gravity",
    group: "artist",
    blurb: "แอมป์คลีนดันด้วยไดรฟ์เกนต่ำเลเวลสูง (แนว TS-808) + สปริง · เบนด์ช้าๆ",
    source: "guitar",
    amp: "blackface",
    knobs: { gain: 0.45, bass: 0.55, mid: 0.42, treble: 0.6, presence: 0.5, master: 0.66, sag: 0.45 },
    ambience: { kind: "spring", decay: 0.55, mix: 0.34, tone: 0.5 },
    cab: "2x12-open",
    mic: "sm57",
    air: 0.25,
    pedals: () => [
      makePedal("drive", true, { drive: 0.28, tone: 0.52, level: 0.72 }),
      makePedal("delay", true, { time: 0.38, feedback: 0.22, mix: 0.14 }),
    ],
  },
  {
    id: "mayer-lead",
    name: "สไตล์ John Mayer · ลีดเนียน",
    group: "artist",
    blurb: "หัวโอดีแบบสมูท + โอดีใส · ลีดร้องเป็นเสียงคน แบบ Slow Dancing",
    source: "guitar",
    amp: "dumble",
    knobs: { gain: 0.55, bass: 0.45, mid: 0.55, treble: 0.62, presence: 0.5, master: 0.62, sag: 0.5 },
    ambience: { kind: "plate", decay: 0.45, mix: 0.26, tone: 0.5 },
    cab: "2x12-open",
    mic: "md421",
    air: 0.2,
    pedals: () => [
      makePedal("klon", true, { gain: 0.3, treble: 0.55, level: 0.62 }),
      makePedal("delay", true, { time: 0.42, feedback: 0.25, mix: 0.16 }),
    ],
  },
  // B.B. King: ES-355 with Varitone → straight into a Lab Series L5
  // (solid-state, built-in compressor) or a Twin Reverb. No pedals.
  {
    id: "bbking",
    name: "สไตล์ B.B. King · Lucille",
    group: "artist",
    blurb: "โซลิดคลีนมีคอมเพรสเซอร์ + วาริโทนตำแหน่ง 2 · โน้ตเดี่ยวไวบราโตมือ แบบ The Thrill Is Gone",
    source: "guitar",
    amp: "lab",
    knobs: { gain: 0.42, bass: 0.45, mid: 0.66, treble: 0.5, presence: 0.42, master: 0.7, sag: 0.25 },
    ambience: { kind: "room", decay: 0.42, mix: 0.24, tone: 0.5 },
    cab: "2x12-open",
    mic: "sm57",
    air: 0.3,
    pedals: () => [
      makePedal("comp", true, { amount: 0.45, attack: 0.35, level: 0.62 }),
      makePedal("varitone", true, { pos: 2 }),
    ],
  },
  {
    id: "bbking-twin",
    name: "สไตล์ B.B. King · ทวิน",
    group: "artist",
    blurb: "คลีนหลอดหัวใหญ่ เปิดมิด ลดแหลม · ยุคหลังที่ใช้ตู้ทวิน",
    source: "guitar",
    amp: "blackface",
    knobs: { gain: 0.48, bass: 0.45, mid: 0.7, treble: 0.45, presence: 0.4, master: 0.7, sag: 0.4 },
    ambience: { kind: "spring", decay: 0.35, mix: 0.2, tone: 0.45 },
    cab: "2x12-open",
    mic: "sm57",
    air: 0.25,
    pedals: () => [makePedal("varitone", true, { pos: 3 })],
  },
  {
    id: "clean",
    name: "คลีนแอมเบียน",
    source: "guitar",
    amp: "crystal",
    knobs: { ...DEFAULT_KNOBS, gain: 0.32, treble: 0.62, sag: 0.15, master: 0.7 },
    ambience: { kind: "room", decay: 0.4, mix: 0.42, tone: 0.7 },
    pedals: () => [
      makePedal("comp", true, { amount: 0.3, level: 0.62 }),
      makePedal("chorus", true, { rate: 0.7, depth: 0.0025, mix: 0.4 }),
      makePedal("delay", true, { time: 0.42, feedback: 0.28, mix: 0.22 }),
    ],
  },
  {
    id: "tweed",
    name: "ทวีดหลอด",
    source: "guitar",
    amp: "tweed",
    knobs: { ...DEFAULT_KNOBS, gain: 0.62, bass: 0.6, sag: 0.55 },
    ambience: { kind: "spring", decay: 0.48, mix: 0.4, tone: 0.5 },
    pedals: () => [makePedal("comp", true, { amount: 0.25 }), makePedal("drive", true, { drive: 0.38, tone: 0.5, level: 0.55 })],
  },
  {
    id: "brit",
    name: "ครันช์สแตก",
    source: "guitar",
    amp: "brit",
    knobs: { ...DEFAULT_KNOBS, gain: 0.58, mid: 0.66, presence: 0.6, sag: 0.48 },
    ambience: { kind: "room", decay: 0.32, mix: 0.28, tone: 0.55 },
    pedals: () => [makePedal("drive", true, { drive: 0.48, tone: 0.58, level: 0.52 }), makePedal("delay", false)],
  },
  {
    id: "lead",
    name: "ลีดหลอด",
    source: "guitar",
    amp: "hot",
    knobs: { ...DEFAULT_KNOBS, gain: 0.72, presence: 0.64, sag: 0.42, master: 0.5 },
    ambience: { kind: "hall", decay: 0.55, mix: 0.34, tone: 0.48 },
    pedals: () => [
      makePedal("dist", false, { drive: 0.4, level: 0.45 }),
      makePedal("delay", true, { time: 0.38, feedback: 0.4, mix: 0.32 }),
    ],
  },
  {
    id: "bass-warm",
    name: "เบสหลอด",
    source: "bass",
    amp: "bass-tube",
    knobs: { ...DEFAULT_KNOBS, gain: 0.5, bass: 0.7, mid: 0.48, sag: 0.6, treble: 0.4 },
    ambience: { kind: "room", decay: 0.3, mix: 0.22, tone: 0.4 },
    pedals: () => [
      makePedal("comp", true, { amount: 0.55, attack: 0.4, level: 0.62 }),
      makePedal("octave", true, { sub: 0.28, up: 0 }),
    ],
  },
  {
    id: "bass-growl",
    name: "เบสตู้ใหญ่",
    source: "bass",
    amp: "bass-stack",
    knobs: { ...DEFAULT_KNOBS, gain: 0.55, bass: 0.72, mid: 0.32, sag: 0.45 },
    ambience: { kind: "spring", decay: 0.28, mix: 0.18, tone: 0.35 },
    pedals: () => [makePedal("comp", true, { amount: 0.4 }), makePedal("drive", true, { drive: 0.32, tone: 0.4, level: 0.5 })],
  },
];

export const RIG_PRESETS = PRESETS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  group: preset.group ?? "basic",
  blurb: preset.blurb ?? "",
  source: preset.source,
}));

export function applyPreset(
  id: string,
): Pick<RigSnapshot, "source" | "amp" | "knobs" | "ambience" | "pedals" | "cab" | "mic" | "air"> | null {
  const preset = PRESETS.find((item) => item.id === id);
  if (!preset) return null;
  return {
    source: preset.source,
    amp: preset.amp,
    knobs: { ...preset.knobs },
    ambience: { ...preset.ambience },
    pedals: preset.pedals(),
    cab: preset.cab ?? "auto",
    mic: preset.mic ?? "sm57",
    air: preset.air ?? 0.2,
  };
}

export function describePitch(hz: number, a4 = 440): { name: string; octave: number; cents: number; midi: number } | null {
  if (!Number.isFinite(hz) || hz < 30 || hz > 2000) return null;
  const midi = Math.round(69 + 12 * Math.log2(hz / a4));
  const ref = a4 * 2 ** ((midi - 69) / 12);
  const cents = Math.max(-50, Math.min(50, Math.round(1200 * Math.log2(hz / ref))));
  const pc = ((midi % 12) + 12) % 12;
  return { name: NOTE_NAMES[pc] ?? "C", octave: Math.floor(midi / 12) - 1, cents, midi };
}

export function fretHint(midi: number, family: "guitar" | "bass"): string {
  const strings = family === "bass" ? BASS_STRINGS : GUITAR_STRINGS;
  let best = "";
  let bestDist = 99;
  for (const string of strings) {
    const fret = midi - string.midi;
    if (fret < 0 || fret > 15 || fret >= bestDist) continue;
    bestDist = fret;
    best = fret === 0 ? `สาย ${string.name} สายเปิด` : `สาย ${string.name} เฟรต ${fret}`;
  }
  return best;
}

export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const n = buf.length;
  if (n < 256 || sampleRate < 8000) return null;
  let rms = 0;
  for (let i = 0; i < n; i += 1) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return null;

  const minF = 35;
  const maxF = 1100;
  const minLag = Math.max(2, Math.floor(sampleRate / maxF));
  const maxLag = Math.min(n - 2, Math.floor(sampleRate / minF));
  if (maxLag <= minLag) return null;
  const diff = new Float32Array(maxLag + 1);
  const step = 2;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    const limit = n - lag;
    for (let i = 0; i < limit; i += step) {
      const delta = buf[i] - buf[i + lag];
      sum += delta * delta;
    }
    diff[lag] = sum;
  }
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag += 1) {
    running += diff[lag];
    cmnd[lag] = running > 0 ? (diff[lag] * lag) / running : 1;
  }
  const threshold = 0.18;
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if (cmnd[lag] >= threshold) continue;
    while (lag + 1 <= maxLag && cmnd[lag + 1] < cmnd[lag]) lag += 1;
    bestLag = lag;
    break;
  }
  if (bestLag < 0) {
    let min = 1;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      if (cmnd[lag] < min) {
        min = cmnd[lag];
        bestLag = lag;
      }
    }
    if (min > 0.45 || bestLag < 0) return null;
  }
  const prev = cmnd[bestLag - 1] ?? cmnd[bestLag];
  const next = cmnd[bestLag + 1] ?? cmnd[bestLag];
  const denom = prev + next - 2 * cmnd[bestLag];
  const shift = denom === 0 ? 0 : (prev - next) / (2 * denom);
  const hz = sampleRate / (bestLag + shift);
  if (!Number.isFinite(hz) || hz < minF || hz > maxF) return null;
  return hz;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

export function readSnapshot(raw: string | null): RigSnapshot {
  if (!raw) return structuredClone(DEFAULT_RIG);
  try {
    const data = JSON.parse(raw) as Partial<RigSnapshot>;
    if (!data || data.v !== 1) return structuredClone(DEFAULT_RIG);
    const amp = ampById(String(data.amp)) ? (data.amp as AmpId) : DEFAULT_RIG.amp;
    const source: SourceId = data.source === "bass" || data.source === "line" || data.source === "guitar" ? data.source : "guitar";
    const knobs = { ...DEFAULT_KNOBS };
    const incomingKnobs: Partial<AmpKnobs> = data.knobs ?? {};
    for (const key of Object.keys(knobs) as (keyof AmpKnobs)[]) {
      knobs[key] = num(incomingKnobs[key], knobs[key], 0, 1);
    }
    const ambienceIn = data.ambience;
    const kindOk = ROOMS.some((room) => room.id === ambienceIn?.kind);
    const ambience: Ambience = {
      kind: kindOk && ambienceIn ? ambienceIn.kind : DEFAULT_RIG.ambience.kind,
      decay: num(ambienceIn?.decay, DEFAULT_RIG.ambience.decay, 0, 1),
      mix: num(ambienceIn?.mix, DEFAULT_RIG.ambience.mix, 0, 1),
      tone: num(ambienceIn?.tone, DEFAULT_RIG.ambience.tone, 0, 1),
    };
    const pedals: PedalState[] = [];
    if (Array.isArray(data.pedals)) {
      for (const item of data.pedals) {
        if (!item || typeof item !== "object") continue;
        const kind = (item as PedalState).kind;
        if (!PEDAL_LIST.some((pedal) => pedal.kind === kind)) continue;
        const params = defaultParams(kind);
        const incoming = (item as PedalState).params ?? {};
        for (const knob of pedalMeta(kind).knobs) params[knob.key] = num(incoming[knob.key], knob.def, knob.min, knob.max);
        pedals.push({
          id: typeof (item as PedalState).id === "string" ? (item as PedalState).id.slice(0, 24) : makePedal(kind).id,
          kind,
          on: Boolean((item as PedalState).on),
          params,
        });
        if (pedals.length >= MAX_PEDALS) break;
      }
    }
    return {
      v: 1,
      source,
      input: num(data.input, DEFAULT_RIG.input, 0, 1.5),
      master: num(data.master, DEFAULT_RIG.master, 0, 1),
      amp,
      knobs,
      ambience,
      pedals: pedals.length > 0 ? pedals : structuredClone(DEFAULT_RIG.pedals),
      bpm: Math.round(num(data.bpm, DEFAULT_RIG.bpm, 40, 240)),
      click: Boolean(data.click),
      capo: Math.round(num(data.capo, 0, 0, 7)),
      a4: Math.round(num(data.a4, 440, 430, 450)),
      cab: CABS.some((cab) => cab.id === data.cab) && data.cab !== "ir" ? (data.cab as CabId) : "auto",
      mic: MICS.some((mic) => mic.id === data.mic) ? (data.mic as MicId) : "sm57",
      air: num(data.air, 0.2, 0, 1),
    };
  } catch {
    return structuredClone(DEFAULT_RIG);
  }
}

export function formatKnob(knob: KnobSpec, value: number): string {
  if (knob.unit === "s") return `${value.toFixed(2)} วิ`;
  if (knob.unit === "hz") return value >= 100 ? `${Math.round(value)} Hz` : `${value.toFixed(1)} Hz`;
  if (knob.unit === "db") {
    const rounded = Math.round(value * 10) / 10;
    return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} dB`;
  }
  if (knob.unit === "pct") return `${Math.round(value * 100)}`;
  if (knob.unit === "step") return Math.round(value) === 0 ? "ปิด" : `${Math.round(value)}`;
  return value < 0.01 ? value.toFixed(3) : value.toFixed(2);
}

function logFreq(min: number, max: number, amount: number): number {
  return min * (max / min) ** clamp(amount, 0, 1);
}

function shapeCurve(shape: AmpShape): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  const drive = shape === "clean" ? 1.35 : shape === "tube" ? 2.3 : 3.1;
  const bias = shape === "clean" ? 0.04 : shape === "tube" ? 0.28 : 0.16;
  const center = Math.tanh(bias * drive);
  let peak = 0.001;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    let y = Math.tanh((x + bias) * drive) - center;
    if (shape === "hot") y = Math.tanh(y * 2.6);
    raw[i] = y;
    peak = Math.max(peak, Math.abs(y));
  }
  for (let i = 0; i < n; i += 1) curve[i] = raw[i] / peak;
  return curve;
}

const AMP_CURVES: Record<AmpShape, Float32Array> = {
  clean: shapeCurve("clean"),
  tube: shapeCurve("tube"),
  hot: shapeCurve("hot"),
};

function clipCurve(mode: "drive" | "dist" | "fuzz"): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    if (mode === "drive") curve[i] = Math.tanh(x * 2.4);
    else if (mode === "dist") curve[i] = Math.tanh(x * 5.5);
    else {
      const folded = x >= 0 ? 1 - Math.exp(-Math.abs(x) * 10) : -(1 - Math.exp(-Math.abs(x) * 10));
      curve[i] = Math.tanh(folded * 1.8);
    }
  }
  return curve;
}

const CLIP_CURVES = {
  drive: clipCurve("drive"),
  dist: clipCurve("dist"),
  fuzz: clipCurve("fuzz"),
};

function foldCurve(): Float32Array {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.abs(x) * 2 - 1;
  }
  return curve;
}

const FOLD_CURVE = foldCurve();

function boostCurve(): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    // Germanium-ish: softer on the negative swing → even harmonics.
    curve[i] = x >= 0 ? Math.tanh(x * 1.6) : Math.tanh(x * 1.15) * 0.92;
  }
  return curve;
}

function diodeCurve(): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    // Symmetric germanium diode pair: soft knee, hard ceiling.
    curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * 3.2)) * 0.95;
  }
  return curve;
}

const BOOST_CURVE = boostCurve();
const DIODE_CURVE = diodeCurve();
const VARITONE_HZ = [1000, 1800, 1050, 680, 480, 330, 230];

function makeImpulse(ctx: AudioContext, seconds: number, kind: Exclude<RoomKind, "off">): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * seconds));
  const buffer = ctx.createBuffer(2, len, sr);
  const taps =
    kind === "spring"
      ? [0.013, 0.021, 0.034, 0.055]
      : kind === "plate"
        ? [0.009, 0.017, 0.029, 0.047]
        : kind === "hall"
          ? [0.019, 0.037, 0.061, 0.097]
          : [0.012, 0.023, 0.041];
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    const dry = new Float32Array(len);
    for (let i = 0; i < len; i += 1) {
      const t = i / sr;
      dry[i] = (Math.random() * 2 - 1) * Math.exp((-3.1 * t) / seconds);
    }
    data.set(dry);
    for (const tap of taps) {
      const shift = Math.floor((tap + channel * 0.0013) * sr);
      const gain = kind === "spring" ? 0.55 : 0.42;
      for (let i = shift; i < len; i += 1) data[i] += dry[i - shift] * gain;
    }
    let peak = 0.001;
    for (let i = 0; i < len; i += 1) {
      const t = i / sr;
      const flutter = kind === "spring" ? 0.62 + 0.38 * Math.sin(2 * Math.PI * (channel === 0 ? 3.2 : 4.8) * t) : 1;
      data[i] *= flutter;
      peak = Math.max(peak, Math.abs(data[i]));
    }
    const norm = 0.85 / peak;
    for (let i = 0; i < len; i += 1) data[i] *= norm;
  }
  return buffer;
}

function disconnectAll(nodes: AudioNode[]) {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      // Already disconnected.
    }
  }
}

function stopOsc(osc: OscillatorNode) {
  try {
    osc.stop();
  } catch {
    // Already stopped.
  }
}

function createPedal(ctx: AudioContext, kind: PedalKind): PedalNode {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 1;
  wet.gain.value = 0;
  input.connect(dry);
  dry.connect(output);
  const nodes: AudioNode[] = [input, output, dry, wet];
  const oscs: OscillatorNode[] = [];
  let gateTimer: ReturnType<typeof setInterval> | null = null;
  const now = () => ctx.currentTime;

  const mixBypass = (on: boolean, mix: number) => {
    dry.gain.setTargetAtTime(on ? 1 - mix : 1, now(), 0.012);
    wet.gain.setTargetAtTime(on ? mix : 0, now(), 0.012);
  };

  let follow: ((hz: number) => void) | undefined;

  if (kind === "gate") {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    input.connect(analyser);
    input.connect(gain);
    gain.connect(wet);
    wet.connect(output);
    nodes.push(analyser, gain);
    const data = new Uint8Array(analyser.fftSize);
    let thresh = 0.03;
    gateTimer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const sample = (value - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / data.length);
      gain.gain.setTargetAtTime(rms >= thresh ? 1 : 0, now(), rms >= thresh ? 0.004 : 0.04);
    }, 40);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        thresh = params.thresh ?? 0.03;
        mixBypass(on, 1);
      },
      dispose: () => {
        if (gateTimer) clearInterval(gateTimer);
        disconnectAll(nodes);
      },
    };
  }

  if (kind === "comp") {
    const comp = ctx.createDynamicsCompressor();
    comp.knee.value = 8;
    comp.release.value = 0.18;
    const level = ctx.createGain();
    input.connect(comp);
    comp.connect(level);
    level.connect(wet);
    wet.connect(output);
    nodes.push(comp, level);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        const amount = params.amount ?? 0.4;
        comp.threshold.setTargetAtTime(-10 - amount * 24, now(), 0.03);
        comp.ratio.setTargetAtTime(1.4 + amount * 8, now(), 0.03);
        comp.attack.setTargetAtTime(0.003 + (params.attack ?? 0.3) * 0.05, now(), 0.03);
        level.gain.setTargetAtTime(0.7 + (params.level ?? 0.6) * 1.6, now(), 0.03);
        mixBypass(on, 1);
      },
      dispose: () => disconnectAll(nodes),
    };
  }

  if (kind === "drive" || kind === "dist" || kind === "fuzz") {
    const pre = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = kind === "fuzz" ? 140 : 70;
    const shaper = ctx.createWaveShaper();
    shaper.curve = CLIP_CURVES[kind] as Float32Array<ArrayBuffer>;
    shaper.oversample = "4x";
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    const level = ctx.createGain();
    input.connect(pre);
    pre.connect(hp);
    hp.connect(shaper);
    shaper.connect(tone);
    tone.connect(level);
    level.connect(wet);
    wet.connect(output);
    nodes.push(pre, hp, shaper, tone, level);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        const drive = params.drive ?? 0.45;
        const span = kind === "fuzz" ? 42 : kind === "dist" ? 28 : 16;
        pre.gain.setTargetAtTime(1 + drive * span, now(), 0.02);
        const max = kind === "fuzz" ? 2400 : kind === "dist" ? 4200 : 6200;
        tone.frequency.setTargetAtTime(logFreq(500, max, params.tone ?? 0.5), now(), 0.02);
        level.gain.setTargetAtTime(0.18 + (params.level ?? 0.55) * 0.7, now(), 0.02);
        mixBypass(on, 1);
      },
      dispose: () => disconnectAll(nodes),
    };
  }

  if (kind === "eq") {
    const bass = ctx.createBiquadFilter();
    bass.type = "lowshelf";
    bass.frequency.value = 120;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 800;
    mid.Q.value = 0.8;
    const treble = ctx.createBiquadFilter();
    treble.type = "highshelf";
    treble.frequency.value = 3200;
    input.connect(bass);
    bass.connect(mid);
    mid.connect(treble);
    treble.connect(wet);
    wet.connect(output);
    nodes.push(bass, mid, treble);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        bass.gain.setTargetAtTime(params.bass ?? 0, now(), 0.02);
        mid.gain.setTargetAtTime(params.mid ?? 0, now(), 0.02);
        treble.gain.setTargetAtTime(params.treble ?? 0, now(), 0.02);
        mixBypass(on, 1);
      },
      dispose: () => disconnectAll(nodes),
    };
  }

  if (kind === "wah") {
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 7;
    filter.frequency.value = 700;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    depth.gain.value = 0;
    lfo.frequency.value = 1.6;
    lfo.connect(depth);
    depth.connect(filter.frequency);
    lfo.start();
    oscs.push(lfo);
    input.connect(filter);
    filter.connect(wet);
    wet.connect(output);
    nodes.push(filter, depth);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        const position = params.position ?? 0.35;
        filter.frequency.setTargetAtTime(logFreq(320, 2200, position), now(), 0.03);
        const auto = params.auto ?? 0;
        lfo.frequency.setTargetAtTime(0.3 + auto * 5, now(), 0.05);
        depth.gain.setTargetAtTime(auto * 520, now(), 0.05);
        mixBypass(on, 1);
      },
      dispose: () => {
        for (const osc of oscs) stopOsc(osc);
        disconnectAll(nodes);
      },
    };
  }

  if (kind === "octave") {
    const pass = ctx.createGain();
    pass.gain.value = 0.85;
    const shaper = ctx.createWaveShaper();
    shaper.curve = FOLD_CURVE as Float32Array<ArrayBuffer>;
    const upHp = ctx.createBiquadFilter();
    upHp.type = "highpass";
    upHp.frequency.value = 160;
    const upGain = ctx.createGain();
    upGain.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 55;
    const subGain = ctx.createGain();
    subGain.gain.value = 0;
    osc.connect(subGain);
    osc.start();
    oscs.push(osc);
    input.connect(pass);
    input.connect(shaper);
    shaper.connect(upHp);
    upHp.connect(upGain);
    pass.connect(wet);
    upGain.connect(wet);
    subGain.connect(wet);
    wet.connect(output);
    nodes.push(pass, shaper, upHp, upGain, subGain);
    let on = false;
    let subAmt = 0.4;
    follow = (hz: number) => {
      const audible = on && hz > 0;
      if (audible) osc.frequency.setTargetAtTime(clamp(hz / 2, 30, 420), now(), 0.04);
      subGain.gain.setTargetAtTime(audible ? subAmt * 0.85 : 0, now(), 0.04);
    };
    return {
      kind,
      input,
      output,
      follow,
      apply: (params, engaged) => {
        on = engaged;
        subAmt = params.sub ?? 0.4;
        upGain.gain.setTargetAtTime(engaged ? (params.up ?? 0) * 0.45 : 0, now(), 0.03);
        mixBypass(engaged, 1);
        if (!engaged) subGain.gain.setTargetAtTime(0, now(), 0.03);
      },
      dispose: () => {
        for (const item of oscs) stopOsc(item);
        disconnectAll(nodes);
      },
    };
  }

  if (kind === "chorus" || kind === "flanger") {
    const merger = ctx.createChannelMerger(2);
    const base = kind === "chorus" ? 0.016 : 0.0036;
    const maxDelay = kind === "chorus" ? 0.05 : 0.02;
    const voices = [0, 1].map((channel) => {
      const delay = ctx.createDelay(maxDelay);
      delay.delayTime.value = base * (channel === 0 ? 1 : 1.12);
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      depth.gain.value = 0.001;
      lfo.frequency.value = 0.6;
      lfo.connect(depth);
      depth.connect(delay.delayTime);
      lfo.start();
      oscs.push(lfo);
      input.connect(delay);
      delay.connect(merger, 0, channel);
      nodes.push(delay, depth);
      return { delay, lfo, depth };
    });
    let fb: GainNode | null = null;
    let tone: BiquadFilterNode | null = null;
    if (kind === "flanger") {
      fb = ctx.createGain();
      tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 2800;
      tone.connect(fb);
      for (const voice of voices) {
        voice.delay.connect(tone);
        fb.connect(voice.delay);
      }
      nodes.push(fb, tone);
    }
    merger.connect(wet);
    wet.connect(output);
    nodes.push(merger);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        const rate = params.rate ?? 0.8;
        const depth = params.depth ?? (kind === "chorus" ? 0.003 : 0.001);
        voices[0].lfo.frequency.setTargetAtTime(rate, now(), 0.05);
        voices[1].lfo.frequency.setTargetAtTime(rate * 1.17, now(), 0.05);
        const safe = Math.min(depth, base * 0.72);
        voices[0].depth.gain.setTargetAtTime(safe, now(), 0.05);
        voices[1].depth.gain.setTargetAtTime(safe * 0.86, now(), 0.05);
        if (fb) fb.gain.setTargetAtTime(params.feedback ?? 0.3, now(), 0.04);
        mixBypass(on, kind === "chorus" ? (params.mix ?? 0.45) : 0.55);
      },
      dispose: () => {
        for (const osc of oscs) stopOsc(osc);
        disconnectAll(nodes);
      },
    };
  }

  if (kind === "phaser") {
    const filters: BiquadFilterNode[] = [];
    let node: AudioNode = input;
    for (let i = 0; i < 4; i += 1) {
      const filter = ctx.createBiquadFilter();
      filter.type = "allpass";
      filter.frequency.value = 1100;
      filter.Q.value = 0.8;
      node.connect(filter);
      node = filter;
      filters.push(filter);
      nodes.push(filter);
    }
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    depth.gain.value = 400;
    lfo.frequency.value = 0.4;
    lfo.connect(depth);
    for (const filter of filters) depth.connect(filter.frequency);
    lfo.start();
    oscs.push(lfo);
    const fb = ctx.createGain();
    fb.gain.value = 0.15;
    node.connect(fb);
    fb.connect(filters[0]);
    node.connect(wet);
    wet.connect(output);
    nodes.push(depth, fb);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        lfo.frequency.setTargetAtTime(params.rate ?? 0.4, now(), 0.05);
        depth.gain.setTargetAtTime(params.depth ?? 500, now(), 0.05);
        fb.gain.setTargetAtTime(params.feedback ?? 0.15, now(), 0.04);
        mixBypass(on, 0.7);
      },
      dispose: () => {
        for (const osc of oscs) stopOsc(osc);
        disconnectAll(nodes);
      },
    };
  }

  if (kind === "tremolo") {
    const gain = ctx.createGain();
    gain.gain.value = 1;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    lfo.frequency.value = 4;
    lfo.connect(depth);
    depth.connect(gain.gain);
    lfo.start();
    oscs.push(lfo);
    input.connect(gain);
    gain.connect(wet);
    wet.connect(output);
    nodes.push(gain, depth);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        const amount = params.depth ?? 0.6;
        lfo.frequency.setTargetAtTime(params.rate ?? 4, now(), 0.05);
        gain.gain.setTargetAtTime(1 - amount * 0.48, now(), 0.04);
        depth.gain.setTargetAtTime(amount * 0.48, now(), 0.04);
        mixBypass(on, 1);
      },
      dispose: () => {
        for (const osc of oscs) stopOsc(osc);
        disconnectAll(nodes);
      },
    };
  }

  if (kind === "boost") {
    // Treble booster: a single-transistor style lift of the upper mids that
    // hits the amp's first gain stage harder, with gentle asymmetric clipping.
    const pre = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.Q.value = 0.6;
    const peak = ctx.createBiquadFilter();
    peak.type = "peaking";
    peak.frequency.value = 2600;
    peak.Q.value = 0.7;
    const shaper = ctx.createWaveShaper();
    shaper.curve = BOOST_CURVE as Float32Array<ArrayBuffer>;
    shaper.oversample = "4x";
    const level = ctx.createGain();
    input.connect(pre);
    pre.connect(hp);
    hp.connect(peak);
    peak.connect(shaper);
    shaper.connect(level);
    level.connect(wet);
    wet.connect(output);
    nodes.push(pre, hp, peak, shaper, level);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        const range = params.range ?? 0.7;
        const boost = params.boost ?? 0.5;
        hp.frequency.setTargetAtTime(logFreq(40, 900, range), now(), 0.02);
        peak.gain.setTargetAtTime(range * 9, now(), 0.02);
        pre.gain.setTargetAtTime(1 + boost * 5, now(), 0.02);
        level.gain.setTargetAtTime(0.35 + (params.level ?? 0.6) * 0.9, now(), 0.02);
        mixBypass(on, 1);
      },
      dispose: () => disconnectAll(nodes),
    };
  }

  if (kind === "klon") {
    // Transparent overdrive: a clean path is summed with a mid-humped,
    // diode-clipped path. As gain rises the clean share falls (ganged pot).
    const clean = ctx.createGain();
    const pre = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 110;
    const hump = ctx.createBiquadFilter();
    hump.type = "peaking";
    hump.frequency.value = 1000;
    hump.Q.value = 0.7;
    hump.gain.value = 5;
    const shaper = ctx.createWaveShaper();
    shaper.curve = DIODE_CURVE as Float32Array<ArrayBuffer>;
    shaper.oversample = "4x";
    const dirty = ctx.createGain();
    const sum = ctx.createGain();
    const treble = ctx.createBiquadFilter();
    treble.type = "highshelf";
    treble.frequency.value = 1800;
    const level = ctx.createGain();
    input.connect(clean);
    clean.connect(sum);
    input.connect(pre);
    pre.connect(hp);
    hp.connect(hump);
    hump.connect(shaper);
    shaper.connect(dirty);
    dirty.connect(sum);
    sum.connect(treble);
    treble.connect(level);
    level.connect(wet);
    wet.connect(output);
    nodes.push(clean, pre, hp, hump, shaper, dirty, sum, treble, level);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        const gain = params.gain ?? 0.35;
        clean.gain.setTargetAtTime(0.75 * (1 - gain * 0.8), now(), 0.02);
        pre.gain.setTargetAtTime(1.5 + gain * 22, now(), 0.02);
        dirty.gain.setTargetAtTime(0.25 + gain * 0.35, now(), 0.02);
        treble.gain.setTargetAtTime(((params.treble ?? 0.5) - 0.5) * 14, now(), 0.02);
        level.gain.setTargetAtTime(0.3 + (params.level ?? 0.62) * 1.1, now(), 0.02);
        mixBypass(on, 1);
      },
      dispose: () => disconnectAll(nodes),
    };
  }

  if (kind === "univibe") {
    // Four staggered all-pass stages swept by a skewed "lamp" LFO (fast rise,
    // slow decay) plus a little amplitude throb. Chorus = dry+wet, vibrato = wet.
    const centers = [95, 330, 1050, 2900];
    const filters: BiquadFilterNode[] = [];
    const depths: GainNode[] = [];
    let node: AudioNode = input;
    const lfo = ctx.createOscillator();
    lfo.setPeriodicWave(
      ctx.createPeriodicWave([0, 0, -0.32, 0, -0.06], [0, 1, 0, 0.12, 0]),
    );
    lfo.frequency.value = 2.2;
    for (const hz of centers) {
      const filter = ctx.createBiquadFilter();
      filter.type = "allpass";
      filter.frequency.value = hz;
      filter.Q.value = 0.55;
      const depth = ctx.createGain();
      depth.gain.value = hz * 0.6;
      lfo.connect(depth);
      depth.connect(filter.frequency);
      node.connect(filter);
      node = filter;
      filters.push(filter);
      depths.push(depth);
    }
    const throb = ctx.createGain();
    const throbDepth = ctx.createGain();
    throbDepth.gain.value = 0.08;
    lfo.connect(throbDepth);
    throbDepth.connect(throb.gain);
    node.connect(throb);
    throb.connect(wet);
    wet.connect(output);
    lfo.start();
    oscs.push(lfo);
    nodes.push(...filters, ...depths, throb, throbDepth);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        const intensity = params.intensity ?? 0.7;
        lfo.frequency.setTargetAtTime(params.speed ?? 2.2, now(), 0.05);
        depths.forEach((depth, index) => depth.gain.setTargetAtTime(centers[index] * (0.15 + intensity * 0.7), now(), 0.05));
        throb.gain.setTargetAtTime(1 - intensity * 0.1, now(), 0.05);
        throbDepth.gain.setTargetAtTime(intensity * 0.1, now(), 0.05);
        mixBypass(on, (params.mode ?? 0) >= 0.5 ? 1 : 0.5);
      },
      dispose: () => {
        for (const osc of oscs) stopOsc(osc);
        disconnectAll(nodes);
      },
    };
  }

  if (kind === "varitone") {
    // Six-way passive notch selector (position 1 = bypass on the real switch;
    // here 0 = off). Each position carves a deeper, lower notch.
    const notch = ctx.createBiquadFilter();
    notch.type = "peaking";
    notch.Q.value = 2.2;
    notch.gain.value = 0;
    input.connect(notch);
    notch.connect(wet);
    wet.connect(output);
    nodes.push(notch);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        const pos = Math.round(clamp(params.pos ?? 2, 0, 6));
        notch.frequency.setTargetAtTime(VARITONE_HZ[pos] ?? 1000, now(), 0.02);
        notch.gain.setTargetAtTime(pos === 0 ? 0 : -15, now(), 0.02);
        mixBypass(on, 1);
      },
      dispose: () => disconnectAll(nodes),
    };
  }

  if (kind === "delay") {
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2800;
    input.connect(delay);
    delay.connect(tone);
    tone.connect(fb);
    fb.connect(delay);
    tone.connect(wet);
    wet.connect(output);
    nodes.push(delay, fb, tone);
    return {
      kind,
      input,
      output,
      apply: (params, on) => {
        delay.delayTime.setTargetAtTime(clamp(params.time ?? 0.32, 0.05, 1.4), now(), 0.04);
        fb.gain.setTargetAtTime(clamp(params.feedback ?? 0.35, 0, 0.85), now(), 0.04);
        mixBypass(on, params.mix ?? 0.3);
      },
      dispose: () => disconnectAll(nodes),
    };
  }

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 5000;
  const verb = ctx.createConvolver();
  verb.normalize = false;
  let irKey = "";
  input.connect(filter);
  filter.connect(verb);
  verb.connect(wet);
  wet.connect(output);
  nodes.push(filter, verb);
  return {
    kind,
    input,
    output,
    apply: (params, on) => {
      const decay = params.decay ?? 0.45;
      const key = `${Math.round(decay * 8)}`;
      if (key !== irKey) {
        irKey = key;
        const seconds = 0.5 + decay * 1.5;
        verb.buffer = makeImpulse(ctx, seconds, "spring");
      }
      filter.frequency.setTargetAtTime(logFreq(900, 8000, params.tone ?? 0.6), now(), 0.04);
      mixBypass(on, params.mix ?? 0.3);
    },
    dispose: () => disconnectAll(nodes),
  };
}

type Voice = { note: number; stop: (when: number) => void };

export type TunerReading = {
  hz: number;
  rms: number;
  /** Peak of the live input before the input-gain stage, 0..1. */
  peak: number;
  /** True for ~1s after the live input came within 0.5 dB of full scale. */
  clip: boolean;
};

export type InputChannel = "mix" | "left" | "right";
export type LiveOptions = { deviceId?: string; channel?: InputChannel };
export type LatencyMode = "interactive" | "balanced";

export type AudioDevices = { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] };

/** List audio I/O devices. Labels are only filled after mic permission. */
export async function listAudioDevices(): Promise<AudioDevices> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs: all.filter((device) => device.kind === "audioinput"),
    outputs: all.filter((device) => device.kind === "audiooutput"),
  };
}

export function canPickOutput(): boolean {
  return typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
}

export class RigEngine {
  readonly ctx: AudioContext;
  private readonly inputGain: GainNode;
  private readonly fxSend: GainNode;
  private readonly tuner: AnalyserNode;
  private readonly tunerBuf: Float32Array;
  private readonly ampInput: GainNode;
  private readonly hp: BiquadFilterNode;
  private readonly bass: BiquadFilterNode;
  private readonly mid: BiquadFilterNode;
  private readonly treble: BiquadFilterNode;
  private readonly drive: GainNode;
  private readonly shaper: WaveShaperNode;
  private readonly sag: DynamicsCompressorNode;
  private readonly presence: BiquadFilterNode;
  private readonly cabHp: BiquadFilterNode;
  private readonly cabMid: BiquadFilterNode;
  private readonly cabLp: BiquadFilterNode;
  private readonly ampOut: GainNode;
  private readonly dry: GainNode;
  private readonly verbFilter: BiquadFilterNode;
  private readonly verb: ConvolverNode;
  private readonly wet: GainNode;
  private readonly master: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly backingGain: GainNode;
  private backingSrc: AudioBufferSourceNode | null = null;
  private backingBuffer: AudioBuffer | null = null;
  private backingOffset = 0;
  private backingStarted = 0;
  private backingPlaying = false;
  private backingRate = 1;
  private backingLoop = true;
  private liveSrc: MediaStreamAudioSourceNode | null = null;
  private liveStream: MediaStream | null = null;
  private readonly pedals = new Map<string, PedalNode>();
  private order: string[] = [];
  private voices: Voice[] = [];
  private noise: AudioBuffer | null = null;
  private shape: AmpShape | null = null;
  private irKey = "";
  private timer: ReturnType<typeof setInterval> | null = null;
  private metroTimer: ReturnType<typeof setInterval> | null = null;
  private metroNext = 0;
  private metroBeat = 0;
  private smoothHz = 0;
  private miss = 0;
  private reading: TunerReading = { hz: 0, rms: 0, peak: 0, clip: false };
  private closed = false;
  // Live input conditioning: DC/rumble high-pass, trim, and a pre-gain meter.
  private readonly liveHp: BiquadFilterNode;
  private readonly liveTrim: GainNode;
  private readonly inMeter: AnalyserNode;
  private readonly inMeterBuf: Float32Array;
  private liveSplit: ChannelSplitterNode | null = null;
  private clipUntil = 0;
  // Cabinet + mic simulation (filter cab or user IR), and room pickup.
  private readonly cabFilterPath: GainNode;
  private readonly cabNotch: BiquadFilterNode;
  private readonly micPeak: BiquadFilterNode;
  private readonly micLow: BiquadFilterNode;
  private readonly irConv: ConvolverNode;
  private readonly irPath: GainNode;
  private readonly cabSum: GainNode;
  private readonly roomDelay: DelayNode;
  private readonly roomTone: BiquadFilterNode;
  private readonly roomGain: GainNode;
  private cabId: CabId = "auto";
  private micId: MicId = "sm57";
  private ampId: AmpId = "blackface";
  private ampKnobs: AmpKnobs = { ...DEFAULT_KNOBS };
  private userIr: AudioBuffer | null = null;
  // Feedback (howl) guard state.
  private howlTicks = 0;
  private lastRms = 0;
  private howlMuted = false;
  private masterLevel = 0.8;
  /** Disable to never auto-mute (e.g. amp sim through a speaker on purpose). */
  howlGuard = true;
  onBeat: ((beat: number) => void) | null = null;
  /** Fires when the howl guard mutes (true) or the user re-arms it (false). */
  onFeedback: ((muted: boolean) => void) | null = null;

  constructor(opts: { latency?: LatencyMode } = {}) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx({ latencyHint: opts.latency ?? "interactive" });
    this.inputGain = this.ctx.createGain();
    this.inputGain.gain.value = 0.85;
    this.fxSend = this.ctx.createGain();
    this.tuner = this.ctx.createAnalyser();
    this.tuner.fftSize = 4096;
    this.tuner.smoothingTimeConstant = 0;
    this.tunerBuf = new Float32Array(this.tuner.fftSize);
    this.inputGain.connect(this.tuner);
    this.inputGain.connect(this.fxSend);

    this.liveHp = this.ctx.createBiquadFilter();
    this.liveHp.type = "highpass";
    this.liveHp.frequency.value = 28;
    this.liveHp.Q.value = 0.6;
    this.liveTrim = this.ctx.createGain();
    this.inMeter = this.ctx.createAnalyser();
    this.inMeter.fftSize = 1024;
    this.inMeterBuf = new Float32Array(this.inMeter.fftSize);
    this.liveHp.connect(this.liveTrim);
    this.liveHp.connect(this.inMeter);
    this.liveTrim.connect(this.inputGain);

    this.ampInput = this.ctx.createGain();
    this.hp = this.ctx.createBiquadFilter();
    this.hp.type = "highpass";
    this.bass = this.ctx.createBiquadFilter();
    this.bass.type = "lowshelf";
    this.mid = this.ctx.createBiquadFilter();
    this.mid.type = "peaking";
    this.mid.Q.value = 0.75;
    this.treble = this.ctx.createBiquadFilter();
    this.treble.type = "highshelf";
    this.drive = this.ctx.createGain();
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.oversample = "4x";
    this.sag = this.ctx.createDynamicsCompressor();
    this.sag.knee.value = 12;
    this.sag.attack.value = 0.02;
    this.sag.release.value = 0.25;
    this.presence = this.ctx.createBiquadFilter();
    this.presence.type = "highshelf";
    this.cabHp = this.ctx.createBiquadFilter();
    this.cabHp.type = "highpass";
    this.cabHp.Q.value = 0.7;
    this.cabMid = this.ctx.createBiquadFilter();
    this.cabMid.type = "peaking";
    this.cabMid.Q.value = 0.8;
    this.cabLp = this.ctx.createBiquadFilter();
    this.cabLp.type = "lowpass";
    this.cabLp.Q.value = 0.55;
    this.ampOut = this.ctx.createGain();
    this.ampInput.connect(this.hp);
    this.hp.connect(this.bass);
    this.bass.connect(this.mid);
    this.mid.connect(this.treble);
    this.treble.connect(this.drive);
    this.drive.connect(this.shaper);
    this.shaper.connect(this.sag);
    this.sag.connect(this.presence);
    this.cabFilterPath = this.ctx.createGain();
    this.cabNotch = this.ctx.createBiquadFilter();
    this.cabNotch.type = "peaking";
    this.cabNotch.Q.value = 1.4;
    this.micPeak = this.ctx.createBiquadFilter();
    this.micPeak.type = "peaking";
    this.micLow = this.ctx.createBiquadFilter();
    this.micLow.type = "lowshelf";
    this.micLow.frequency.value = 160;
    this.irConv = this.ctx.createConvolver();
    this.irConv.normalize = true;
    this.irPath = this.ctx.createGain();
    this.irPath.gain.value = 0;
    this.cabSum = this.ctx.createGain();
    this.roomDelay = this.ctx.createDelay(0.1);
    this.roomDelay.delayTime.value = 0.011;
    this.roomTone = this.ctx.createBiquadFilter();
    this.roomTone.type = "lowpass";
    this.roomTone.frequency.value = 3200;
    this.roomGain = this.ctx.createGain();
    this.roomGain.gain.value = 0.12;
    // presence ─┬─ cabHp → cabMid → cabNotch → cabLp → micLow → micPeak → filterPath ─┐
    //           └─ irConv → irPath ─────────────────────────────────────────────────────┴─ cabSum ─┬─ ampOut
    //                                                                            room delay/tone ─┘
    this.presence.connect(this.cabHp);
    this.cabHp.connect(this.cabMid);
    this.cabMid.connect(this.cabNotch);
    this.cabNotch.connect(this.cabLp);
    this.cabLp.connect(this.micLow);
    this.micLow.connect(this.micPeak);
    this.micPeak.connect(this.cabFilterPath);
    this.cabFilterPath.connect(this.cabSum);
    this.presence.connect(this.irConv);
    this.irConv.connect(this.irPath);
    this.irPath.connect(this.cabSum);
    this.cabSum.connect(this.ampOut);
    this.cabSum.connect(this.roomDelay);
    this.roomDelay.connect(this.roomTone);
    this.roomTone.connect(this.roomGain);
    this.roomGain.connect(this.ampOut);

    this.dry = this.ctx.createGain();
    this.verbFilter = this.ctx.createBiquadFilter();
    this.verbFilter.type = "lowpass";
    this.verb = this.ctx.createConvolver();
    this.verb.normalize = false;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.ampOut.connect(this.dry);
    this.ampOut.connect(this.verbFilter);
    this.verbFilter.connect(this.verb);
    this.verb.connect(this.wet);
    this.dry.connect(this.master);
    this.wet.connect(this.master);
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
    this.backingGain = this.ctx.createGain();
    this.backingGain.gain.value = 0.7;
    this.backingGain.connect(this.ctx.destination);
    this.fxSend.connect(this.ampInput);

    this.timer = setInterval(() => this.analyse(), 90);
  }

  resume(): Promise<void> {
    if (this.ctx.state === "running") return Promise.resolve();
    return this.ctx.resume().then(() => undefined);
  }

  read(): TunerReading {
    return this.reading;
  }

  /** Round-trip-ish latency estimate in ms (output buffer + device + input frame). */
  latencyMs(): number {
    const ctx = this.ctx as AudioContext & { outputLatency?: number };
    const base = ctx.baseLatency ?? 0;
    const out = ctx.outputLatency ?? 0;
    const inputGuess = 128 / ctx.sampleRate;
    return Math.round((base + out + inputGuess) * 1000);
  }

  /** Route the whole rig to a chosen output (headphones / interface). Chrome & Edge only. */
  async setOutputDevice(deviceId: string): Promise<boolean> {
    const ctx = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (!ctx.setSinkId) return false;
    try {
      await ctx.setSinkId(deviceId === "default" ? "" : deviceId);
      return true;
    } catch {
      return false;
    }
  }

  /** Re-arm output after the howl guard muted it. */
  rearmFeedback() {
    this.howlMuted = false;
    this.howlTicks = 0;
    this.master.gain.setTargetAtTime(this.masterLevel, this.ctx.currentTime, 0.05);
    this.onFeedback?.(false);
  }

  setInputTrim(db: number) {
    this.liveTrim.gain.setTargetAtTime(10 ** (clamp(db, -24, 24) / 20), this.ctx.currentTime, 0.02);
  }

  setCab(cab: CabId, mic: MicId, air: number) {
    this.cabId = cab;
    this.micId = mic;
    const t = this.ctx.currentTime;
    this.roomGain.gain.setTargetAtTime(clamp(air, 0, 1) * 0.32, t, 0.04);
    this.roomDelay.delayTime.setTargetAtTime(0.006 + clamp(air, 0, 1) * 0.018, t, 0.04);
    this.applyCab();
  }

  /** Load a user cabinet impulse response (WAV). Pass null to clear. */
  setUserIr(buffer: AudioBuffer | null) {
    this.userIr = buffer;
    if (buffer) this.irConv.buffer = buffer;
    this.applyCab();
  }

  hasUserIr(): boolean {
    return this.userIr != null;
  }

  private applyCab() {
    const t = this.ctx.currentTime;
    const model = ampById(this.ampId) ?? AMPS[1];
    const useIr = this.cabId === "ir" && this.userIr != null;
    this.irPath.gain.setTargetAtTime(useIr ? 0.9 : 0, t, 0.03);
    this.cabFilterPath.gain.setTargetAtTime(useIr ? 0 : 1, t, 0.03);
    const profile: CabProfile =
      this.cabId === "auto" || this.cabId === "ir"
        ? { lo: model.cabLo, hi: model.cabHi, bumpHz: model.cabBumpHz, bumpDb: model.cabBumpDb, notchHz: 450, notchDb: -1.5 }
        : CAB_PROFILES[this.cabId];
    const mic = MIC_PROFILES[this.micId];
    this.cabHp.frequency.setTargetAtTime(profile.lo, t, 0.03);
    this.cabMid.frequency.setTargetAtTime(profile.bumpHz, t, 0.03);
    this.cabMid.gain.setTargetAtTime(profile.bumpDb, t, 0.03);
    this.cabNotch.frequency.setTargetAtTime(profile.notchHz, t, 0.03);
    this.cabNotch.gain.setTargetAtTime(profile.notchDb, t, 0.03);
    this.cabLp.frequency.setTargetAtTime(profile.hi * mic.hiMul * (0.72 + this.ampKnobs.presence * 0.5), t, 0.03);
    this.micPeak.frequency.setTargetAtTime(mic.peakHz, t, 0.03);
    this.micPeak.gain.setTargetAtTime(useIr ? 0 : mic.peakDb, t, 0.03);
    this.micPeak.Q.setTargetAtTime(mic.q, t, 0.03);
    this.micLow.gain.setTargetAtTime(useIr ? 0 : mic.lowDb, t, 0.03);
  }

  setInput(value: number) {
    this.inputGain.gain.setTargetAtTime(clamp(value, 0, 1.5), this.ctx.currentTime, 0.02);
  }

  setMaster(value: number) {
    this.masterLevel = clamp(value, 0, 1);
    if (this.howlMuted) return;
    this.master.gain.setTargetAtTime(this.masterLevel, this.ctx.currentTime, 0.02);
  }

  setAmp(id: AmpId, knobs: AmpKnobs) {
    const model = ampById(id) ?? AMPS[1];
    const t = this.ctx.currentTime;
    if (this.shape !== model.shape) {
      this.shaper.curve = AMP_CURVES[model.shape] as Float32Array<ArrayBuffer>;
      this.shape = model.shape;
    }
    this.hp.frequency.setTargetAtTime(model.cabLo, t, 0.03);
    this.bass.frequency.setTargetAtTime(model.bassHz, t, 0.03);
    this.mid.frequency.setTargetAtTime(model.midHz, t, 0.03);
    this.treble.frequency.setTargetAtTime(model.trebleHz, t, 0.03);
    this.presence.frequency.setTargetAtTime(model.family === "bass" ? 1800 : 3800, t, 0.03);
    this.bass.gain.setTargetAtTime(model.bass + (knobs.bass - 0.5) * 16, t, 0.03);
    this.mid.gain.setTargetAtTime(model.mid + (knobs.mid - 0.5) * 16, t, 0.03);
    this.treble.gain.setTargetAtTime(model.treble + (knobs.treble - 0.5) * 14, t, 0.03);
    this.presence.gain.setTargetAtTime(model.presence + (knobs.presence - 0.5) * 10, t, 0.03);
    const pre = model.drive * (0.4 + knobs.gain * 1.25);
    this.drive.gain.setTargetAtTime(pre, t, 0.02);
    this.ampId = model.id;
    this.ampKnobs = { ...knobs };
    this.applyCab();
    const trim = model.shape === "hot" ? 0.42 : model.shape === "tube" ? 0.58 : 0.72;
    this.ampOut.gain.setTargetAtTime(trim * (0.25 + knobs.master * 0.95), t, 0.03);
    this.sag.threshold.setTargetAtTime(-6 - knobs.sag * 20, t, 0.04);
    this.sag.ratio.setTargetAtTime(1 + knobs.sag * (model.tube ? 7 : 3), t, 0.04);
    this.sag.attack.setTargetAtTime(0.008 + knobs.sag * 0.04, t, 0.04);
    this.sag.release.setTargetAtTime(0.12 + knobs.sag * 0.28, t, 0.04);
  }

  setAmbience(ambience: Ambience) {
    const t = this.ctx.currentTime;
    const wet = ambience.kind === "off" ? 0 : ambience.mix * 0.8;
    this.wet.gain.setTargetAtTime(wet, t, 0.04);
    this.verbFilter.frequency.setTargetAtTime(logFreq(1000, 11000, ambience.tone), t, 0.04);
    if (ambience.kind === "off") return;
    const key = `${ambience.kind}:${Math.round(ambience.decay * 8)}`;
    if (key === this.irKey) return;
    this.irKey = key;
    const base = ambience.kind === "hall" ? 2.3 : ambience.kind === "plate" ? 1.6 : ambience.kind === "spring" ? 1.25 : 0.85;
    this.verb.buffer = makeImpulse(this.ctx, base * (0.45 + ambience.decay * 0.85), ambience.kind);
  }

  setPedals(list: PedalState[]) {
    const same =
      list.length === this.order.length &&
      list.every((pedal, index) => pedal.id === this.order[index] && this.pedals.get(pedal.id)?.kind === pedal.kind);
    if (!same) {
      const keep = new Set(list.map((pedal) => pedal.id));
      for (const [id, node] of this.pedals) {
        if (keep.has(id)) continue;
        node.dispose();
        this.pedals.delete(id);
      }
      for (const pedal of list) {
        if (!this.pedals.has(pedal.id)) this.pedals.set(pedal.id, createPedal(this.ctx, pedal.kind));
      }
      this.order = list.map((pedal) => pedal.id);
      this.rewire();
    }
    for (const pedal of list) this.pedals.get(pedal.id)?.apply(pedal.params, pedal.on);
  }

  async openLive(opts: LiveOptions = {}): Promise<void> {
    this.closeLive();
    await this.resume();
    const channel = opts.channel ?? "mix";
    // Raw path: no echo cancel / noise suppression / AGC — those smear
    // transients, add 10–40 ms and pump the signal. Ask for low latency.
    const audio: MediaTrackConstraints & { latency?: number } = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: channel === "mix" ? 1 : 2,
      latency: 0.005,
    };
    if (opts.deviceId && opts.deviceId !== "default") audio.deviceId = { exact: opts.deviceId };
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    const src = this.ctx.createMediaStreamSource(stream);
    if (channel === "mix") {
      src.connect(this.liveHp);
    } else {
      // Two-input interfaces (e.g. guitar on input 1, mic on input 2):
      // take only the chosen side so the other input doesn't bleed in.
      const split = this.ctx.createChannelSplitter(2);
      src.connect(split);
      split.connect(this.liveHp, channel === "left" ? 0 : 1);
      this.liveSplit = split;
    }
    this.liveSrc = src;
    this.liveStream = stream;
    this.howlTicks = 0;
  }

  /** The raw live input stream (e.g. to share with a jam room). */
  liveMediaStream(): MediaStream | null {
    return this.liveStream;
  }

  closeLive() {
    this.liveStream?.getTracks().forEach((track) => track.stop());
    try {
      this.liveSrc?.disconnect();
      this.liveSplit?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.liveSplit = null;
    this.liveSrc = null;
    this.liveStream = null;
  }

  noteOn(note: number, kind: "guitar" | "bass", velocity = 0.86) {
    if (this.closed) return;
    this.noteOff(note);
    if (this.voices.length > 7) {
      const old = this.voices.shift();
      old?.stop(this.ctx.currentTime);
    }
    const freq = 440 * 2 ** ((note - 69) / 12);
    const stop = kind === "bass" ? this.bassVoice(freq, velocity) : this.guitarVoice(freq, velocity);
    this.voices.push({ note, stop });
  }

  noteOff(note: number) {
    const index = this.voices.findIndex((voice) => voice.note === note);
    if (index < 0) return;
    const [voice] = this.voices.splice(index, 1);
    voice.stop(this.ctx.currentTime);
  }

  releaseAll() {
    const voices = this.voices.splice(0);
    const t = this.ctx.currentTime;
    for (const voice of voices) voice.stop(t);
  }

  loadBacking(buffer: AudioBuffer, autoplay: boolean) {
    this.stopBackingSrc();
    this.backingBuffer = buffer;
    this.backingOffset = 0;
    this.backingPlaying = false;
    if (autoplay) this.playBacking();
  }

  hasBacking(): boolean {
    return this.backingBuffer != null;
  }

  backingDuration(): number {
    return this.backingBuffer?.duration ?? 0;
  }

  backingIsPlaying(): boolean {
    if (!this.backingPlaying || !this.backingBuffer) return false;
    if (!this.backingLoop && this.backingTime() >= this.backingBuffer.duration - 0.04) return false;
    return true;
  }

  backingTime(): number {
    if (!this.backingBuffer) return 0;
    if (!this.backingPlaying) return this.backingOffset;
    let time = this.backingOffset + (this.ctx.currentTime - this.backingStarted) * this.backingRate;
    if (this.backingLoop && this.backingBuffer.duration > 0) time = ((time % this.backingBuffer.duration) + this.backingBuffer.duration) % this.backingBuffer.duration;
    return Math.min(time, this.backingBuffer.duration);
  }

  playBacking() {
    if (!this.backingBuffer || this.closed) return;
    this.stopBackingSrc();
    const src = this.ctx.createBufferSource();
    src.buffer = this.backingBuffer;
    src.playbackRate.value = this.backingRate;
    src.loop = this.backingLoop;
    src.connect(this.backingGain);
    const offset = clamp(this.backingOffset, 0, Math.max(0, this.backingBuffer.duration - 0.02));
    src.start(0, offset);
    this.backingStarted = this.ctx.currentTime;
    this.backingOffset = offset;
    this.backingPlaying = true;
    this.backingSrc = src;
    src.onended = () => {
      if (this.backingSrc !== src) return;
      this.backingPlaying = false;
      this.backingOffset = 0;
    };
  }

  pauseBacking() {
    if (!this.backingPlaying) return;
    this.backingOffset = this.backingTime();
    this.backingPlaying = false;
    this.stopBackingSrc();
  }

  seekBacking(seconds: number) {
    const duration = this.backingBuffer?.duration ?? 0;
    this.backingOffset = clamp(seconds, 0, Math.max(0, duration - 0.02));
    if (this.backingPlaying) this.playBacking();
  }

  setBackingRate(rate: number) {
    const time = this.backingTime();
    this.backingRate = clamp(rate, 0.5, 1.5);
    this.backingOffset = time;
    this.backingStarted = this.ctx.currentTime;
    if (this.backingSrc) this.backingSrc.playbackRate.setTargetAtTime(this.backingRate, this.ctx.currentTime, 0.03);
  }

  setBackingLoop(loop: boolean) {
    this.backingLoop = loop;
    if (this.backingSrc) this.backingSrc.loop = loop;
  }

  setBackingLevel(value: number) {
    this.backingGain.gain.setTargetAtTime(clamp(value, 0, 1), this.ctx.currentTime, 0.03);
  }

  setMetronome(bpm: number | null) {
    if (this.metroTimer) clearInterval(this.metroTimer);
    this.metroTimer = null;
    if (bpm == null || bpm < 40 || bpm > 240 || this.closed) return;
    const step = 60 / bpm;
    this.metroNext = this.ctx.currentTime + 0.06;
    this.metroBeat = 0;
    this.metroTimer = setInterval(() => {
      if (this.closed) return;
      const horizon = this.ctx.currentTime + 0.16;
      while (this.metroNext < horizon) {
        this.click(this.metroNext, this.metroBeat % 4 === 0);
        const beat = this.metroBeat % 4;
        this.metroBeat += 1;
        this.metroNext += step;
        this.onBeat?.(beat);
      }
    }, 40);
  }

  close() {
    this.closed = true;
    this.onBeat = null;
    this.onFeedback = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setMetronome(null);
    this.releaseAll();
    this.stopBackingSrc();
    this.closeLive();
    for (const node of this.pedals.values()) node.dispose();
    this.pedals.clear();
    this.master.disconnect();
    void this.ctx.close();
  }

  private meterInput(): { peak: number; clip: boolean } {
    if (!this.liveSrc) return { peak: 0, clip: false };
    this.inMeter.getFloatTimeDomainData(this.inMeterBuf as Float32Array<ArrayBuffer>);
    let peak = 0;
    for (let i = 0; i < this.inMeterBuf.length; i += 1) peak = Math.max(peak, Math.abs(this.inMeterBuf[i]));
    const now = performance.now();
    if (peak >= 0.944) this.clipUntil = now + 1000;
    return { peak: Math.min(1, peak), clip: now < this.clipUntil };
  }

  /**
   * Howl guard. Acoustic feedback is a narrow tone that holds or grows; a
   * plucked string always decays. If the live input stays loud and
   * non-decaying with a stable pitch for ~1.3 s, mute the output.
   */
  private guardFeedback(rms: number, hz: number) {
    if (!this.liveSrc || this.howlMuted || !this.howlGuard) {
      this.lastRms = rms;
      return;
    }
    const sustained = rms > 0.18 && rms >= this.lastRms * 0.985 && hz > 0;
    this.howlTicks = sustained ? this.howlTicks + 1 : Math.max(0, this.howlTicks - 2);
    this.lastRms = rms;
    if (this.howlTicks >= 14) {
      this.howlMuted = true;
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      this.onFeedback?.(true);
    }
  }

  private analyse() {
    if (this.closed || (typeof document !== "undefined" && document.hidden)) return;
    const meter = this.meterInput();
    this.tuner.getFloatTimeDomainData(this.tunerBuf as Float32Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.tunerBuf.length; i += 8) sum += this.tunerBuf[i] * this.tunerBuf[i];
    const rms = Math.sqrt(sum / Math.ceil(this.tunerBuf.length / 8));
    if (rms < 0.004) {
      this.miss += 1;
      if (this.miss > 3) this.smoothHz = 0;
      this.guardFeedback(rms, 0);
      this.reading = { hz: 0, rms: Math.min(1, rms * 3.2), ...meter };
      for (const node of this.pedals.values()) node.follow?.(0);
      return;
    }
    const hz = detectPitch(this.tunerBuf, this.ctx.sampleRate);
    if (hz) {
      this.miss = 0;
      this.smoothHz = this.smoothHz > 0 ? this.smoothHz * 0.45 + hz * 0.55 : hz;
    } else {
      this.miss += 1;
      if (this.miss > 3) this.smoothHz = 0;
    }
    const shown = this.smoothHz > 0 ? this.smoothHz : 0;
    this.guardFeedback(rms, shown);
    this.reading = { hz: shown, rms: Math.min(1, rms * 3.2), ...meter };
    for (const node of this.pedals.values()) node.follow?.(shown);
  }

  private rewire() {
    try {
      this.fxSend.disconnect();
    } catch {
      // Nothing was connected yet.
    }
    for (const id of this.order) {
      try {
        this.pedals.get(id)?.output.disconnect();
      } catch {
        // Already free.
      }
    }
    let node: AudioNode = this.fxSend;
    for (const id of this.order) {
      const pedal = this.pedals.get(id);
      if (!pedal) continue;
      node.connect(pedal.input);
      node = pedal.output;
    }
    node.connect(this.ampInput);
  }

  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }

  private guitarVoice(freq: number, vel: number): (when: number) => void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const period = Math.max(8, Math.round(ctx.sampleRate / freq));
    const buffer = ctx.createBuffer(1, period, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < period; i += 1) data[i] = Math.random() * 2 - 1;
    const burst = ctx.createBufferSource();
    burst.buffer = buffer;
    const delay = ctx.createDelay(1);
    delay.delayTime.setValueAtTime(1 / freq, t);
    const feedback = ctx.createGain();
    feedback.gain.setValueAtTime(0.945, t);
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2200 + vel * 2000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32 * vel, t);
    const pick = ctx.createBufferSource();
    pick.buffer = this.noiseBuffer();
    const pickFilter = ctx.createBiquadFilter();
    pickFilter.type = "highpass";
    pickFilter.frequency.value = 1600;
    const pickGain = ctx.createGain();
    pickGain.gain.setValueAtTime(0.07 * vel, t);
    pickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    burst.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    feedback.connect(gain);
    gain.connect(this.inputGain);
    pick.connect(pickFilter);
    pickFilter.connect(pickGain);
    pickGain.connect(this.inputGain);
    burst.start(t);
    burst.stop(t + 0.03);
    pick.start(t, Math.random() * 0.5);
    pick.stop(t + 0.05);
    const nodes: AudioNode[] = [burst, delay, damp, feedback, gain, pick, pickFilter, pickGain];
    let stopped = false;
    return (when: number) => {
      if (stopped) return;
      stopped = true;
      const at = Math.max(when, ctx.currentTime);
      feedback.gain.cancelScheduledValues(at);
      feedback.gain.setTargetAtTime(0.0001, at, 0.03);
      gain.gain.setTargetAtTime(0.0001, at, 0.05);
      window.setTimeout(() => disconnectAll(nodes), 420);
    };
  }

  private bassVoice(freq: number, vel: number): (when: number) => void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    const over = ctx.createOscillator();
    over.type = "triangle";
    over.frequency.setValueAtTime(freq * 2, t);
    const overGain = ctx.createGain();
    overGain.gain.value = 0.22;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(220, t);
    filter.frequency.exponentialRampToValueAtTime(880, t + 0.03);
    filter.frequency.exponentialRampToValueAtTime(380, t + 0.22);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.4 * vel), t + 0.012);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.15 * vel), t + 0.24);
    osc.connect(filter);
    over.connect(overGain);
    overGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.inputGain);
    osc.start(t);
    over.start(t);
    const nodes: AudioNode[] = [osc, over, overGain, filter, gain];
    let stopped = false;
    return (when: number) => {
      if (stopped) return;
      stopped = true;
      const at = Math.max(when, ctx.currentTime);
      gain.gain.cancelScheduledValues(at);
      const current = Math.max(0.0002, gain.gain.value);
      gain.gain.setValueAtTime(current, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      try {
        osc.stop(at + 0.12);
        over.stop(at + 0.12);
      } catch {
        // Already stopped.
      }
      window.setTimeout(() => disconnectAll(nodes), 220);
    };
  }

  private click(when: number, accent: boolean) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(accent ? 1760 : 1280, when);
    gain.gain.setValueAtTime(accent ? 0.1 : 0.055, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + 0.04);
  }

  private stopBackingSrc() {
    const src = this.backingSrc;
    this.backingSrc = null;
    if (!src) return;
    src.onended = null;
    try {
      src.stop();
    } catch {
      // Already stopped.
    }
    try {
      src.disconnect();
    } catch {
      // Already disconnected.
    }
  }
}
