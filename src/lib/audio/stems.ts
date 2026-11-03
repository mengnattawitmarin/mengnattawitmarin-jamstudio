export const STEM_IDS = ["vocal", "bass", "kick", "drums", "hats", "harmony"] as const;

export type StemId = (typeof STEM_IDS)[number];

export type StemMeta = {
  id: StemId;
  name: string;
  en: string;
  blurb: string;
  tonal: boolean;
};

export const STEMS: readonly StemMeta[] = [
  { id: "vocal", name: "เสียงร้อง", en: "Vocal", blurb: "ฮาร์โมนิกกลางสนาม", tonal: true },
  { id: "bass", name: "เบส", en: "Bass", blurb: "ตัวโน้ตต่ำที่กลม", tonal: true },
  { id: "kick", name: "กลองเตะ", en: "Kick", blurb: "จังหวะทุ้มสั้น", tonal: false },
  { id: "drums", name: "กลอง", en: "Drums", blurb: "สเนียร์และทอม", tonal: false },
  { id: "hats", name: "ฉาบ", en: "Cymbals", blurb: "เสียงแหลมเป็นจังหวะ", tonal: false },
  { id: "harmony", name: "ฮาร์โมนี", en: "Harmony", blurb: "คอร์ด คีย์ กีตาร์", tonal: true },
];

export const ANALYSIS_SR = 22050;
export const MAX_SECONDS = 180;
