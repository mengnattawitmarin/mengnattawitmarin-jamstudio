import { useEffect, useMemo, useRef, useState } from "react";
import { Headphones, Music2, Play, Search, Star, Trash2, Upload } from "lucide-react";
import { deleteSong, formatBytes, listSongs, updateSong, type SongMeta } from "@/lib/library";
import { formatClock } from "@/lib/audio/theory";

export function SongLibrary({
  onOpen,
  onUpload,
  onDemo,
}: {
  onOpen: (id: string) => void;
  onUpload: (file: File) => void;
  onDemo: () => void;
}) {
  const [songs, setSongs] = useState<SongMeta[] | null>(null);
  const [query, setQuery] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setSongs(await listSongs());
  }

  useEffect(() => {
    void refresh();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (songs ?? []).filter(
      (song) =>
        (!onlyFav || song.favorite) &&
        (!q || song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q) || (song.key ?? "").toLowerCase() === q),
    );
  }, [songs, query, onlyFav]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-4">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="title-rock text-5xl">คลังเพลง</h1>
          <p className="text-sm text-muted">เพลงที่เคยเปิดถูกเก็บในเครื่องนี้ (ไม่อัปโหลดขึ้นเซิร์ฟเวอร์) · เปิดซ้ำได้ทันที</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onDemo} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm">
            <Headphones className="size-4" aria-hidden="true" />
            เพลงตัวอย่าง
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brass px-3 text-sm font-semibold text-brass-ink">
            <Upload className="size-4" aria-hidden="true" />
            เพิ่มเพลง
          </button>
        </div>
      </section>

      <section className="panel flex flex-wrap items-center gap-2 p-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">ค้นหาเพลง</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาเพลง ศิลปิน หรือคีย์ (เช่น Am)…"
            className="h-10 w-full rounded-lg border border-line bg-surface-2 pl-9 pr-3 text-sm"
          />
        </label>
        <button
          type="button"
          aria-pressed={onlyFav}
          onClick={() => setOnlyFav((v) => !v)}
          className={`inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm ${onlyFav ? "bg-amber/20 text-amber" : "border border-line"}`}
        >
          <Star className="size-4" aria-hidden="true" />
          รายการโปรด
        </button>
      </section>

      {songs == null ? (
        <p className="text-sm text-muted">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <section className="panel grid place-items-center gap-3 p-10 text-center">
          <Music2 className="size-10 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">{songs.length === 0 ? "ยังไม่มีเพลงในคลัง — กด “เพิ่มเพลง” หรือเปิดไฟล์จากเครื่องมือแกะเพลง" : "ไม่พบเพลงที่ค้นหา"}</p>
        </section>
      ) : (
        <ul className="panel divide-y divide-line">
          {shown.map((song) => (
            <li key={song.id} className="flex items-center gap-3 p-3">
              <button type="button" onClick={() => onOpen(song.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brass to-[#1b2f6b] text-white">
                  <Play className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{song.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {[song.artist || "ไม่ระบุศิลปิน", song.key ? `คีย์ ${song.key}` : null, song.bpm ? `${song.bpm} BPM` : null, formatBytes(song.size)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {song.chords?.length ? <span className="block truncate text-xs text-brass">{song.chords.join(" · ")}</span> : null}
                </span>
              </button>
              <span className="hidden text-xs tabular-nums text-muted sm:block">{song.duration ? formatClock(song.duration) : ""}</span>
              <button
                type="button"
                aria-label={song.favorite ? "เอาออกจากรายการโปรด" : "เพิ่มในรายการโปรด"}
                aria-pressed={!!song.favorite}
                onClick={async () => {
                  await updateSong(song.id, { favorite: !song.favorite });
                  void refresh();
                }}
                className={`grid h-9 w-9 place-items-center rounded-lg ${song.favorite ? "text-amber" : "text-muted"}`}
              >
                <Star className="size-4" fill={song.favorite ? "currentColor" : "none"} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`ลบ ${song.title}`}
                onClick={async () => {
                  if (!window.confirm(`ลบ “${song.title}” ออกจากคลัง?`)) return;
                  await deleteSong(song.id);
                  void refresh();
                }}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUpload(file);
        }}
      />
    </main>
  );
}
