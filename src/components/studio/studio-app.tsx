import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AudioLines,
  CircleDot,
  Copy,
  Download,
  Drum,
  Gauge,
  Guitar,
  Cable,
  Headphones,
  House,
  Library as LibraryIcon,
  ListMusic,
  LogOut,
  MicOff,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Users,
  Mic2,
  Minus,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer,
  Upload,
  Waves,
} from "lucide-react";
import { renderDemo } from "@/lib/audio/demo-track";
import { bufferFromMono, MixPlayer, trimBuffer, type Audible, type Volumes } from "@/lib/audio/player";
import { analyzeChannels } from "@/lib/audio/run-analysis";
import { MAX_SECONDS, STEM_IDS, STEMS, type StemId } from "@/lib/audio/stems";
import {
  capoSuggestion,
  chordIntervals,
  degreeLabel,
  formatClock,
  formatPc,
  modeLabel,
  preferFlats,
  scalePcs,
  shiftChord,
  solfege,
} from "@/lib/audio/theory";
import type { Analysis, ChordEvent } from "@/lib/audio/types";
import { downloadBlob, textBlob, wavBlob } from "@/lib/audio/wav";
import { JamRoom } from "@/components/studio/jam-room";
import { RigRoom } from "@/components/studio/rig-room";
import { Tuner } from "@/components/studio/tuner";
import { SongLibrary } from "@/components/studio/library";
import { SettingsPage } from "@/components/studio/settings-page";
import { Home } from "@/components/studio/home";
import { ConnectPage } from "@/components/studio/connect-page";
import { ChordDiagram } from "@/components/studio/chord-diagram";
import { stretchBuffer } from "@/lib/audio/run-stretch";
import { addSong, getSongBlob, updateSong } from "@/lib/library";
import { useSettings } from "@/lib/settings";
import { installAudioUnlock, resumeAllAudio } from "@/lib/audio/ios-audio";

type Desk = "home" | "jam" | "rig" | "connect" | "studio" | "library" | "tuner" | "settings";

/** Five clear destinations; "เพลง" holds both the song tools and the library. */
const NAV: { id: Desk; label: string; short: string; icon: typeof Guitar; match: Desk[] }[] = [
  { id: "home", label: "หน้าแรก", short: "หน้าแรก", icon: House, match: ["home"] },
  { id: "jam", label: "ห้องซ้อม", short: "แจม", icon: Users, match: ["jam"] },
  { id: "rig", label: "แอมป์ & เชื่อมต่อ", short: "โทน", icon: SlidersHorizontal, match: ["rig", "connect"] },
  { id: "tuner", label: "จูนเนอร์", short: "จูน", icon: Gauge, match: ["tuner"] },
  { id: "studio", label: "เพลง", short: "เพลง", icon: AudioLines, match: ["studio", "library"] },
];

const ICONS = {
  vocal: Mic2,
  bass: Waves,
  kick: CircleDot,
  drums: Drum,
  hats: Activity,
  harmony: Music2,
} as const;

const emptyFlags = () => Object.fromEntries(STEM_IDS.map((id) => [id, false])) as Record<StemId, boolean>;
const fullVolumes = () => Object.fromEntries(STEM_IDS.map((id) => [id, 0.9])) as Volumes;

