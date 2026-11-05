import { useEffect, useState } from "react";
import { ArrowRight, AudioLines, Gauge, Headphones, Music2, SlidersHorizontal, Upload, Users, Zap } from "lucide-react";
import { RIG_PRESETS } from "@/lib/audio/rig";
import { listSongs, type SongMeta } from "@/lib/library";
import { useSettings } from "@/lib/settings";

export type HomeTarget = "jam" | "rig" | "tuner" | "studio" | "library";

/** Key used to hand a preset from Home to the amp screen. */
export const PENDING_PRESET_KEY = "kakun-pending-preset";

const TILES: {
  id: HomeTarget;
  title: string;
  en: string;
  body: string;
  icon: typeof Users;
  bg: string;
  ink: string;
}[] = [
  {
    id: "jam",
    title: "ห้องซ้อม",
    en: "JAM",
    body: "สร้างห้อง ชวนเพื่อน เล่นพร้อมกันออนไลน์ + แชท",
    icon: Users,
    bg: "linear-gradient(135deg,#ff2e88,#ff7a1a)",
    ink: "#fff",
  },
  {
    id: "rig",
    title: "แอมป์ & เอฟเฟค",
    en: "TONE",
    body: "เสียบกีตาร์ เลือกแอมป์ ต่อก้อน หาโทนแบบศิลปิน",
    icon: SlidersHorizontal,
    bg: "linear-gradient(135deg,#c6ff3d,#2de2e6)",
    ink: "#0b0a0f",
  },
  {
    id: "tuner",
    title: "จูนเนอร์",
    en: "TUNE",
    body: "จูนสายใน 10 วินาที โหมด AUTO หลายเครื่องดนตรี",
    icon: Gauge,
    bg: "linear-gradient(135deg,#ffcc00,#ff7a1a)",
    ink: "#0b0a0f",
  },
  {
    id: "studio",
    title: "แกะเพลง",
    en: "LEARN",
    body: "ลดความเร็ว เปลี่ยนคีย์ ตัดเสียงร้อง ดูคอร์ด",
    icon: AudioLines,
    bg: "linear-gradient(135deg,#7b3fe4,#2de2e6)",
    ink: "#fff",
  },
];

export function Home({
  go,
  onDemo,
  onUpload,
  onOpenSong,
}: {
  go: (target: HomeTarget) => void;
  onDemo: () => void;
  onUpload: () => void;
  onOpenSong: (id: string) => void;
}) {
  const name = useSettings((state) => state.name);
  const [recent, setRecent] = useState<SongMeta[]>([]);

  useEffect(() => {
    void listSongs().then((songs) => setRecent(songs.slice(0, 4)));
  }, []);

  const artist = RIG_PRESETS.filter((preset) => preset.group === "artist");

  function openPreset(id: string) {
    try {
      localStorage.setItem(PENDING_PRESET_KEY, id);
    } catch {
      // private mode: the amp screen just opens with its last tone
    }
    go("rig");
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-3 py-5 sm:px-4">
      {/* Poster hero */}
      <section className="tile-rock halftone relative bg-surface p-5 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full bg-brass opacity-30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-[#2de2e6] opacity-15 blur-3xl" aria-hidden="true" />
        <p className="tape text-xs sm:text-sm">สวัสดี {name || "นักดนตรี"} 🤘</p>
        <h1 className="title-rock mt-3 text-6xl sm:text-8xl">
          Play <span className="text-grad">Loud.</span>
          <br />
          Play <span className="text-[var(--color-olive)]">Together.</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
          สตูดิโอซ้อมดนตรีในมือถือ — แจมกับเพื่อน หาโทนกีตาร์ จูนสาย และแกะเพลง ทุกอย่างประมวลผลในเครื่องคุณ
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => go("jam")} className="inline-flex h-12 items-center gap-2 rounded-lg border-2 border-black bg-brass px-5 font-semibold text-white shadow-[3px_3px_0_#000]">
            <Users className="size-5" aria-hidden="true" />
            เริ่มแจมเลย
          </button>
          <button type="button" onClick={() => go("rig")} className="inline-flex h-12 items-center gap-2 rounded-lg border-2 border-line bg-surface-2 px-5 font-semibold">
            <Zap className="size-5 text-[var(--color-amber)]" aria-hidden="true" />
            เสียบกีตาร์
          </button>
        </div>
      </section>

      {/* What do you want to do? */}
      <section>
        <h2 className="title-rock mb-3 text-3xl">วันนี้จะเล่นอะไร?</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => go(tile.id)}
                className="tile-rock flex min-h-40 flex-col justify-between p-4 text-left"
                style={{ background: tile.bg, color: tile.ink }}
              >
                <span className="flex items-start justify-between gap-2">
                  <Icon className="size-8" aria-hidden="true" />
                  <span className="title-rock text-3xl opacity-80">{tile.en}</span>
                </span>
                <span>
                  <span className="block text-lg font-bold leading-tight">{tile.title}</span>
                  <span className="mt-1 block text-xs font-medium opacity-80">{tile.body}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Artist tones */}
        <section className="panel p-4">
          <div className="flex items-end justify-between gap-2">
            <h2 className="title-rock text-3xl">
              โทนในตำนาน <span className="text-grad">Legend Tones</span>
            </h2>
            <button type="button" onClick={() => go("rig")} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
              ทั้งหมด <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {artist.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => openPreset(preset.id)}
                className="group flex items-start gap-3 rounded-lg border-2 border-line bg-surface-2 p-3 text-left hover:border-brass"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brass text-white shadow-[2px_2px_0_#000]">
                  <Zap className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{preset.name}</span>
                  <span className="line-clamp-2 block text-xs text-muted">{preset.blurb}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">ค่าตั้งต้นจากข้อมูลอุปกรณ์สาธารณะ ไม่ได้เกี่ยวข้องหรือรับรองโดยศิลปิน</p>
        </section>

        {/* Recent songs */}
        <section className="panel flex flex-col p-4">
          <div className="flex items-end justify-between gap-2">
            <h2 className="title-rock text-3xl">เพลงล่าสุด</h2>
            <button type="button" onClick={() => go("library")} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
              คลังเพลง <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          {recent.length ? (
            <ul className="mt-3 flex flex-col gap-2">
              {recent.map((song) => (
                <li key={song.id}>
                  <button type="button" onClick={() => onOpenSong(song.id)} className="flex w-full items-center gap-3 rounded-lg bg-surface-2 p-2 text-left hover:bg-line">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--color-olive)] text-black">
                      <Music2 className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{song.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {[song.artist, song.key ? `คีย์ ${song.key}` : null, song.bpm ? `${song.bpm} BPM` : null].filter(Boolean).join(" · ") || "แตะเพื่อเปิด"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-line p-6 text-center">
              <p className="text-sm text-muted">ยังไม่มีเพลง — เปิดไฟล์เพลงเพื่อเริ่มแกะ</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={onUpload} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brass px-3 text-sm font-semibold text-white">
                  <Upload className="size-4" aria-hidden="true" />
                  เปิดไฟล์เพลง
                </button>
                <button type="button" onClick={onDemo} className="inline-flex h-10 items-center gap-2 rounded-lg border-2 border-line px-3 text-sm">
                  <Headphones className="size-4" aria-hidden="true" />
                  เพลงตัวอย่าง
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
