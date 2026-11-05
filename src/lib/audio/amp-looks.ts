import type { AmpId } from "@/lib/audio/rig";

/**
 * Visual identity per amp model: covering, grille cloth, control panel, knobs
 * and logo lettering. Generic colourways only — no real brand trade dress.
 */
export type KnobStyle = "gold" | "black" | "chrome" | "cream" | "red";
export type AmpLook = {
  /** Cabinet covering (CSS background). */
  tolex: string;
  /** Grille cloth / mesh (CSS background). */
  grille: string;
  /** Control panel (CSS background). */
  plate: string;
  /** Text colour on the panel. */
  plateInk: string;
  /** Logo colour on the grille. */
  logo: string;
  logoFont: "script" | "block";
  knob: KnobStyle;
  /** Power/status light colour. */
  led: string;
  /** Piping/frame colour around grille. */
  piping: string;
  /** Short label shown on small badges. */
  badge: string;
};

const TOLEX_BLACK =
  "repeating-linear-gradient(45deg, rgb(255 255 255 / 0.03) 0 2px, transparent 2px 5px), linear-gradient(180deg, #1d1d1f, #0c0c0d)";
const GRILLE_DARK =
  "repeating-linear-gradient(0deg, rgb(255 255 255 / 0.07) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgb(255 255 255 / 0.07) 0 1px, transparent 1px 4px), #151515";
const GRILLE_SILVER =
  "repeating-linear-gradient(0deg, rgb(0 0 0 / 0.18) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgb(0 0 0 / 0.12) 0 1px, transparent 1px 3px), linear-gradient(180deg, #c9ccd2, #9da2aa)";
const GRILLE_MESH =
  "radial-gradient(circle, #0a0a0a 1.6px, transparent 1.8px) 0 0 / 6px 6px, linear-gradient(180deg, #5b5f66, #34373c)";
const TWEED =
  "repeating-linear-gradient(60deg, rgb(90 60 25 / 0.35) 0 2px, transparent 2px 6px), repeating-linear-gradient(-60deg, rgb(60 40 15 / 0.3) 0 2px, transparent 2px 6px), linear-gradient(180deg, #d8b878, #b8955a)";
const WOOD =
  "repeating-linear-gradient(90deg, rgb(0 0 0 / 0.12) 0 1px, transparent 1px 9px), linear-gradient(180deg, #8a5a32, #5e3a1e)";