export function StudioApp() {
  const playerRef = useRef<MixPlayer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const jobRef = useRef(0);
  const loopRef = useRef<{ start: number; end: number } | null>(null);

  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("พร้อมแยกเลน");
  const [ratio, setRatio] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [mode, setMode] = useState<"original" | "stems">("original");
  const [volumes, setVolumes] = useState<Volumes>(fullVolumes);
  const [muted, setMuted] = useState(emptyFlags);
  const [solo, setSolo] = useState(emptyFlags);
  const [rate, setRate] = useState(1);
  const [metro, setMetro] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [degrees, setDegrees] = useState(false);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const [desk, setDesk] = useState<Desk>("home");
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [keepPitch, setKeepPitch] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [songId, setSongId] = useState<string | null>(null);
  const [jamInfo, setJamInfo] = useState<{ inRoom: boolean; online: number }>({ inRoom: false, online: 0 });
  const leaveJamRef = useRef<(() => void) | null>(null);
  const stretchJob = useRef(0);

  useEffect(() => {
    void useSettings.persist.rehydrate();
    installAudioUnlock();
  }, []);

  function go(next: Desk) {
    if (next !== "studio") {
      playerRef.current?.pause();
      setPlaying(false);
    }
    // The connect page routes "through the amp", so mount the amp screen too (applies the saved rig).
    setVisited((prev) => (prev[next] && (next !== "connect" || prev.rig) ? prev : { ...prev, [next]: true, ...(next === "connect" ? { rig: true } : {}) }));
    setDesk(next);
  }

  const deskRef = useRef(desk);
  deskRef.current = desk;

  loopRef.current = loop;

  const player = () => {
    if (!playerRef.current) playerRef.current = new MixPlayer();
    return playerRef.current;
  };

  const audible = useMemo(() => {
    const anySolo = STEM_IDS.some((id) => solo[id]);
    const map = {} as Audible;
    for (const id of STEM_IDS) map[id] = anySolo ? solo[id] : !muted[id];
    return map;
  }, [muted, solo]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const engine = playerRef.current;
      const region = loopRef.current;
      if (engine?.isPlaying()) {
        const t = engine.currentTime();
        if (region && t >= region.end - 0.03) {
          engine.play(region.start);
          setTime(region.start);
        } else if (t >= engine.duration - 0.04) {
          engine.pause();
          engine.cue(0);
          setPlaying(false);
          setTime(0);
        } else setTime(t);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => {
    void toggle();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (deskRef.current !== "studio") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return;
      if (!playerRef.current?.original) return;
      event.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function toggle() {
    const engine = playerRef.current;
    if (!engine?.original) return;
    if (engine.isPlaying()) {
      engine.pause();
      setPlaying(false);
      setTime(engine.currentTime());
      return;
    }
    resumeAllAudio();
    await engine.ensure().resume();
    engine.mode = mode;
    engine.rate = rate;
    engine.metronome = metro;
    engine.applyGains(volumes, audible, true);
    engine.play();
    setPlaying(true);
  }

  function cue(seconds: number) {
    const engine = playerRef.current;
    if (!engine) return;
    engine.cue(seconds);
    setTime(engine.isPlaying() ? seconds : engine.currentOffset);
    if (engine.isPlaying()) setPlaying(true);
  }

  function pushMix(nextMode: "original" | "stems", nextVolumes: Volumes, nextAudible: Audible) {
    const engine = player();
    const wasPlaying = engine.isPlaying();
    const at = engine.currentTime();
    const changed = engine.mode !== nextMode;
    engine.mode = nextMode;
    engine.rate = rate;
    engine.metronome = metro;
    engine.applyGains(nextVolumes, nextAudible, changed);
    setMode(nextMode);
    if (changed && wasPlaying) engine.play(at);
  }

  async function ingest(buffer: AudioBuffer, name: string) {
    const id = ++jobRef.current;
    const engine = player();
    engine.pause();
    setPlaying(false);
    setBusy(true);
    setError("");
    setNotice("");
    setRatio(0);
    setStatus("ถอดรหัสไฟล์");
    setAnalysis(null);
    try {
      const ctx = engine.ensure();
      const trimmed = trimBuffer(ctx, buffer, MAX_SECONDS);
      const left = new Float32Array(trimmed.getChannelData(0));
      const right =
        trimmed.numberOfChannels > 1 ? new Float32Array(trimmed.getChannelData(1)) : new Float32Array(left);
      const prepared = await analyzeChannels(left, right, trimmed.sampleRate, (label, value) => {
        if (id !== jobRef.current) return;
        setStatus(label);
        setRatio(value);
      });
      if (id !== jobRef.current) return;
      engine.original = trimmed;
      engine.stems.clear();
      for (const stem of prepared.analysis.stems) {
        engine.stems.set(stem.id, bufferFromMono(ctx, stem.samples, prepared.analysis.sampleRate));
      }
      engine.beats = prepared.analysis.beats;
      engine.duration = Math.min(trimmed.duration, prepared.analysis.duration);
      engine.mode = "original";
      engine.rate = 1;
      engine.metronome = false;
      engine.cue(0);
      setMode("original");
      setRate(1);
      setMetro(false);
      setVolumes(fullVolumes());
      setMuted(emptyFlags());
      setSolo(emptyFlags());
      setTranspose(0);
      setLoop(null);
      setTime(0);
      setTitle(name);
      setPeaks(prepared.peaks);
      setAnalysis(prepared.analysis);
      setStatus("พร้อมเล่น");
      engine.processed = null;
      setSongId((current) => {
        if (current) {
          const a = prepared.analysis;
          const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
          const uniq = [...new Set(a.chords.filter((c) => c.root >= 0).map((c) => c.symbol))].slice(0, 8);
          void updateSong(current, {
            duration: a.duration,
            bpm: a.bpm,
            key: `${names[a.key.tonicPc]}${a.key.mode === "minor" ? "m" : ""}`,
            chords: uniq,
          });
        }
        return current;
      });
    } catch (reason) {
      if (id !== jobRef.current) return;
      const message = reason instanceof Error ? reason.message : "วิเคราะห์ไม่สำเร็จ";
      setError(message.includes("decode") ? "อ่านไฟล์เสียงนี้ไม่ได้ ลอง wav หรือ mp3" : message);
    } finally {
      if (id === jobRef.current) setBusy(false);
    }
  }

  async function onFile(file: File, fromLibrary?: string) {
    setTitle(file.name.replace(/\.[^.]+$/, ""));
    setBusy(true);
    setError("");
    try {
      const ctx = player().ensure();
      const audio = await ctx.decodeAudioData(await file.arrayBuffer());
      let id = fromLibrary ?? null;
      if (!id) {
        try {
          id = (await addSong(file)).id;
        } catch {
          id = null; // storage full / private mode: still play it
        }
      } else void updateSong(id, { lastOpenedAt: Date.now() });
      setSongId(id);
      await ingest(audio, file.name.replace(/\.[^.]+$/, ""));
    } catch {
      setBusy(false);
      setError("อ่านไฟล์เสียงนี้ไม่ได้ ลอง wav, mp3 หรือ ogg");
    }
  }

  async function openFromLibrary(id: string) {
    const found = await getSongBlob(id);
    if (!found) return;
    go("studio");
    const name = found.meta.artist ? `${found.meta.artist} - ${found.meta.title}` : found.meta.title;
    await onFile(new File([found.blob], `${name}.audio`, { type: found.meta.type }), id);
  }

  async function onDemo() {
    setSongId(null);
    const demo = renderDemo();
    const ctx = player().ensure();
    const buffer = ctx.createBuffer(2, demo.left.length, demo.sampleRate);
    buffer.copyToChannel(demo.left as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(demo.right as Float32Array<ArrayBuffer>, 1);
    await ingest(buffer, demo.title);
  }

  function reset() {
    jobRef.current += 1;
    playerRef.current?.pause();
    playerRef.current && (playerRef.current.original = null);
    setPlaying(false);
    setAnalysis(null);
    setPeaks(null);
    setTitle("");
    setError("");
    setBusy(false);
    setTime(0);
    setLoop(null);
  }

  // Pitch-preserving slow-down and real key change (WSOLA, off the main thread).
  useEffect(() => {
    const engine = playerRef.current;
    if (!engine?.original || !analysis) return;
    const needs = transpose !== 0 || (keepPitch && Math.abs(rate - 1) > 1e-3);
    const job = ++stretchJob.current;
    if (!needs) {
      engine.processed = null;
      setProcessing(null);
      if (engine.isPlaying()) engine.play(engine.currentTime());
      return;
    }
    if (engine.processed && engine.processed.rate === rate && engine.processed.semitones === transpose) return;
    const ctx = engine.ensure();
    const original = engine.original;
    const stems = [...engine.stems.entries()];
    const total = 1 + stems.length;
    setProcessing(0);
    const timer = window.setTimeout(async () => {
      try {
        const out = await stretchBuffer(ctx, original, rate, transpose, (r) => {
          if (job === stretchJob.current) setProcessing(r / total);
        });
        const outStems = new Map<StemId, AudioBuffer>();
        for (let i = 0; i < stems.length; i++) {
          if (job !== stretchJob.current) return;
          const [id, buffer] = stems[i];
          outStems.set(id, await stretchBuffer(ctx, buffer, rate, transpose, (r) => {
            if (job === stretchJob.current) setProcessing((i + 1 + r) / total);
          }));
        }
        if (job !== stretchJob.current) return;
        const wasPlaying = engine.isPlaying();
        const at = engine.currentTime();
        engine.processed = { rate, semitones: transpose, original: out, stems: outStems };
        if (wasPlaying) engine.play(at);
        setProcessing(null);
      } catch {
        if (job === stretchJob.current) {
          setProcessing(null);
          setNotice("ประมวลผลความเร็ว/คีย์ไม่สำเร็จ ลองไฟล์ที่สั้นลง");
        }
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [rate, transpose, keepPitch, analysis]);

  const view = useMemo(() => {
    if (!analysis) return null;
    const tonic = (analysis.key.tonicPc + transpose + 12) % 12;
    const flats = preferFlats(tonic, analysis.key.mode);
    const chords = analysis.chords.map((chord) => shiftChord(chord, transpose, flats));
    const current = chords.find((chord) => time >= chord.time && time < chord.time + chord.duration) ?? chords[0];
    return { tonic, flats, chords, current, capo: capoSuggestion(tonic, analysis.key.mode) };
  }, [analysis, transpose, time]);

  const activeNav = NAV.find((item) => item.match.includes(desk)) ?? { label: "ตั้งค่า" };

  return (
    <div className="min-h-screen text-fg">
      <header className="safe-top sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-4">
          <button type="button" onClick={() => go("home")} className="flex min-w-0 items-center gap-2 text-left" aria-label="Kakunstudio หน้าแรก">
            <Logo />
            <span className="min-w-0">
              <span className="title-rock block text-2xl leading-none">
                Kakun<span className="text-grad">studio</span>
              </span>
              <span className="block truncate text-[10px] uppercase tracking-[0.2em] text-muted">Play loud · Play together</span>
            </span>
          </button>
          <nav className="mx-auto hidden items-center gap-1 lg:flex" aria-label="เมนูหลัก">
            {NAV.map((item) => {
              const Icon = item.icon;
              const on = item.match.includes(desk);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3.5 py-2 text-sm font-semibold transition ${on ? "border-black bg-brass text-white shadow-[3px_3px_0_#000]" : "border-transparent text-muted hover:text-fg"}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {jamInfo.inRoom ? (
              <>
                <span className="hidden items-center gap-2 panel px-3 py-2 text-sm sm:flex">
                  <span className="h-2.5 w-2.5 rounded-full bg-olive shadow-[0_0_8px_var(--color-olive)]" />
                  ออนไลน์ {jamInfo.online}
                </span>
                <button
                  type="button"
                  onClick={() => leaveJamRef.current?.()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-danger px-3 text-sm font-semibold text-white"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  ออก
                </button>
              </>
            ) : null}
            {analysis && desk === "studio" ? (
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-10 items-center gap-2 panel px-3 text-sm"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">เพลงใหม่</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => go("settings")}
              aria-label="ตั้งค่า"
              className={`grid h-10 w-10 place-items-center rounded-lg border-2 ${desk === "settings" ? "border-black bg-brass text-white" : "border-line bg-surface"}`}
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {activeNav.label}
        </p>
      </header>

      <div className="pb-20 lg:pb-0">
        {visited.jam ? (
          <div hidden={desk !== "jam"}>
            <JamRoom
              active={desk === "jam"}
              onStatus={(inRoom, online, leave) => {
                leaveJamRef.current = leave;
                setJamInfo((prev) => (prev.inRoom === inRoom && prev.online === online ? prev : { inRoom, online }));
              }}
            />
          </div>
        ) : null}
        {desk === "rig" || desk === "connect" ? <ToneTabs desk={desk} onPick={go} /> : null}
        {visited.connect ? (
          <div hidden={desk !== "connect"}>
            <ConnectPage active={desk === "connect"} />
          </div>
        ) : null}
        {visited.rig ? (
          <div hidden={desk !== "rig"}>
            <RigRoom
              active={desk === "rig"}
              pullStudio={() => {
                const buffer = playerRef.current?.original ?? null;
                if (!buffer) return null;
                return { buffer, title: title || "เพลงจากเครื่องมือแกะเพลง", bpm: analysis?.bpm ?? null };
              }}
            />
          </div>
        ) : null}
        {desk === "home" ? (
          <Home
            go={go}
            onDemo={() => {
              go("studio");
              void onDemo();
            }}
            onUpload={() => {
              go("studio");
              fileRef.current?.click();
            }}
            onOpenSong={(id) => void openFromLibrary(id)}
          />
        ) : null}
        {desk === "tuner" ? <Tuner /> : null}
        {desk === "studio" || desk === "library" ? <SongTabs desk={desk} onPick={go} hasSong={!!analysis} title={title} /> : null}
        {desk === "library" ? (
          <SongLibrary
            onOpen={(id) => void openFromLibrary(id)}
            onUpload={(file) => {
              go("studio");
              void onFile(file);
            }}
            onDemo={() => {
              go("studio");
              void onDemo();
            }}
          />
        ) : null}
        {desk === "settings" ? <SettingsPage /> : null}
        {desk === "studio" ? (
          !analysis ? (
            <Landing
              busy={busy}
              status={status}
              ratio={ratio}
              error={error}
              onUpload={() => fileRef.current?.click()}
              onDemo={() => void onDemo()}
              onDropFile={(file) => void onFile(file)}
              onJam={() => go("jam")}
              onRig={() => go("rig")}
            />
          ) : view ? (
        <Studio
          analysis={analysis}
          peaks={peaks}
          title={title}
          time={time}
          view={view}
          transpose={transpose}
          degrees={degrees}
          loop={loop}
          volumes={volumes}
          muted={muted}
          solo={solo}
          audible={audible}
          notice={notice}
          onCue={cue}
          onTranspose={setTranspose}
          onDegrees={setDegrees}
          onLoop={setLoop}
          onNotice={setNotice}
          onVolume={(id, value) => {
            const next = { ...volumes, [id]: value };
            setVolumes(next);
            pushMix("stems", next, audible);
          }}
          onMute={(id) => {
            const nextMuted = { ...muted, [id]: !muted[id] };
            setMuted(nextMuted);
            const anySolo = STEM_IDS.some((stem) => solo[stem]);
            const map = {} as Audible;
            for (const stem of STEM_IDS) map[stem] = anySolo ? solo[stem] : !nextMuted[stem];
            pushMix("stems", volumes, map);
          }}
          onSolo={(id) => {
            const nextSolo = { ...solo, [id]: !solo[id] };
            setSolo(nextSolo);
            const anySolo = STEM_IDS.some((stem) => nextSolo[stem]);
            const map = {} as Audible;
            for (const stem of STEM_IDS) map[stem] = anySolo ? nextSolo[stem] : !muted[stem];
            pushMix("stems", volumes, map);
          }}
        />
          ) : null
        ) : null}
      </div>

      {analysis && desk === "studio" ? (
        <Transport
          playing={playing}
          time={time}
          duration={analysis.duration}
          mode={mode}
          rate={rate}
          metro={metro}
          loop={loop}
          transpose={transpose}
          keyName={view ? formatPc(view.tonic, view.flats) + (analysis.key.mode === "minor" ? "m" : "") : ""}
          keepPitch={keepPitch}
          processing={processing}
          vocalCut={muted.vocal && mode === "stems"}
          onToggle={() => void toggle()}
          onMode={(next) => pushMix(next, volumes, audible)}
          onRate={(next) => {
            setRate(next);
            const engine = player();
            engine.rate = next;
            if (engine.isPlaying()) engine.play(engine.currentTime());
          }}
          onTranspose={setTranspose}
          onKeepPitch={setKeepPitch}
          onVocalCut={() => {
            const nextMuted = { ...muted, vocal: !(muted.vocal && mode === "stems") };
            setMuted(nextMuted);
            const anySolo = STEM_IDS.some((stem) => solo[stem]);
            const map = {} as Audible;
            for (const stem of STEM_IDS) map[stem] = anySolo ? solo[stem] : !nextMuted[stem];
            pushMix("stems", volumes, map);
          }}
          onMetro={(next) => {
            setMetro(next);
            const engine = player();
            engine.metronome = next;
          }}
          onClearLoop={() => setLoop(null)}
        />
      ) : null}

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur lg:hidden" aria-label="เมนูหลัก">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = item.match.includes(desk);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                aria-current={on ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${on ? "text-fg" : "text-muted"}`}
              >
                <span className={`grid h-8 w-12 place-items-center rounded-full transition ${on ? "bg-brass text-white shadow-[2px_2px_0_#000]" : ""}`}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                {item.short}
              </button>
            );
          })}
        </div>
      </nav>

      <footer className="mx-auto hidden max-w-7xl items-center justify-between px-4 py-4 text-xs text-muted lg:flex">
        <span className="title-rock text-base">Kakunstudio v2.0</span>
        <span className="font-[family-name:var(--font-script)] text-sm">Music is a safe place for everyone</span>
        <span>เสียงประมวลผลในเครื่องคุณ</span>
      </footer>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void onFile(file);
        }}
      />
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-10 w-10 shrink-0 drop-shadow-[2px_2px_0_#000]" aria-hidden="true">
      <defs>
        <linearGradient id="kakun-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff2e88" />
          <stop offset="1" stopColor="#ff7a1a" />
        </linearGradient>
      </defs>
      <path d="M16 2.5c5.4 0 9.6 1.7 9.6 1.7s1 9.6-3.3 16.4C19.9 24.6 16 28.8 16 28.8s-3.9-4.2-6.3-8.2C5.4 13.8 6.4 4.2 6.4 4.2S10.6 2.5 16 2.5Z" fill="url(#kakun-logo)" stroke="#000" strokeWidth="1.2" />
      <path d="M17.7 6.6 12.6 16.4h3.5l-1.5 7.7 5.6-10.4h-3.9l1.4-7.1Z" fill="#c6ff3d" stroke="#000" strokeWidth=".9" strokeLinejoin="round" />
    </svg>
  );
}

/** Sub-navigation inside the "โทน" section: amp & FX ↔ connect & mixer. */
function ToneTabs({ desk, onPick }: { desk: Desk; onPick: (desk: Desk) => void }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-3 pt-4 sm:px-4">
      <div className="flex rounded-xl border-2 border-line bg-surface p-1" role="tablist" aria-label="โทน">
        {(
          [
            ["rig", "แอมป์ & เอฟเฟค", SlidersHorizontal],
            ["connect", "เชื่อมต่อ & มิกเซอร์", Cable],
          ] as const
        ).map(([id, label, Icon]) => {
          const on = desk === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onPick(id)}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${on ? "bg-brass text-white shadow-[2px_2px_0_#000]" : "text-muted"}`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Sub-navigation inside the "เพลง" section: song tools ↔ library. */
function SongTabs({
  desk,
  onPick,
  hasSong,
  title,
}: {
  desk: Desk;
  onPick: (desk: Desk) => void;
  hasSong: boolean;
  title: string;
}) {
  return (
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-3 pt-4 sm:px-4">
      <div className="flex rounded-xl border-2 border-line bg-surface p-1" role="tablist" aria-label="เพลง">
        {(
          [
            ["studio", "แกะเพลง", AudioLines],
            ["library", "คลังเพลง", LibraryIcon],
          ] as const
        ).map(([id, label, Icon]) => {
          const on = desk === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onPick(id)}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${on ? "bg-brass text-white shadow-[2px_2px_0_#000]" : "text-muted"}`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
      {hasSong && title ? (
        <p className="min-w-0 truncate text-sm text-muted">
          กำลังเปิด: <span className="font-semibold text-fg">{title}</span>
        </p>
      ) : null}
    </div>
  );
}

function Landing({
  busy,
  status,
  ratio,
  error,
  onUpload,
  onDemo,
  onDropFile,
  onJam,
  onRig,
}: {
  busy: boolean;
  status: string;
  ratio: number;
  error: string;
  onUpload: () => void;
  onDemo: () => void;
  onDropFile: (file: File) => void;
  onJam: () => void;
  onRig: () => void;
}) {
  return (
    <main
      className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 lg:py-12"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) onDropFile(file);
      }}
    >
      <div className="grid items-start gap-8 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <p className="tape text-sm">เครื่องมือแกะเพลง</p>
          <h1 className="title-rock mt-2 max-w-xl text-5xl sm:text-6xl">ลดความเร็ว เปลี่ยนคีย์ ตัดเสียงร้อง แล้วแกะคอร์ด</h1>
          <p className="mt-4 max-w-xl text-base text-muted">
            วางเพลงลงไป ระบบจะแยกเสียงร้อง เบส กลอง และฮาร์โมนี ปรับช้าลงโดยเสียงไม่เพี้ยน ย้ายคีย์ทั้งเพลง
            วนท่อนที่เลือก พร้อมคอร์ดตามเวลาและรูปจับกีตาร์ ทุกอย่างประมวลผลในเครื่อง ไฟล์ไม่ถูกส่งออกไปไหน
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onUpload}
              className="inline-flex h-12 items-center gap-2 rounded-md bg-brass px-4 text-sm font-semibold text-brass-ink"
            >
              <Upload className="size-4" aria-hidden="true" />
              อัปโหลดเพลง
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDemo}
              className="inline-flex h-12 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-semibold"
            >
              <Headphones className="size-4" aria-hidden="true" />
              ลองเพลงตัวอย่าง
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onRig}
              className="inline-flex h-12 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-semibold"
            >
              <Guitar className="size-4" aria-hidden="true" />
              แอมป์ & เอฟเฟค
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onJam}
              className="inline-flex h-12 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-semibold"
            >
              <AudioLines className="size-4" aria-hidden="true" />
              ห้องซ้อมแจม
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">รองรับ wav, mp3, ogg สูงสุด 3 นาทีต่อการวิเคราะห์ ลากไฟล์มาวางได้</p>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          ) : null}
          {busy ? (
            <div className="mt-6 panel p-4" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{status}</span>
                <span className="tabular-nums text-muted">{Math.round(ratio * 100)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-brass" style={{ width: `${Math.round(ratio * 100)}%` }} />
              </div>
            </div>
          ) : null}
        </section>
        <aside className="panel p-4 lg:col-span-5">
          <p className="text-xs font-medium tracking-wide text-muted">แยกเสียงได้ 6 เลน</p>
          <ul className="mt-3 flex flex-col gap-2">
            {STEMS.map((stem) => {
              const Icon = ICONS[stem.id];
              return (
                <li key={stem.id} className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${stem.tonal ? "bg-brass text-brass-ink" : "bg-olive text-brass-ink"}`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{stem.name}</span>
                    <span className="block text-xs text-muted">
                      {stem.en} · {stem.blurb}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        <Feature icon={Headphones} title="โซโลได้ทีละเลน" body="ปิด เปิด หรือดาวน์โหลดเป็น WAV แล้วเทียบกับต้นฉบับสเตอริโอ" />
        <Feature icon={ListMusic} title="ชาร์ตคอร์ดกดกระโดด" body="ย้ายคีย์สำหรับกีตาร์ สลับเป็นเลขโรมัน แล้ววนซ้อมทีละคอร์ด" />
        <Feature icon={Gauge} title="คีย์ จังหวะ แท็ก" body="บีพีเอ็ม สเกลที่ใช้ได้ คาโป และแท็กพลังงานกับอารมณ์" />
      </section>
    </main>
  );
}

function Feature({ icon: Icon, title, body }: { icon: typeof Gauge; title: string; body: string }) {
  return (
    <article className="panel p-4">
      <Icon className="size-5 text-brass" aria-hidden="true" />
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </article>
  );
}

function Studio({
  analysis,
  peaks,
  title,
  time,
  view,
  transpose,
  degrees,
  loop,
  volumes,
  muted,
  solo,
  notice,
  onCue,
  onTranspose,
  onDegrees,
  onLoop,
  onNotice,
  onVolume,
  onMute,
  onSolo,
}: {
  analysis: Analysis;
  peaks: Float32Array | null;
  title: string;
  time: number;
  view: {
    tonic: number;
    flats: boolean;
    chords: ChordEvent[];
    current: ChordEvent | undefined;
    capo: { capo: number; shape: string };
  };
  transpose: number;
  degrees: boolean;
  loop: { start: number; end: number } | null;
  volumes: Volumes;
  muted: Record<StemId, boolean>;
  solo: Record<StemId, boolean>;
  audible: Audible;
  notice: string;
  onCue: (time: number) => void;
  onTranspose: (value: number) => void;
  onDegrees: (value: boolean) => void;
  onLoop: (value: { start: number; end: number } | null) => void;
  onNotice: (value: string) => void;
  onVolume: (id: StemId, value: number) => void;
  onMute: (id: StemId) => void;
  onSolo: (id: StemId) => void;
}) {
  const [section, setSection] = useState<"chords" | "stems" | "info">("chords");
  const keyName = `${formatPc(view.tonic, view.flats)} ${modeLabel(analysis.key.mode)}`;
  const scale = scalePcs(analysis.key.mode).map((step) => formatPc(view.tonic + step, view.flats));
  const tones =
    view.current && view.current.root >= 0
      ? chordIntervals(view.current.suffix).map((step) => (view.current!.root + step) % 12)
      : [];

  function labelOf(chord: ChordEvent) {
    if (chord.root < 0) return "N.C.";
    if (!degrees) return chord.symbol;
    return degreeLabel(chord.root, chord.suffix, view.tonic, analysis.key.mode);
  }

  async function copyChart() {
    const body = chartBody(title, keyName, analysis.bpm, transpose, view.chords, labelOf);
    try {
      await navigator.clipboard.writeText(body);
      onNotice("คัดลอกชาร์ตแล้ว");
    } catch {
      downloadBlob(textBlob(body), `${slug(title)}-chords.txt`);
      onNotice("เบราว์เซอร์ไม่ให้คัดลอก จึงดาวน์โหลดไฟล์แทน");
    }
  }

  const sectionTabs = [
    { id: "chords", label: "คอร์ด", icon: ListMusic },
    { id: "stems", label: "แยกเสียง", icon: Headphones },
    { id: "info", label: "วิเคราะห์เพลง", icon: Gauge },
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 pb-56 sm:px-4">
      {analysis.truncated ? (
        <p className="panel px-3 py-2 text-sm text-muted">วิเคราะห์ {Math.round(MAX_SECONDS / 60)} นาทีแรกของไฟล์ ส่วนที่เหลือยังไม่ได้แยก</p>
      ) : null}

      {/* Always visible: where am I in the song + what chord is it */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Waveform peaks={peaks} time={time} duration={analysis.duration} beats={analysis.beats} loop={loop} onCue={onCue} />
          <div className="panel p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="title-rock text-xl">คอร์ดตามเวลา</h2>
              <p className="text-xs text-muted">แตะเพื่อกระโดด</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {view.chords.map((chord) => {
                const active = view.current?.time === chord.time;
                const width = Math.round(Math.min(168, Math.max(72, chord.duration * 52)));
                return (
                  <button
                    key={`${chord.time}-${chord.symbol}`}
                    type="button"
                    onClick={() => onCue(chord.time)}
                    style={{ width }}
                    className={`flex h-16 shrink-0 flex-col items-start justify-center rounded-md border-2 px-3 text-left ${active ? "border-black bg-brass text-white shadow-[2px_2px_0_#000]" : "border-transparent bg-surface-2 text-fg"}`}
                  >
                    <span className="text-base font-bold">{labelOf(chord)}</span>
                    <span className={`text-xs tabular-nums ${active ? "text-white/80" : "text-muted"}`}>{formatClock(chord.time)}</span>
                  </button>
                );
              })}
            </div>
            {analysis.sections.length > 1 ? (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {analysis.sections.map((section) => (
                  <button
                    key={`${section.time}-${section.label}`}
                    type="button"
                    onClick={() => onCue(section.time)}
                    className="h-9 shrink-0 rounded-md border border-line bg-surface px-3 text-xs"
                  >
                    {section.label}
                    <span className="ml-2 tabular-nums text-muted">{formatClock(section.time)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <section className="panel flex flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted">คอร์ดตอนนี้</p>
              <p className="font-display text-6xl leading-none text-grad">{view.current ? labelOf(view.current) : "—"}</p>
              {view.current && degrees ? <p className="text-sm text-muted">{view.current.symbol}</p> : null}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">คีย์</p>
              <p className="font-semibold">{keyName}</p>
              <p className="mt-1 text-xs text-muted">{analysis.bpm} BPM</p>
            </div>
          </div>
          {view.current ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <ChordDiagram root={view.current.root} suffix={view.current.suffix} label={view.current.symbol} active />
              <button
                type="button"
                onClick={() =>
                  onLoop(
                    loop && loop.start === view.current?.time
                      ? null
                      : { start: view.current!.time, end: view.current!.time + view.current!.duration },
                  )
                }
                className={`h-10 rounded-md px-3 text-sm font-semibold ${loop && view.current && loop.start === view.current.time ? "bg-brass text-white" : "border-2 border-line bg-surface-2"}`}
              >
                {loop && view.current && loop.start === view.current.time ? "ปิดวน" : "วนท่อนนี้"}
              </button>
            </div>
          ) : null}
          <p className="mt-auto pt-2 text-xs text-muted">
            {view.capo.capo === 0 ? `กีตาร์จับรูป ${view.capo.shape} ได้เลย` : `คาโปช่อง ${view.capo.capo} แล้วจับรูป ${view.capo.shape}`}
          </p>
        </section>
      </div>

      {/* Organised tools */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none" role="tablist" aria-label="เครื่องมือ">
        {sectionTabs.map((tab) => {
          const Icon = tab.icon;
          const on = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSection(tab.id)}
              className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border-2 px-4 text-sm font-semibold ${on ? "border-black bg-brass text-white shadow-[3px_3px_0_#000]" : "border-line bg-surface text-muted"}`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {section === "chords" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="panel p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="title-rock text-2xl">รูปจับคอร์ดในเพลง</h2>
              <p className="text-xs text-muted">กด − / + คีย์ที่แถบล่างเพื่อย้ายคีย์ทั้งเพลง</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {uniqueChords(view.chords).map((chord) => (
                <ChordDiagram key={chord.symbol} root={chord.root} suffix={chord.suffix} label={chord.symbol} active={view.current?.symbol === chord.symbol} />
              ))}
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted">โน้ตในคอร์ดตอนนี้</p>
              <Piano tones={tones} />
            </div>
          </div>
          <section className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="title-rock text-2xl">ชาร์ตคอร์ด</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={degrees}
                  onClick={() => onDegrees(!degrees)}
                  className={`h-10 rounded-md px-3 text-sm ${degrees ? "bg-brass text-white" : "border border-line bg-surface-2"}`}
                >
                  เลขโรมัน
                </button>
                <button type="button" onClick={() => void copyChart()} className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-sm">
                  <Copy className="size-4" aria-hidden="true" />
                  คัดลอก
                </button>
              </div>
            </div>
            {notice ? <p className="mt-2 text-sm text-olive">{notice}</p> : null}
            <ol className="mt-3 max-h-96 overflow-auto">
              {view.chords.map((chord) => {
                const active = view.current?.time === chord.time;
                return (
                  <li key={`${chord.time}-${chord.symbol}`}>
                    <button
                      type="button"
                      onClick={() => onCue(chord.time)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left ${active ? "bg-surface-2 text-brass" : ""}`}
                    >
                      <span className="w-14 shrink-0 tabular-nums text-sm text-muted">{formatClock(chord.time)}</span>
                      <span className="flex-1 text-base font-semibold">{labelOf(chord)}</span>
                      <span className="text-xs tabular-nums text-muted">{Math.round(chord.confidence * 100)}%</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      ) : null}

      {section === "stems" ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            {STEMS.map((stem) => {
              const data = analysis.stems.find((item) => item.id === stem.id);
              const Icon = ICONS[stem.id];
              return (
                <article key={stem.id} className="panel p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`grid h-10 w-10 place-items-center rounded-md border-2 border-black ${stem.tonal ? "bg-brass text-white" : "bg-olive text-black"}`}>
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">
                        {stem.name}
                        <span className="ml-2 font-normal text-muted">{stem.en}</span>
                      </h3>
                      <p className="truncate text-xs text-muted">{stem.blurb}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Toggle label="มิวต์" pressed={muted[stem.id]} onClick={() => onMute(stem.id)} />
                      <Toggle label="โซโล" pressed={solo[stem.id]} onClick={() => onSolo(stem.id)} />
                      <button
                        type="button"
                        aria-label={`ดาวน์โหลดเลน${stem.name}`}
                        onClick={() => {
                          if (!data) return;
                          downloadBlob(wavBlob(data.samples, analysis.sampleRate), `${slug(title)}-${stem.en}.wav`);
                        }}
                        className="grid h-10 w-10 place-items-center rounded-md border border-line bg-surface-2"
                      >
                        <Download className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {data ? <Spark values={data.envelope} tonal={stem.tonal} /> : null}
                  <label className="mt-1 flex items-center gap-2 text-xs text-muted">
                    ดัง
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volumes[stem.id]}
                      onChange={(event) => onVolume(stem.id, Number(event.target.value))}
                      className="w-full"
                    />
                  </label>
                </article>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            การแยกเสียงใช้การแยกฮาร์โมนิกกับจังหวะและตำแหน่งกลางสนาม ถ้ากีตาร์กับเสียงร้องอยู่กลางพร้อมกันอาจปนกัน · “ต้นฉบับ” ที่แถบล่างคือไฟล์สเตอริโอจริง
          </p>
        </div>
      ) : null}

      {section === "info" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className="panel p-4">
            <p className="text-xs text-muted">คีย์</p>
            <p className="title-rock text-4xl">{keyName}</p>
            <p className="text-sm text-muted">
              {solfege(view.tonic)} · มั่นใจ {Math.round(analysis.key.confidence * 100)}%
            </p>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-xs text-muted">บีพีเอ็ม</p>
                <p className="title-rock text-4xl tabular-nums">{analysis.bpm}</p>
              </div>
              <p className="text-xs text-muted">จังหวะมั่น {Math.round(analysis.bpmConfidence * 100)}%</p>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {scale.map((note) => (
                <li key={note} className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium">
                  {note}
                </li>
              ))}
            </ul>
            <h3 className="mt-5 text-sm font-semibold">แท็ก</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {analysis.tags.map((tag) => (
                <li key={tag.id} title={tag.detail} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-sm">
                  {tag.label}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-3">
              <Meter label="พลังงาน" value={analysis.meters.energy} />
              <Meter label="ความสว่าง" value={analysis.meters.brightness} />
              <Meter label="ความอบอุ่น" value={analysis.meters.warmth} />
              <Meter label="จังหวะเต้น" value={analysis.meters.dance} />
              <Meter label="เสียงกลาง" value={analysis.meters.vocal} />
            </div>
          </section>
          <Spectrogram spectro={analysis.spectro} time={time} duration={analysis.duration} onCue={onCue} />
        </div>
      ) : null}
    </main>
  );
}

function Toggle({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`h-11 rounded-md px-3 text-sm font-medium ${pressed ? "bg-brass text-brass-ink" : "border border-line bg-surface-2"}`}
    >
      {label}
    </button>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-fg">{Math.round(value * 100)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brass" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function Spark({ values, tonal }: { values: Float32Array; tonal: boolean }) {
  const d = Array.from(values)
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 22 - value * 18;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 24" className={`mt-2 h-8 w-full ${tonal ? "text-brass" : "text-olive"}`} aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.4" points={d} />
    </svg>
  );
}

function Piano({ tones }: { tones: number[] }) {
  const set = new Set(tones);
  const whites: number[] = [];
  const blacks: { midi: number; after: number }[] = [];
  let whiteCount = 0;
  for (let midi = 48; midi < 72; midi++) {
    const pc = midi % 12;
    if ([0, 2, 4, 5, 7, 9, 11].includes(pc)) {
      whites.push(midi);
      whiteCount += 1;
    } else blacks.push({ midi, after: whiteCount });
  }
  return (
    <div className="relative mt-4 h-24">
      <div className="flex h-full gap-px">
        {whites.map((midi) => {
          const on = set.has(midi % 12);
          return (
            <div
              key={midi}
              className={`h-full flex-1 rounded-sm ${on ? "bg-brass" : "bg-fg"}`}
            />
          );
        })}
      </div>
      {blacks.map((key) => (
        <div
          key={key.midi}
          className={`absolute top-0 h-14 w-3 rounded-sm ${set.has(key.midi % 12) ? "bg-olive" : "bg-bg"}`}
          style={{ left: `calc(${(key.after / whites.length) * 100}% - 0.375rem)` }}
        />
      ))}
    </div>
  );
}

function Waveform({
  peaks,
  time,
  duration,
  beats,
  loop,
  onCue,
}: {
  peaks: Float32Array | null;
  time: number;
  duration: number;
  beats: number[];
  loop: { start: number; end: number } | null;
  onCue: (time: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !peaks) return;
    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      const g = canvas.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const brass = rgb(cssVar("--color-brass"));
      const muted = rgb(cssVar("--color-muted"));
      g.clearRect(0, 0, width, height);
      if (loop && duration > 0) {
        g.fillStyle = `rgba(${brass[0]}, ${brass[1]}, ${brass[2]}, 0.14)`;
        const x0 = (loop.start / duration) * width;
        const x1 = (loop.end / duration) * width;
        g.fillRect(x0, 0, Math.max(2, x1 - x0), height);
      }
      const played = duration > 0 ? time / duration : 0;
      const bar = Math.max(1, width / peaks.length - 0.4);
      for (let i = 0; i < peaks.length; i++) {
        const amp = Math.max(1, peaks[i] * height * 0.46);
        const x = (i / peaks.length) * width;
        const color = i / peaks.length <= played ? brass : muted;
        g.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        g.fillRect(x, height / 2 - amp, bar, amp * 2);
      }
      g.fillStyle = `rgba(${brass[0]}, ${brass[1]}, ${brass[2]}, 0.45)`;
      for (const beat of beats) {
        if (duration <= 0) break;
        g.fillRect((beat / duration) * width, 0, 1, 6);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, time, duration, beats, loop]);

  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>คลื่นเสียง</span>
        <span className="tabular-nums">
          {formatClock(time)} / {formatClock(duration)}
        </span>
      </div>
      <canvas
        ref={ref}
        className="h-28 w-full"
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const next = ((event.clientX - rect.left) / rect.width) * duration;
          onCue(Math.max(0, Math.min(duration, next)));
        }}
      />
    </div>
  );
}

function Spectrogram({
  spectro,
  time,
  duration,
  onCue,
}: {
  spectro: Analysis["spectro"];
  time: number;
  duration: number;
  onCue: (time: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      const g = canvas.getContext("2d");
      if (!g) return;
      const off = document.createElement("canvas");
      off.width = spectro.cols;
      off.height = spectro.rows;
      const og = off.getContext("2d");
      if (!og) return;
      const image = og.createImageData(spectro.cols, spectro.rows);
      const brass = rgb(cssVar("--color-brass"));
      for (let c = 0; c < spectro.cols; c++) {
        for (let y = 0; y < spectro.rows; y++) {
          const v = spectro.values[c * spectro.rows + y] / 255;
          const i = (y * spectro.cols + c) * 4;
          image.data[i] = Math.round(16 + v * brass[0]);
          image.data[i + 1] = Math.round(14 + v * brass[1] * 0.72);
          image.data[i + 2] = Math.round(12 + v * brass[2] * 0.35);
          image.data[i + 3] = 255;
        }
      }
      og.putImageData(image, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(off, 0, 0, width, height);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [spectro]);

  const playhead = duration > 0 ? `${(time / duration) * 100}%` : "0%";
  return (
    <div className="panel p-3">
      <p className="mb-2 text-xs text-muted">สเปกโตรแกรม</p>
      <div
        className="relative h-24"
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onCue(Math.max(0, Math.min(duration, ((event.clientX - rect.left) / rect.width) * duration)));
        }}
      >
        <canvas ref={ref} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-y-0 w-px bg-brass" style={{ left: playhead }} />
      </div>
    </div>
  );
}

function Transport({
  playing,
  time,
  duration,
  mode,
  rate,
  metro,
  loop,
  transpose,
  keyName,
  keepPitch,
  processing,
  vocalCut,
  onToggle,
  onMode,
  onRate,
  onTranspose,
  onKeepPitch,
  onVocalCut,
  onMetro,
  onClearLoop,
}: {
  playing: boolean;
  time: number;
  duration: number;
  mode: "original" | "stems";
  rate: number;
  metro: boolean;
  loop: { start: number; end: number } | null;
  transpose: number;
  keyName: string;
  keepPitch: boolean;
  processing: number | null;
  vocalCut: boolean;
  onToggle: () => void;
  onMode: (mode: "original" | "stems") => void;
  onRate: (rate: number) => void;
  onTranspose: (value: number) => void;
  onKeepPitch: (value: boolean) => void;
  onVocalCut: () => void;
  onMetro: (value: boolean) => void;
  onClearLoop: () => void;
}) {
  const pct = Math.round(rate * 100);
  const step = (delta: number) => onRate(Math.min(1.5, Math.max(0.5, Math.round((rate + delta) * 100) / 100)));
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-16 z-30 border-t border-line bg-bg/95 px-3 py-2 backdrop-blur lg:bottom-0">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? "หยุด" : "เล่น"}
          className="grid h-12 w-12 place-items-center rounded-full bg-brass text-brass-ink"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <p className="min-w-24 text-sm tabular-nums">
          {formatClock(time)}
          <span className="text-muted"> / {formatClock(duration)}</span>
        </p>
        <div className="flex gap-1">
          <Chip on={mode === "original"} onClick={() => onMode("original")}>
            ต้นฉบับ
          </Chip>
          <Chip on={mode === "stems"} onClick={() => onMode("stems")}>
            มิกซ์เลน
          </Chip>
        </div>
        <div className="flex items-center rounded-md border border-line bg-surface" aria-label="ความเร็ว">
          <button type="button" aria-label="ช้าลง" onClick={() => step(-0.05)} className="grid h-10 w-9 place-items-center">
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span className="w-14 text-center text-sm font-semibold tabular-nums">{pct}%</span>
          <button type="button" aria-label="เร็วขึ้น" onClick={() => step(0.05)} className="grid h-10 w-9 place-items-center">
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center rounded-md border border-line bg-surface" aria-label="เปลี่ยนคีย์">
          <button type="button" aria-label="ลดคีย์" onClick={() => onTranspose(Math.max(-6, transpose - 1))} className="grid h-10 w-9 place-items-center">
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span className="min-w-20 text-center text-sm font-semibold tabular-nums">
            คีย์ {keyName}
            {transpose !== 0 ? <span className="ml-1 text-xs text-brass">{transpose > 0 ? `+${transpose}` : transpose}</span> : null}
          </span>
          <button type="button" aria-label="เพิ่มคีย์" onClick={() => onTranspose(Math.min(6, transpose + 1))} className="grid h-10 w-9 place-items-center">
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          aria-pressed={vocalCut}
          onClick={onVocalCut}
          className={`inline-flex h-10 items-center gap-1 rounded-md px-3 text-sm ${vocalCut ? "bg-brass text-brass-ink" : "border border-line bg-surface"}`}
        >
          <MicOff className="size-4" aria-hidden="true" />
          ตัดเสียงร้อง
        </button>
        <button
          type="button"
          aria-pressed={metro}
          onClick={() => onMetro(!metro)}
          className={`inline-flex h-10 items-center gap-1 rounded-md px-3 text-sm ${metro ? "bg-brass text-brass-ink" : "border border-line bg-surface"}`}
        >
          <Timer className="size-4" aria-hidden="true" />
          คลิก
        </button>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={keepPitch} onChange={(event) => onKeepPitch(event.target.checked)} className="h-4 w-4 accent-[var(--color-brass)]" />
          รักษาระดับเสียง
        </label>
        {processing != null ? (
          <span className="text-xs text-brass" aria-live="polite">
            กำลังประมวลผล {Math.round(processing * 100)}%
          </span>
        ) : loop ? (
          <button type="button" onClick={onClearLoop} className="h-10 rounded-md border border-line px-3 text-sm text-brass">
            กำลังวน · ยกเลิก
          </button>
        ) : (
          <p className="hidden text-xs text-muted xl:block">สเปซบาร์ = เล่น/หยุด</p>
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-md px-3 text-sm ${on ? "bg-brass text-brass-ink" : "border border-line bg-surface"}`}
    >
      {children}
    </button>
  );
}

function uniqueChords(chords: ChordEvent[]): ChordEvent[] {
  const seen = new Set<string>();
  const out: ChordEvent[] = [];
  for (const chord of chords) {
    if (chord.root < 0 || seen.has(chord.symbol)) continue;
    seen.add(chord.symbol);
    out.push(chord);
    if (out.length >= 12) break;
  }
  return out;
}

function chartBody(
  title: string,
  keyName: string,
  bpm: number,
  transpose: number,
  chords: ChordEvent[],
  labelOf: (chord: ChordEvent) => string,
) {
  const lines = [`เลน — ${title || "เพลง"}`, `คีย์ ${keyName} · ${bpm} BPM · ย้าย ${transpose}`, ""];
  for (const chord of chords) lines.push(`${formatClock(chord.time)}  ${labelOf(chord)}`);
  return lines.join("\n");
}

function slug(name: string) {
  const clean = name.replace(/[^\w\u0E00-\u0E7F.-]+/g, "-").replace(/^-|-$/g, "");
  return clean.slice(0, 48) || "lane";
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#e2a23a";
}

function rgb(color: string): [number, number, number] {
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d");
  if (!g) return [226, 162, 58];
  g.fillStyle = "#000000";
  g.fillStyle = color;
  const hex = g.fillStyle;
  if (typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  return [226, 162, 58];
}
