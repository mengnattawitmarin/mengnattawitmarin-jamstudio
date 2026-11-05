/** Characters for the 3D / AR rehearsal room. Pure data, no DOM. */
export type AvatarInst = "guitar" | "bass" | "mic" | "sticks";
export type AvatarChoice = { char: string; outfit: string | null; inst: AvatarInst };

export type AvatarChar = {
  id: string;
  name: string;
  style: string;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  gear: string;
  inst: AvatarInst;
};

export const AVATARS: AvatarChar[] = [
  { id: "rocky", name: "ร็อกกี้", style: "ROCKER", skin: "#f2c6a0", hair: "#18161c", shirt: "#ff3b5c", pants: "#23202c", gear: "#e8e8ec", inst: "guitar" },
  { id: "mint", name: "มิ้นท์", style: "POP STAR", skin: "#f7d2b6", hair: "#ff7a1a", shirt: "#2de2e6", pants: "#3b2a5a", gear: "#ff2e88", inst: "mic" },
  { id: "beat", name: "บีท", style: "DRUMMER", skin: "#c98d62", hair: "#ffcc00", shirt: "#7b3fe4", pants: "#1c1c1c", gear: "#ffcc00", inst: "sticks" },
  { id: "blues", name: "บลูส์", style: "BLUES MAN", skin: "#8d5a3b", hair: "#2b2b2b", shirt: "#1e3a8a", pants: "#2a2118", gear: "#b5121f", inst: "bass" },
  { id: "peach", name: "พีช", style: "INDIE", skin: "#f5cfb0", hair: "#ff7ab6", shirt: "#c6ff3d", pants: "#2b2b35", gear: "#2de2e6", inst: "guitar" },
  { id: "sunny", name: "ซันนี่", style: "FUNK", skin: "#e8b48a", hair: "#f5d76e", shirt: "#ff7a1a", pants: "#1f2a44", gear: "#7b3fe4", inst: "bass" },
];

export const OUTFITS: { label: string; color: string | null }[] = [
  { label: "ตามตัวละคร", color: null },
  { label: "แดง", color: "#ff3b5c" },
  { label: "เขียวนีออน", color: "#c6ff3d" },
  { label: "เหลือง", color: "#ffcc00" },
  { label: "ฟ้า", color: "#2de2e6" },
  { label: "ดำ", color: "#2a2633" },
];

export const AVATAR_INSTS: { id: AvatarInst; label: string }[] = [
  { id: "guitar", label: "กีตาร์" },
  { id: "bass", label: "เบส" },
  { id: "mic", label: "ร้อง" },
  { id: "sticks", label: "กลอง" },
];

export const DEFAULT_AVATAR: AvatarChoice = { char: "rocky", outfit: null, inst: "guitar" };

export type AvatarLook = AvatarChar & { shirt: string; inst: AvatarInst };

/** Resolve a (possibly untrusted, from the network) choice into a drawable look. */
export function resolveAvatar(choice: Partial<AvatarChoice> | null | undefined): AvatarLook {
  const base = AVATARS.find((a) => a.id === choice?.char) ?? AVATARS[0];
  const outfit = typeof choice?.outfit === "string" && /^#[0-9a-f]{6}$/i.test(choice.outfit) ? choice.outfit : null;
  const inst = AVATAR_INSTS.some((i) => i.id === choice?.inst) ? (choice!.inst as AvatarInst) : base.inst;
  return { ...base, shirt: outfit ?? base.shirt, inst };
}

export function parseAvatar(raw: unknown): AvatarChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.char !== "string") return null;
  const look = resolveAvatar({ char: r.char, outfit: typeof r.outfit === "string" ? r.outfit : null, inst: r.inst as AvatarInst });
  return { char: look.id, outfit: typeof r.outfit === "string" && /^#[0-9a-f]{6}$/i.test(r.outfit) ? r.outfit : null, inst: look.inst };
}