export const AMP_LOOKS: Record<AmpId, AmpLook> = {
  plexi: {
    tolex: TOLEX_BLACK,
    grille: "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.08) 0 1px, transparent 1px 3px), linear-gradient(180deg, #2a2620, #1a1712)",
    plate: "linear-gradient(180deg, #e9d9a6, #c8b072 60%, #a88d4f)",
    plateInk: "#3a2a08",
    logo: "#f3e6c4",
    logoFont: "script",
    knob: "gold",
    led: "#dc2626",
    piping: "#e8dcc0",
    badge: "PLEXI",
  },
  blackface: {
    tolex: TOLEX_BLACK,
    grille: GRILLE_SILVER,
    plate: "linear-gradient(180deg, #2a2a2c, #111112)",
    plateInk: "#f4f4f4",
    logo: "#e7e7e7",
    logoFont: "script",
    knob: "black",
    led: "#ef4444",
    piping: "#bfc3c9",
    badge: "BLACK",
  },
  dumble: {
    tolex: "linear-gradient(180deg, #1a1a1a, #0b0b0b)",
    grille: "repeating-linear-gradient(90deg, rgb(0 0 0 / 0.25) 0 1px, transparent 1px 4px), linear-gradient(180deg, #8d8f93, #6b6d71)",
    plate: "linear-gradient(180deg, #121212, #050505)",
    plateInk: "#e8e8e8",
    logo: "#f5f5f5",
    logoFont: "script",
    knob: "chrome",
    led: "#f59e0b",
    piping: "#9b9b9b",
    badge: "SMOOTH",
  },
  lab: {
    tolex: "linear-gradient(180deg, #2a2b2e, #151618)",
    grille: GRILLE_MESH,
    plate: "linear-gradient(180deg, #d7d9dc, #a9adb3)",
    plateInk: "#151515",
    logo: "#e5e7eb",
    logoFont: "block",
    knob: "black",
    led: "#22c55e",
    piping: "#6b7280",
    badge: "SS",
  },
  crystal: {
    tolex: "linear-gradient(180deg, #2b2c30, #17181b)",
    grille: GRILLE_SILVER,
    plate: "linear-gradient(180deg, #1b1b1d, #0b0b0c)",
    plateInk: "#eaeaea",
    logo: "#1b1b1d",
    logoFont: "block",
    knob: "black",
    led: "#ef4444",
    piping: "#d1d5db",
    badge: "CLEAN",
  },
  tweed: {
    tolex: TWEED,
    grille: "repeating-linear-gradient(90deg, rgb(0 0 0 / 0.25) 0 1px, transparent 1px 3px), linear-gradient(180deg, #6e4a2a, #4f341c)",
    plate: "linear-gradient(180deg, #e8e8ea, #b9bcc2)",
    plateInk: "#2a1d0e",
    logo: "#f6e7c5",
    logoFont: "script",
    knob: "cream",
    led: "#ef4444",
    piping: "#5a3b1c",
    badge: "TWEED",
  },
  brit: {
    tolex: "repeating-linear-gradient(45deg, rgb(255 255 255 / 0.05) 0 2px, transparent 2px 5px), linear-gradient(180deg, #ff8a1f, #d4630a)",
    grille: "repeating-linear-gradient(90deg, rgb(0 0 0 / 0.3) 0 2px, transparent 2px 4px), linear-gradient(180deg, #e8dcc0, #cbbf9f)",
    plate: "linear-gradient(180deg, #f2efe7, #d6d1c4)",
    plateInk: "#1d1d1d",
    logo: "#1d1d1d",
    logoFont: "block",
    knob: "black",
    led: "#f59e0b",
    piping: "#1d1d1d",
    badge: "BRIT",
  },
  hot: {
    tolex: TOLEX_BLACK,
    grille: GRILLE_MESH,
    plate: "linear-gradient(180deg, #2a0b0b, #120404)",
    plateInk: "#ffd5d5",
    logo: "#ff3b3b",
    logoFont: "block",
    knob: "red",
    led: "#ff2e2e",
    piping: "#ff3b3b",
    badge: "HI-GAIN",
  },
  jazz: {
    tolex: WOOD,
    grille: "repeating-linear-gradient(0deg, rgb(255 255 255 / 0.05) 0 1px, transparent 1px 3px), #1d1a17",
    plate: "linear-gradient(180deg, #f1e7d0, #d9c9a4)",
    plateInk: "#3b2a12",
    logo: "#f1e7d0",
    logoFont: "script",
    knob: "cream",
    led: "#f59e0b",
    piping: "#c9a46a",
    badge: "JAZZ",
  },
  acoustic: {
    tolex: WOOD,
    grille: "repeating-linear-gradient(90deg, rgb(0 0 0 / 0.15) 0 1px, transparent 1px 3px), linear-gradient(180deg, #d9c7a6, #bba680)",
    plate: "linear-gradient(180deg, #3b2614, #24170c)",
    plateInk: "#f4e3c3",
    logo: "#3b2614",
    logoFont: "script",
    knob: "chrome",
    led: "#22c55e",
    piping: "#3b2614",
    badge: "ACOUSTIC",
  },
  "bass-tube": {
    tolex: "repeating-linear-gradient(45deg, rgb(255 255 255 / 0.04) 0 2px, transparent 2px 5px), linear-gradient(180deg, #2b3a5c, #1a2440)",
    grille: GRILLE_SILVER,
    plate: "linear-gradient(180deg, #d9dce1, #aeb3bb)",
    plateInk: "#0f1a33",
    logo: "#0f1a33",
    logoFont: "block",
    knob: "black",
    led: "#3b82f6",
    piping: "#e5e7eb",
    badge: "B-TUBE",
  },
  "bass-stack": {
    tolex: TOLEX_BLACK,
    grille: GRILLE_DARK,
    plate: "linear-gradient(180deg, #1c1c1e, #0a0a0b)",
    plateInk: "#d6e4ff",
    logo: "#9ec1ff",
    logoFont: "block",
    knob: "black",
    led: "#3b82f6",
    piping: "#404040",
    badge: "8x10",
  },
  "bass-modern": {
    tolex: "linear-gradient(180deg, #34363b, #1d1f22)",
    grille: GRILLE_MESH,
    plate: "linear-gradient(180deg, #1e3a8a, #172554)",
    plateInk: "#dbeafe",
    logo: "#93c5fd",
    logoFont: "block",
    knob: "chrome",
    led: "#60a5fa",
    piping: "#60a5fa",
    badge: "MODERN",
  },
  "bass-di": {
    tolex: "linear-gradient(180deg, #e9e2d0, #cfc6ae)",
    grille: "linear-gradient(180deg, #3a3a3a, #222)",
    plate: "linear-gradient(180deg, #f6f1e4, #e2d9c2)",
    plateInk: "#2a2a2a",
    logo: "#f6f1e4",
    logoFont: "block",
    knob: "black",
    led: "#ef4444",
    piping: "#2a2a2a",
    badge: "DI",
  },
};

export function ampLook(id: AmpId): AmpLook {
  return AMP_LOOKS[id] ?? AMP_LOOKS.plexi;
}
