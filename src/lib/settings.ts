import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { InputChannel, LatencyMode } from "@/lib/audio/rig";
import { DEFAULT_AVATAR, type AvatarChoice } from "@/lib/avatars";

export type Settings = {
  /** Display name in jam rooms. */
  name: string;
  /** Main instrument shown next to the name. */
  instrument: "guitar" | "bass" | "vocal" | "drums" | "keys";
  /** Reference pitch for tuners. */
  a4: number;
  latency: LatencyMode;
  inputDeviceId: string;
  inputChannel: InputChannel;
  outputDeviceId: string;
  /** Live input trim before the rig, in dB. */
  inputTrimDb: number;
  /** Optional absolute origin of the signaling server (for the native app). */
  serverUrl: string;
  /** Mute the rig automatically when acoustic feedback is detected. */
  howlGuard: boolean;
  /** Character shown in the 3D / AR rehearsal room. */
  avatar: AvatarChoice;
};

type Store = Settings & { set: (patch: Partial<Settings>) => void; reset: () => void };

export const DEFAULT_SETTINGS: Settings = {
  name: "นักดนตรี",
  instrument: "guitar",
  a4: 440,
  latency: "interactive",
  inputDeviceId: "default",
  inputChannel: "mix",
  outputDeviceId: "default",
  inputTrimDb: 0,
  serverUrl: "",
  howlGuard: true,
  avatar: DEFAULT_AVATAR,
};

export const useSettings = create<Store>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "jamstudio-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ set: _set, reset: _reset, ...rest }) => rest,
    },
  ),
);

/** Snapshot outside React (audio engines, fetch helpers). */
export function getSettings(): Settings {
  return useSettings.getState();
}

/**
 * Base URL for app API calls. The web build talks to its own origin; the
 * native app (served from capacitor://localhost) needs an absolute server.
 */
export function apiBase(): string {
  const fromSettings = getSettings().serverUrl.trim().replace(/\/+$/, "");
  if (fromSettings) return fromSettings;
  const fromEnv = (import.meta.env.VITE_API_BASE as string | undefined)?.trim().replace(/\/+$/, "");
  return fromEnv ?? "";
}
