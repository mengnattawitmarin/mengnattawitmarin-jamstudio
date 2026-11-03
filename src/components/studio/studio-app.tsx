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
  Headphones,
  ListMusic,
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
  const [desk, setDesk] = useState<"studio" | "jam" | "rig">("studio");

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
    } catch (reason) {
      if (id !== jobRef.current) return;
      const message = reason instanceof Error ? reason.message : "วิเคราะห์ไม่สำเร็จ";
      setError(message.includes("decode") ? "อ่านไฟล์เสียงนี้ไม่ได้ ลอง wav หรือ mp3" : message);
    } finally {
      if (id === jobRef.current) setBusy(false);
    }
  }

  async function onFile(file: File) {
    setTitle(file.name.replace(/\.[^.]+$/, ""));
    setBusy(true);
    setError("");
    try {
      const ctx = player().ensure();
      const audio = await ctx.decodeAudioData(await file.arrayBuffer());
      await ingest(audio, file.name.replace(/\.[^.]+$/, ""));
    } catch {
      setBusy(false);
      setError("อ่านไฟล์เสียงนี้ไม่ได้ ลอง wav, mp3 หรือ ogg");
    }
  }

  async function onDemo() {
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

  const view = useMemo(() => {
    if (!analysis) return null;
    const tonic = (analysis.key.tonicPc + transpose + 12) % 12;
    const flats = preferFlats(tonic, analysis.key.mode);
    const chords = analysis.chords.map((chord) => shiftChord(chord, transpose, flats));
    const current = chords.find((chord) => time >= chord.time && time < chord.time + chord.duration) ?? chords[0];
    return { tonic, flats, chords, current, capo: capoSuggestion(tonic, analysis.key.mode) };
  }, [analysis, transpose, time]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-brass text-brass-ink">
            <AudioLines className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold leading-tight">เลน</p>
            <p className="truncate text-xs text-muted">
              {desk === "jam" ? "ห้องซ้อม · แจมไมดีเลย์" : desk === "rig" ? "ตู้แอมป์ · ซ้อมพร้อมเพลง" : title || "LANE · แยกเสียงในเบราว์เซอร์"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex rounded-md border border-line bg-surface p-1">
            <button
              type="button"
              onClick={() => setDesk("studio")}
              className={`h-11 rounded-md px-3 text-sm font-medium ${desk === "studio" ? "bg-brass text-brass-ink" : ""}`}
            >
              สตูดิโอ
            </button>
            <button
              type="button"
              onClick={() => {
                playerRef.current?.pause();
                setPlaying(false);
                setDesk("rig");
              }}
              className={`h-11 rounded-md px-3 text-sm font-medium ${desk === "rig" ? "bg-brass text-brass-ink" : ""}`}
            >
              ตู้แอมป์
            </button>
            <button
              type="button"
              onClick={() => {
                playerRef.current?.pause();
                setPlaying(false);
                setDesk("jam");
              }}
              className={`h-11 rounded-md px-3 text-sm font-medium ${desk === "jam" ? "bg-brass text-brass-ink" : ""}`}
            >
              ห้องซ้อม
            </button>
          </div>
          {analysis && desk === "studio" ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            เพลงใหม่
          </button>
        ) : null}
        </div>
      </header>

      {desk === "rig" ? (
        <RigRoom
          pullStudio={() => {
            const buffer = playerRef.current?.original ?? null;
            if (!buffer) return null;
            return { buffer, title: title || "เพลงจากสตูดิโอ", bpm: analysis?.bpm ?? null };
          }}
        />
      ) : desk === "jam" ? (
        <JamRoom />
      ) : !analysis ? (
        <Landing
          busy={busy}
          status={status}
          ratio={ratio}
          error={error}
          onUpload={() => fileRef.current?.click()}
          onDemo={() => void onDemo()}
          onDropFile={(file) => void onFile(file)}
          onJam={() => setDesk("jam")}
          onRig={() => setDesk("rig")}
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
      ) : null}

      {analysis && desk === "studio" ? (
        <Transport
          playing={playing}
          time={time}
          duration={analysis.duration}
          mode={mode}
          rate={rate}
          metro={metro}
          loop={loop}
          onToggle={() => void toggle()}
          onMode={(next) => pushMix(next, volumes, audible)}
          onRate={(next) => {
            setRate(next);
            const engine = player();
            engine.rate = next;
            if (engine.isPlaying()) engine.play(engine.currentTime());
          }}
          onMetro={(next) => {
            setMetro(next);
            const engine = player();
            engine.metronome = next;
          }}
          onClearLoop={() => setLoop(null)}
        />
      ) : null}

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
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 lg:py-12"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) onDropFile(file);
      }}
    >
      <div className="grid items-start gap-8 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <p className="text-sm font-medium text-brass">สตูดิโอแยกเสียง</p>
          <h1 className="mt-2 max-w-xl text-4xl font-semibold tracking-tight">แยกเลนเสียง แกะคอร์ด แล้วติดแท็กให้เพลง</h1>
          <p className="mt-4 max-w-xl text-base text-muted">
            วางเพลงลงไป เลนจะแยกเสียงร้อง เบส กลองเตะ กลอง ฉาบ และฮาร์โมนี ให้โซโลหรือดาวน์โหลดได้
            พร้อมคอร์ดตามเวลา คีย์ สเกล คาโป และแท็กอารมณ์ ทุกอย่างเกิดในเบราว์เซอร์ ไฟล์ไม่ถูกส่งออกไปไหน
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
              ตู้แอมป์ซ้อม
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
            <p role="alert" className="mt-4 text-sm text-brass">
              {error}
            </p>
          ) : null}
          {busy ? (
            <div className="mt-6 rounded-lg border border-line bg-surface p-4" aria-live="polite">
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
        <aside className="rounded-lg border border-line bg-surface p-4 lg:col-span-5">
          <p className="text-xs font-medium tracking-wide text-muted">เลนในมิกเซอร์</p>
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
    <article className="rounded-lg border border-line bg-surface p-4">
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

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 pb-48 lg:grid-cols-12">
      <aside className="order-2 flex flex-col gap-4 lg:order-1 lg:col-span-4">
        <section className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs text-muted">คีย์</p>
          <p className="text-3xl font-semibold tracking-tight">{keyName}</p>
          <p className="text-sm text-muted">
            {solfege(view.tonic)} · มั่นใจ {Math.round(analysis.key.confidence * 100)}%
          </p>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-xs text-muted">บีพีเอ็ม</p>
              <p className="text-3xl font-semibold tabular-nums">{analysis.bpm}</p>
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
          <p className="mt-3 text-sm text-muted">
            {view.capo.capo === 0
              ? `กีตาร์จับรูป ${view.capo.shape} ได้เลย ไม่ต้องคาโป`
              : `คาโปช่อง ${view.capo.capo} แล้วจับรูป ${view.capo.shape}`}
          </p>
        </section>

        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted">คอร์ดตอนนี้</p>
              <p className="text-4xl font-semibold tracking-tight">{view.current ? labelOf(view.current) : "—"}</p>
              {view.current && degrees ? <p className="text-sm text-muted">{view.current.symbol}</p> : null}
            </div>
            {view.current ? (
              <button
                type="button"
                onClick={() =>
                  onLoop(
                    loop && loop.start === view.current?.time
                      ? null
                      : { start: view.current!.time, end: view.current!.time + view.current!.duration },
                  )
                }
                className="h-11 rounded-md border border-line bg-surface-2 px-3 text-sm"
              >
                {loop && view.current && loop.start === view.current.time ? "ปิดวน" : "วนคอร์ดนี้"}
              </button>
            ) : null}
          </div>
          <Piano tones={tones} />
        </section>

        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">แท็ก</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
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
      </aside>

      <section className="order-1 flex min-w-0 flex-col gap-4 lg:order-2 lg:col-span-8">
        {analysis.truncated ? (
          <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted">
            วิเคราะห์ {Math.round(MAX_SECONDS / 60)} นาทีแรกของไฟล์ ส่วนที่เหลือยังไม่ได้แยก
          </p>
        ) : null}
        <Waveform peaks={peaks} time={time} duration={analysis.duration} beats={analysis.beats} loop={loop} onCue={onCue} />
        <Spectrogram spectro={analysis.spectro} time={time} duration={analysis.duration} onCue={onCue} />
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">คอร์ดตามเวลา</h2>
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
                  className={`flex h-16 shrink-0 flex-col items-start justify-center rounded-md px-3 text-left ${active ? "bg-brass text-brass-ink" : "bg-surface-2 text-fg"}`}
                >
                  <span className="text-base font-semibold">{labelOf(chord)}</span>
                  <span className={`text-xs tabular-nums ${active ? "text-brass-ink" : "text-muted"}`}>{formatClock(chord.time)}</span>
                </button>
              );
            })}
          </div>
        </div>
        {analysis.sections.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto">
            {analysis.sections.map((section) => (
              <button
                key={`${section.time}-${section.label}`}
                type="button"
                onClick={() => onCue(section.time)}
                className="h-11 shrink-0 rounded-md border border-line bg-surface px-3 text-sm"
              >
                {section.label}
                <span className="ml-2 tabular-nums text-muted">{formatClock(section.time)}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {STEMS.map((stem) => {
            const data = analysis.stems.find((item) => item.id === stem.id);
            const Icon = ICONS[stem.id];
            return (
              <article key={stem.id} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-md ${stem.tonal ? "bg-brass text-brass-ink" : "bg-olive text-brass-ink"}`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">
                      {stem.name}
                      <span className="ml-2 font-normal text-muted">{stem.en}</span>
                    </h3>
                    <p className="text-xs text-muted">{stem.blurb}</p>
                  </div>
                  <div className="flex gap-2">
                    <Toggle label="มิวต์" pressed={muted[stem.id]} onClick={() => onMute(stem.id)} />
                    <Toggle label="โซโล" pressed={solo[stem.id]} onClick={() => onSolo(stem.id)} />
                    <button
                      type="button"
                      aria-label={`ดาวน์โหลดเลน${stem.name}`}
                      onClick={() => {
                        if (!data) return;
                        downloadBlob(wavBlob(data.samples, analysis.sampleRate), `${slug(title)}-${stem.en}.wav`);
                      }}
                      className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface-2"
                    >
                      <Download className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {data ? <Spark values={data.envelope} tonal={stem.tonal} /> : null}
                <label className="mt-2 block text-xs text-muted">
                  ความดัง
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
          <p className="text-xs text-muted">
            เลนมาจากการแยกฮาร์โมนิกกับจังหวะ และตำแหน่งกลางสนาม ไม่ใช่โมเดลที่รู้ชื่อเครื่องดนตรีทุกชิ้น
            ถ้ากีตาร์กับเสียงร้องอยู่กลางพร้อมกัน อาจปนในเลนร้อง ปุ่มต้นฉบับคือไฟล์สเตอริโอจริง
          </p>
        </div>

        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">ชาร์ตคอร์ด</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-label="ลดคีย์" onClick={() => onTranspose(Math.max(-6, transpose - 1))} className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface-2">
                <Minus className="size-4" />
              </button>
              <span className="min-w-16 text-center text-sm tabular-nums">
                {transpose > 0 ? `+${transpose}` : transpose}
              </span>
              <button type="button" aria-label="เพิ่มคีย์" onClick={() => onTranspose(Math.min(6, transpose + 1))} className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface-2">
                <Plus className="size-4" />
              </button>
              <button
                type="button"
                aria-pressed={degrees}
                onClick={() => onDegrees(!degrees)}
                className={`h-11 rounded-md px-3 text-sm ${degrees ? "bg-brass text-brass-ink" : "border border-line bg-surface-2"}`}
              >
                เลขโรมัน
              </button>
              <button type="button" onClick={() => void copyChart()} className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-sm">
                <Copy className="size-4" aria-hidden="true" />
                คัดลอก
              </button>
            </div>
          </div>
          {notice ? <p className="mt-2 text-sm text-olive">{notice}</p> : null}
          <ol className="mt-3 max-h-80 overflow-auto">
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
      </section>
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
    <div className="rounded-lg border border-line bg-surface p-3">
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
    <div className="rounded-lg border border-line bg-surface p-3">
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
  onToggle,
  onMode,
  onRate,
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
  onToggle: () => void;
  onMode: (mode: "original" | "stems") => void;
  onRate: (rate: number) => void;
  onMetro: (value: boolean) => void;
  onClearLoop: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg px-3 py-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
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
        <div className="flex gap-1">
          {[0.75, 1, 1.25].map((value) => (
            <Chip key={value} on={rate === value} onClick={() => onRate(value)}>
              {value === 1 ? "1×" : `${value}×`}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={metro}
          onClick={() => onMetro(!metro)}
          className={`inline-flex h-11 items-center gap-1 rounded-md px-3 text-sm ${metro ? "bg-brass text-brass-ink" : "border border-line bg-surface"}`}
        >
          <Timer className="size-4" aria-hidden="true" />
          คลิก
        </button>
        {loop ? (
          <button type="button" onClick={onClearLoop} className="h-11 rounded-md border border-line px-3 text-sm text-brass">
            กำลังวน
          </button>
        ) : (
          <p className="hidden text-xs text-muted sm:block">สเปซเพื่อเล่น · ความเร็วเปลี่ยนระดับเสียงตาม</p>
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
      className={`h-11 rounded-md px-3 text-sm ${on ? "bg-brass text-brass-ink" : "border border-line bg-surface"}`}
    >
      {children}
    </button>
  );
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
