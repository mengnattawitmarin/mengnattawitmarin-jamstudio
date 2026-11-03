import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Guitar,
  Mic,
  Minus,
  Pause,
  Play,
  Plus,
  Timer,
  Trash2,
  Upload,
  Waves,
} from "lucide-react";
import { renderDemo } from "@/lib/audio/demo-track";
import { formatClock } from "@/lib/audio/theory";
import {
  AMP_KNOBS,
  AMPS,
  BASS_STRINGS,
  DEFAULT_RIG,
  GUITAR_STRINGS,
  MAX_PEDALS,
  PEDALS,
  RIG_PRESETS,
  ROOMS,
  RigEngine,
  applyPreset,
  describePitch,
  formatKnob,
  fretHint,
  makePedal,
  pedalMeta,
  readSnapshot,
  type AmpId,
  type PedalState,
  type RigSnapshot,
  type SourceId,
  type TunerReading,
} from "@/lib/audio/rig";

const FRET_CODES = [
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyR",
  "KeyT",
  "KeyY",
  "KeyU",
  "KeyI",
  "KeyO",
  "KeyP",
  "BracketLeft",
  "BracketRight",
  "Backslash",
];
const STRING_CODES = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"];
const FRETS = Array.from({ length: 13 }, (_, fret) => fret);
const DOTS = new Set([3, 5, 7, 9, 12]);

type Pull = { buffer: AudioBuffer; title: string; bpm: number | null };

function stringsFor(source: SourceId) {
  return source === "bass" ? BASS_STRINGS : GUITAR_STRINGS;
}

export function RigRoom({ pullStudio }: { pullStudio: () => Pull | null }) {
  const engineRef = useRef<RigEngine | null>(null);
  const rigRef = useRef<RigSnapshot>(DEFAULT_RIG);
  const fileRef = useRef<HTMLInputElement>(null);
  const pointers = useRef<Map<number, number>>(new Map());
  const holds = useRef<Map<number, number>>(new Map());
  const stringRef = useRef(0);
  const sourceRef = useRef<SourceId>(DEFAULT_RIG.source);

  const [rig, setRig] = useState<RigSnapshot>(DEFAULT_RIG);
  const [reading, setReading] = useState<TunerReading>({ hz: 0, rms: 0 });
  const [beat, setBeat] = useState(0);
  const [stringIndex, setStringIndex] = useState(0);
  const [held, setHeld] = useState<number[]>([]);
  const [tuneAs, setTuneAs] = useState<"guitar" | "bass">("guitar");
  const [liveOn, setLiveOn] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const [trackError, setTrackError] = useState("");
  const [clock, setClock] = useState(0);
  const [duration, setDuration] = useState(0);
  const [backingOn, setBackingOn] = useState(false);
  const [loop, setLoop] = useState(true);
  const [rate, setRate] = useState(1);
  const [songLevel, setSongLevel] = useState(0.7);

  rigRef.current = rig;
  sourceRef.current = rig.source;
  stringRef.current = stringIndex;

  function pushAudio(prev: RigSnapshot, next: RigSnapshot) {
    const engine = engineRef.current;
    if (!engine) return;
    if (prev.input !== next.input) engine.setInput(next.input);
    if (prev.master !== next.master) engine.setMaster(next.master);
    if (prev.amp !== next.amp || prev.knobs !== next.knobs) engine.setAmp(next.amp, next.knobs);
    if (prev.ambience !== next.ambience) engine.setAmbience(next.ambience);
    if (prev.pedals !== next.pedals) engine.setPedals(next.pedals);
    if (prev.click !== next.click || prev.bpm !== next.bpm) engine.setMetronome(next.click ? next.bpm : null);
  }

  function commit(recipe: (current: RigSnapshot) => RigSnapshot) {
    const prev = rigRef.current;
    const next = recipe(prev);
    rigRef.current = next;
    setRig(next);
    pushAudio(prev, next);
  }

  useEffect(() => {
    const saved = readSnapshot(localStorage.getItem("lane-rig"));
    const initial = rigRef.current === DEFAULT_RIG ? saved : rigRef.current;
    rigRef.current = initial;
    sourceRef.current = initial.source;
    setRig(initial);
    if (initial.source === "bass") setTuneAs("bass");
    const engine = new RigEngine();
    engineRef.current = engine;
    engine.setInput(initial.input);
    engine.setMaster(initial.master);
    engine.setAmp(initial.amp, initial.knobs);
    engine.setAmbience(initial.ambience);
    engine.setPedals(initial.pedals);
    engine.setBackingLoop(true);
    engine.setBackingLevel(0.7);
    engine.setMetronome(initial.click ? initial.bpm : null);
    engine.onBeat = (next) => setBeat(next);
    const poll = window.setInterval(() => {
      const live = engineRef.current;
      if (!live) return;
      const next = live.read();
      setReading((prev) => {
        if (prev.hz === 0 && next.hz === 0 && Math.abs(prev.rms - next.rms) < 0.03) return prev;
        if (Math.abs(prev.hz - next.hz) < 0.35 && Math.abs(prev.rms - next.rms) < 0.03) return prev;
        return next;
      });
      const playing = live.backingIsPlaying();
      setBackingOn((prev) => (prev === playing ? prev : playing));
      if (playing) {
        const time = live.backingTime();
        setClock((prev) => (Math.abs(prev - time) < 0.04 ? prev : time));
      }
    }, 90);
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A" || tag === "SELECT") return;
      const live = engineRef.current;
      if (!live?.hasBacking()) return;
      event.preventDefault();
      if (live.backingIsPlaying()) live.pauseBacking();
      else void live.resume().then(() => live.playBacking());
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("keydown", onKey);
      engine.onBeat = null;
      engine.close();
      engineRef.current = null;
    };
  }, []);

  const saveReady = useRef(false);
  useEffect(() => {
    if (!saveReady.current) {
      saveReady.current = true;
      return;
    }
    localStorage.setItem("lane-rig", JSON.stringify(rig));
  }, [rig]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const source = sourceRef.current;
      if (source === "line") return;
      const strings = stringsFor(source);
      const stringKey = STRING_CODES.indexOf(event.code);
      if (stringKey >= 0 && stringKey < strings.length) {
        setStringIndex(stringKey);
        return;
      }
      const fret = FRET_CODES.indexOf(event.code);
      if (fret < 0) return;
      event.preventDefault();
      const open = strings[stringRef.current] ?? strings[0];
      if (!open) return;
      attack(open.midi + rigRef.current.capo + fret);
    };
    const up = (event: KeyboardEvent) => {
      const source = sourceRef.current;
      if (source === "line") return;
      const fret = FRET_CODES.indexOf(event.code);
      if (fret < 0) return;
      const strings = stringsFor(source);
      const open = strings[stringRef.current] ?? strings[0];
      if (!open) return;
      release(open.midi + rigRef.current.capo + fret);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function refreshHeld() {
    setHeld([...holds.current.keys()]);
  }

  function attack(note: number) {
    const count = (holds.current.get(note) ?? 0) + 1;
    holds.current.set(note, count);
    refreshHeld();
    if (count > 1) return;
    const engine = engineRef.current;
    if (!engine) return;
    const kind = sourceRef.current === "bass" ? "bass" : "guitar";
    const go = () => engine.noteOn(note, kind, 0.9);
    if (engine.ctx.state === "running") go();
    else void engine.resume().then(go);
  }

  function release(note: number) {
    const count = (holds.current.get(note) ?? 0) - 1;
    if (count <= 0) {
      holds.current.delete(note);
      engineRef.current?.noteOff(note);
    } else holds.current.set(note, count);
    refreshHeld();
  }

  function pointerDown(pointerId: number, note: number) {
    if (pointers.current.has(pointerId)) return;
    pointers.current.set(pointerId, note);
    attack(note);
    const end = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const played = pointers.current.get(pointerId);
      pointers.current.delete(pointerId);
      if (played != null) release(played);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function chooseSource(next: SourceId) {
    engineRef.current?.releaseAll();
    holds.current.clear();
    pointers.current.clear();
    setHeld([]);
    setStringIndex(0);
    if (next !== "line") {
      engineRef.current?.closeLive();
      setLiveOn(false);
      setTuneAs(next);
    }
    commit((current) => ({ ...current, source: next }));
  }

  async function toggleLive() {
    const engine = engineRef.current;
    if (!engine) return;
    if (liveOn) {
      engine.closeLive();
      setLiveOn(false);
      setLiveError("");
      return;
    }
    setLiveError("");
    try {
      await engine.openLive();
      setLiveOn(true);
    } catch {
      setLiveOn(false);
      setLiveError("เปิดอินพุตไม่ได้ อนุญาตไมโครโฟน หรือตรวจว่าเสียบสายอยู่ แล้วใช้หูฟังกันเสียงหอน");
    }
  }

  function usePreset(id: string) {
    const next = applyPreset(id);
    if (!next) return;
    engineRef.current?.releaseAll();
    holds.current.clear();
    setHeld([]);
    setStringIndex(0);
    if (next.source !== "line") setTuneAs(next.source);
    commit((current) => ({ ...current, ...next }));
  }

  function retunePedals(recipe: (pedals: PedalState[]) => PedalState[]) {
    commit((current) => ({ ...current, pedals: recipe(current.pedals) }));
  }

  async function takeBuffer(buffer: AudioBuffer, title: string, bpm: number | null) {
    const engine = engineRef.current;
    if (!engine) return;
    if (buffer.duration > 15 * 60) {
      setTrackError("เพลงยาวเกิน 15 นาที ตัดไฟล์ให้สั้นลงก่อนซ้อม");
      return;
    }
    setTrackError("");
    setTrackTitle(title);
    setDuration(buffer.duration);
    setClock(0);
    await engine.resume();
    engine.loadBacking(buffer, true);
    setBackingOn(true);
    if (bpm && bpm >= 40 && bpm <= 240) commit((current) => ({ ...current, bpm: Math.round(bpm) }));
  }

  async function onFile(file: File) {
    const engine = engineRef.current;
    if (!engine) return;
    setTrackError("");
    try {
      await engine.resume();
      const audio = await engine.ctx.decodeAudioData(await file.arrayBuffer());
      await takeBuffer(audio, file.name.replace(/\.[^.]+$/, ""), null);
    } catch {
      setTrackError("อ่านไฟล์นี้ไม่ได้ ลอง wav, mp3 หรือ ogg");
    }
  }

  async function onDemo() {
    const engine = engineRef.current;
    if (!engine) return;
    const demo = renderDemo();
    await engine.resume();
    const buffer = engine.ctx.createBuffer(2, demo.left.length, demo.sampleRate);
    buffer.copyToChannel(demo.left as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(demo.right as Float32Array<ArrayBuffer>, 1);
    await takeBuffer(buffer, demo.title, demo.bpm);
  }

  async function onPull() {
    const pulled = pullStudio();
    if (!pulled) {
      setTrackError("ยังไม่มีเพลงในสตูดิโอ อัปโหลดหรือเปิดตัวอย่างที่แท็บสตูดิโอก่อน");
      return;
    }
    await takeBuffer(pulled.buffer, pulled.title, pulled.bpm);
  }

  function toggleBacking() {
    const engine = engineRef.current;
    if (!engine?.hasBacking()) return;
    if (engine.backingIsPlaying()) engine.pauseBacking();
    else void engine.resume().then(() => engine.playBacking());
  }

  const family = rig.source === "bass" ? "bass" : tuneAs;
  const pitch = describePitch(reading.hz, rig.a4);
  const inTune = pitch != null && Math.abs(pitch.cents) <= 6;
  const strings = stringsFor(rig.source);
  const activeAmp = AMPS.find((amp) => amp.id === rig.amp) ?? AMPS[1];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <section className="max-w-3xl">
        <p className="text-sm font-medium text-brass">ตู้ซ้อม</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">แอมป์ เอฟเฟกต์ และเพลงประกอบ</h1>
        <p className="mt-2 text-sm text-muted">
          เล่นกีตาร์หรือเบสบนจอ หรือเปิดไลน์อินจากเครื่องจริง เรียงก้อนเอฟเฟกต์เอง เลือกตู้หลอด แล้วเปิดเพลงมาซ้อมทับ
          เสียงเกิดในเบราว์เซอร์ ไม่ได้ส่งไฟล์ออกไป
        </p>
      </section>

      <section className="flex flex-wrap gap-2" aria-label="แหล่งเสียง">
        <SourceButton active={rig.source === "guitar"} onClick={() => chooseSource("guitar")} icon={Guitar} label="กีตาร์บนจอ" />
        <SourceButton active={rig.source === "bass"} onClick={() => chooseSource("bass")} icon={Waves} label="เบสบนจอ" />
        <SourceButton active={rig.source === "line"} onClick={() => chooseSource("line")} icon={Mic} label="ไลน์อิน" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted">ตั้งสาย</p>
              <p className={`mt-1 text-5xl font-semibold tabular-nums leading-none ${inTune ? "text-olive" : "text-fg"}`}>
                {pitch ? pitch.name : "–"}
              </p>
              <p className="mt-2 text-sm text-muted">
                {pitch ? `${pitch.octave} · ${pitch.cents > 0 ? "+" : ""}${pitch.cents} เซนต์ · ${reading.hz.toFixed(1)} Hz` : "ดีดสายหรือเปิดไลน์อิน"}
              </p>
            </div>
            <p className="max-w-40 text-right text-sm text-muted">{pitch ? fretHint(pitch.midi, family) : "รอโน้ต"}</p>
          </div>
          <div className="relative mt-4 h-3 rounded-full bg-surface-2">
            <span className="absolute top-0 left-1/2 h-3 w-px bg-line" />
            {pitch ? (
              <span
                className={`absolute top-0 h-3 w-1.5 rounded-full ${inTune ? "bg-olive" : "bg-brass"}`}
                style={{ left: `${((pitch.cents + 50) / 100) * 100}%` }}
              />
            ) : null}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>แบน</span>
            <span>ตรง</span>
            <span>ชาร์ป</span>
          </div>
          <label className="mt-4 flex items-center justify-between gap-3 text-xs text-muted" htmlFor="a4-ref">
            <span>ความถี่ A</span>
            <span className="tabular-nums text-fg">{rig.a4} Hz</span>
          </label>
          <input
            id="a4-ref"
            type="range"
            min={430}
            max={450}
            step={1}
            value={rig.a4}
            onChange={(event) => commit((current) => ({ ...current, a4: Number(event.target.value) }))}
          />
          {rig.source === "line" ? (
            <div className="mt-3 flex gap-2" aria-label="เทียบสาย">
              <button type="button" onClick={() => setTuneAs("guitar")} className={chip(tuneAs === "guitar")}>
                เทียบกีตาร์
              </button>
              <button type="button" onClick={() => setTuneAs("bass")} className={chip(tuneAs === "bass")}>
                เทียบเบส
              </button>
            </div>
          ) : null}
        </article>

        <article className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs font-medium text-muted">เมโทรนอม</p>
          <div className="mt-3 flex items-center gap-2">
            <IconButton label="ช้าลง" onClick={() => commit((current) => ({ ...current, bpm: Math.max(40, current.bpm - 1) }))}>
              <Minus className="size-4" aria-hidden="true" />
            </IconButton>
            <p className="w-16 text-center text-3xl font-semibold tabular-nums">{rig.bpm}</p>
            <IconButton label="เร็วขึ้น" onClick={() => commit((current) => ({ ...current, bpm: Math.min(240, current.bpm + 1) }))}>
              <Plus className="size-4" aria-hidden="true" />
            </IconButton>
            <button
              type="button"
              onClick={() => commit((current) => ({ ...current, click: !current.click }))}
              className={`ml-auto inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold ${rig.click ? "bg-brass text-brass-ink" : "border border-line bg-surface-2"}`}
            >
              <Timer className="size-4" aria-hidden="true" />
              {rig.click ? "ปิดคลิก" : "เปิดคลิก"}
            </button>
          </div>
          <input
            className="mt-3"
            type="range"
            min={40}
            max={220}
            step={1}
            aria-label="ความเร็วเมโทรนอม"
            value={rig.bpm}
            onChange={(event) => commit((current) => ({ ...current, bpm: Number(event.target.value) }))}
          />
          <div className="mt-3 flex gap-2" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <span key={index} className={`h-3 w-3 rounded-full ${rig.click && beat === index ? "bg-brass" : "bg-line"}`} />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">คลิกอยู่ในเครื่องคุณ ไม่เดินตามเพลงประกอบ เปิดคู่กันได้</p>
        </article>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">เพลงประกอบ</h2>
          <p className="text-sm text-muted">{trackTitle || "ยังไม่ได้เปิดเพลง"}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className={solidBtn}>
            <Upload className="size-4" aria-hidden="true" />
            นำเพลงมาซ้อม
          </button>
          <button type="button" onClick={() => void onPull()} className={ghostBtn}>
            ใช้เพลงจากสตูดิโอ
          </button>
          <button type="button" onClick={() => void onDemo()} className={ghostBtn}>
            เพลงตัวอย่าง
          </button>
          <button type="button" onClick={toggleBacking} disabled={!duration} className={ghostBtn}>
            {backingOn ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {backingOn ? "พักเพลง" : "เล่นเพลง"}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !loop;
              setLoop(next);
              engineRef.current?.setBackingLoop(next);
            }}
            className={chip(loop)}
          >
            วนเพลง
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-xs tabular-nums text-muted">
            {formatClock(clock)} / {formatClock(duration)}
          </span>
          <input
            className="min-w-0 flex-1"
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            disabled={!duration}
            aria-label="ตำแหน่งเพลง"
            value={Math.min(clock, duration || 0)}
            onChange={(event) => {
              const next = Number(event.target.value);
              setClock(next);
              engineRef.current?.seekBacking(next);
            }}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="ดังเพลง" value={`${Math.round(songLevel * 100)}`} id="song-level">
            <input
              id="song-level"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={songLevel}
              onChange={(event) => {
                const value = Number(event.target.value);
                setSongLevel(value);
                engineRef.current?.setBackingLevel(value);
              }}
            />
          </Field>
          <div>
            <p className="text-xs text-muted">ความเร็วเพลง</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[0.75, 1, 1.25].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRate(value);
                    engineRef.current?.setBackingRate(value);
                  }}
                  className={chip(rate === value)}
                >
                  {value === 1 ? "ปกติ" : `${value.toFixed(2)}×`}
                </button>
              ))}
            </div>
          </div>
        </div>
        {trackError ? (
          <p role="alert" className="mt-3 text-sm text-brass">
            {trackError}
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted">สเปซบาร์เล่นหรือพักเพลงประกอบ เพลงไม่ผ่านตู้แอมป์ เพื่อให้ได้ยินแบ็กกิ้งชัด</p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onFile(file);
          }}
        />
      </section>

      {rig.source === "line" ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">อินพุตกีตาร์หรือเบส</h2>
            <button type="button" onClick={() => void toggleLive()} className={liveOn ? solidBtn : ghostBtn}>
              <Mic className="size-4" aria-hidden="true" />
              {liveOn ? "ปิดไลน์อิน" : "เปิดไลน์อิน"}
            </button>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full bg-olive" style={{ width: `${Math.round(reading.rms * 100)}%` }} />
          </div>
          <p className="mt-3 text-sm text-muted">เสียบอินเทอร์เฟซหรือไมค์หน้าตู้ ปิดการตัดเสียงสะท้อนของระบบแล้ว ใส่หูฟังก่อนเปิดเสียงดัง</p>
          {liveError ? (
            <p role="alert" className="mt-2 text-sm text-brass">
              {liveError}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{rig.source === "bass" ? "ฟิงเกอร์บอร์ดเบส" : "ฟิงเกอร์บอร์ดกีตาร์"}</h2>
            <div className="ml-auto flex items-center gap-2">
              <IconButton
                label="ลดคาโป"
                onClick={() => commit((current) => ({ ...current, capo: Math.max(0, current.capo - 1) }))}
              >
                <Minus className="size-4" aria-hidden="true" />
              </IconButton>
              <p className="min-w-16 text-center text-sm font-semibold tabular-nums">คาโป {rig.capo}</p>
              <IconButton
                label="เพิ่มคาโป"
                onClick={() => commit((current) => ({ ...current, capo: Math.min(7, current.capo + 1) }))}
              >
                <Plus className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">แตะเฟรตเพื่อฟังผ่านตู้ แถวบนของคีย์บอร์ดคือเฟรต ปุ่ม 1 ถึง {strings.length} เลือกสาย</p>
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-max">
              <div className="flex gap-1">
                <span className="sticky left-0 w-12 shrink-0 bg-surface" />
                {FRETS.map((fret) => (
                  <span key={fret} className="flex w-12 shrink-0 flex-col items-center text-xs text-muted">
                    {fret}
                    {DOTS.has(fret) ? <span className="mt-1 h-1.5 w-1.5 rounded-full bg-olive" /> : <span className="mt-1 h-1.5 w-1.5" />}
                  </span>
                ))}
              </div>
              {strings.map((string, index) => (
                <div key={string.name + string.midi} className="mt-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setStringIndex(index)}
                    className={`sticky left-0 z-10 h-12 w-12 shrink-0 rounded-md text-sm font-semibold ${stringIndex === index ? "bg-brass text-brass-ink" : "bg-surface text-muted"}`}
                  >
                    {string.name}
                  </button>
                  {FRETS.map((fret) => {
                    const note = string.midi + rig.capo + fret;
                    const on = held.includes(note);
                    return (
                      <button
                        key={fret}
                        type="button"
                        aria-label={`สาย ${string.name} เฟรต ${fret}`}
                        aria-pressed={on}
                        onPointerDown={(event) => pointerDown(event.pointerId, note)}
                        className={`h-12 w-12 shrink-0 rounded-md border text-xs font-medium ${on ? "border-brass bg-brass text-brass-ink" : "border-line bg-surface-2"}`}
                      >
                        {fret === 0 ? "เปิด" : fret}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">เอฟเฟกต์ก้อน</h2>
            <p className="text-sm text-muted">เรียงจากซ้ายเข้าตู้ เปิดปิดและหมุนได้ทีละก้อน สูงสุด {MAX_PEDALS} ก้อน</p>
          </div>
          <button type="button" onClick={() => retunePedals(() => [])} className={ghostBtn}>
            ล้างก้อน
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PEDALS.map((pedal) => (
            <button
              key={pedal.kind}
              type="button"
              disabled={rig.pedals.length >= MAX_PEDALS}
              onClick={() => retunePedals((list) => [...list, makePedal(pedal.kind)])}
              className={ghostBtn}
            >
              <Plus className="size-4" aria-hidden="true" />
              {pedal.name}
            </button>
          ))}
        </div>
        {rig.pedals.length === 0 ? <p className="mt-4 text-sm text-muted">บอร์ดว่าง เสียงเข้าตู้ตรง ๆ</p> : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {rig.pedals.map((pedal, index) => (
            <PedalCard
              key={pedal.id}
              pedal={pedal}
              index={index}
              total={rig.pedals.length}
              onToggle={() =>
                retunePedals((list) => list.map((item) => (item.id === pedal.id ? { ...item, on: !item.on } : item)))
              }
              onParam={(key, value) =>
                retunePedals((list) =>
                  list.map((item) =>
                    item.id === pedal.id ? { ...item, params: { ...item.params, [key]: value } } : item,
                  ),
                )
              }
              onMove={(dir) =>
                retunePedals((list) => {
                  const from = list.findIndex((item) => item.id === pedal.id);
                  const to = from + dir;
                  if (from < 0 || to < 0 || to >= list.length) return list;
                  const next = list.slice();
                  const [item] = next.splice(from, 1);
                  next.splice(to, 0, item);
                  return next;
                })
              }
              onRemove={() => retunePedals((list) => list.filter((item) => item.id !== pedal.id))}
            />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">ตู้แอมป์</h2>
        <p className="mt-1 text-sm text-muted">รุ่นหลอดใช้เส้นอิ่มแบบอสมมาตรและแซก รุ่นโซลิดสะอาดกว่า ทั้งหมดเป็นวงจรในเบราว์เซอร์</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {RIG_PRESETS.map((preset) => (
            <button key={preset.id} type="button" onClick={() => usePreset(preset.id)} className={ghostBtn}>
              {preset.name}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <AmpGroup title="กีตาร์" family="guitar" active={rig.amp} onPick={(id) => commit((current) => ({ ...current, amp: id }))} />
          <AmpGroup title="เบส" family="bass" active={rig.amp} onPick={(id) => commit((current) => ({ ...current, amp: id }))} />
        </div>
        <p className="mt-4 text-sm">
          <span className="font-semibold">{activeAmp.name}</span>
          {activeAmp.tube ? <span className="ml-2 rounded-md bg-olive px-2 py-1 text-xs font-semibold text-brass-ink">หลอด</span> : <span className="ml-2 text-xs text-muted">โซลิด</span>}
          <span className="mt-1 block text-muted">{activeAmp.blurb}</span>
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AMP_KNOBS.map((knob) => (
            <Field key={knob.key} id={`amp-${knob.key}`} label={knob.label} value={`${Math.round(rig.knobs[knob.key] * 100)}`}>
              <input
                id={`amp-${knob.key}`}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={rig.knobs[knob.key]}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  commit((current) => ({ ...current, knobs: { ...current.knobs, [knob.key]: value } }));
                }}
              />
            </Field>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">แอมเบียนหลังตู้</h2>
        <p className="mt-1 text-sm text-muted">ห้อง โถง สปริง หรือเพลท ผสมหลังลำโพงจำลอง ไม่ได้อยู่ในก้อน</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ROOMS.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => commit((current) => ({ ...current, ambience: { ...current.ambience, kind: room.id } }))}
              className={chip(rig.ambience.kind === room.id)}
            >
              {room.name}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <AmbienceKnob
            label="หาง"
            value={rig.ambience.decay}
            text={`${Math.round(rig.ambience.decay * 100)}`}
            onChange={(decay) => commit((current) => ({ ...current, ambience: { ...current.ambience, decay } }))}
          />
          <AmbienceKnob
            label="มิกซ์"
            value={rig.ambience.mix}
            text={`${Math.round(rig.ambience.mix * 100)}`}
            onChange={(mix) => commit((current) => ({ ...current, ambience: { ...current.ambience, mix } }))}
          />
          <AmbienceKnob
            label="โทน"
            value={rig.ambience.tone}
            text={`${Math.round(rig.ambience.tone * 100)}`}
            onChange={(tone) => commit((current) => ({ ...current, ambience: { ...current.ambience, tone } }))}
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2">
        <Field label="อินพุตเข้าบอร์ด" value={`${Math.round(rig.input * 100)}`} id="rig-input">
          <input
            id="rig-input"
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={rig.input}
            onChange={(event) => commit((current) => ({ ...current, input: Number(event.target.value) }))}
          />
        </Field>
        <Field label="ความดังหลัก" value={`${Math.round(rig.master * 100)}`} id="rig-master">
          <input
            id="rig-master"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={rig.master}
            onChange={(event) => commit((current) => ({ ...current, master: Number(event.target.value) }))}
          />
        </Field>
      </section>
      <p className="text-xs text-muted">
        จำลองด้วยเวฟเชปเปอร์ ฟิลเตอร์ และคอนโวลฟ์ในเบราว์เซอร์ ไม่ได้โหลดโมเดลหลอดจากโรงงาน ได้คาแรกเตอร์พอซ้อมและลองโทน
        ถ้าเปิดไลน์อินให้ใส่หูฟัง
      </p>
    </main>
  );
}

const solidBtn = "inline-flex h-11 items-center gap-2 rounded-md bg-brass px-3 text-sm font-semibold text-brass-ink";
const ghostBtn = "inline-flex h-11 items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-sm font-medium";

function chip(active: boolean): string {
  return `inline-flex h-11 items-center rounded-md px-3 text-sm font-medium ${active ? "bg-brass text-brass-ink" : "border border-line bg-surface-2"}`;
}

function SourceButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Guitar;
  label: string;
}) {
  return (
    <button type="button" onClick={onClick} className={chip(active)}>
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface-2"
    >
      {children}
    </button>
  );
}

function Field({ id, label, value, children }: { id: string; label: string; value: string; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs text-muted">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="tabular-nums text-fg">{value}</span>
      </span>
      {children}
    </label>
  );
}

function AmbienceKnob({
  label,
  value,
  text,
  onChange,
}: {
  label: string;
  value: number;
  text: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <Field id={id} label={label} value={text}>
      <input id={id} type="range" min={0} max={1} step={0.01} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </Field>
  );
}

function AmpGroup({
  title,
  family,
  active,
  onPick,
}: {
  title: string;
  family: "guitar" | "bass";
  active: AmpId;
  onPick: (id: AmpId) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{title}</p>
      <div className="mt-2 flex flex-col gap-2">
        {AMPS.filter((amp) => amp.family === family).map((amp) => (
          <button
            key={amp.id}
            type="button"
            onClick={() => onPick(amp.id)}
            className={`rounded-md border px-3 py-2 text-left ${active === amp.id ? "border-brass bg-surface-2" : "border-line"}`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              {amp.name}
              {amp.tube ? <span className="rounded-md bg-olive px-1.5 py-0.5 text-xs text-brass-ink">หลอด</span> : null}
            </span>
            <span className="mt-1 block text-xs text-muted">{amp.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PedalCard({
  pedal,
  index,
  total,
  onToggle,
  onParam,
  onMove,
  onRemove,
}: {
  pedal: PedalState;
  index: number;
  total: number;
  onToggle: () => void;
  onParam: (key: string, value: number) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const meta = pedalMeta(pedal.kind);
  return (
    <article className={`rounded-lg border p-3 ${pedal.on ? "border-brass bg-surface-2" : "border-line bg-bg"}`}>
      <div className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={pedal.on}
          className={`h-11 shrink-0 rounded-md px-3 text-sm font-semibold ${pedal.on ? "bg-brass text-brass-ink" : "border border-line bg-surface"}`}
        >
          {pedal.on ? "เปิด" : "ปิด"}
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {index + 1}. {meta.name}
          </h3>
          <p className="text-xs text-muted">{meta.blurb}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconButton label="เลื่อนไปก่อนหน้า" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label="เลื่อนไปถัดไป" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronDown className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={`เอา ${meta.name} ออก`} onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {meta.knobs.map((knob) => {
          const id = `${pedal.id}-${knob.key}`;
          const value = pedal.params[knob.key] ?? knob.def;
          return (
            <Field key={knob.key} id={id} label={knob.label} value={formatKnob(knob, value)}>
              <input
                id={id}
                type="range"
                min={knob.min}
                max={knob.max}
                step={(knob.max - knob.min) / 100}
                value={value}
                onChange={(event) => onParam(knob.key, Number(event.target.value))}
              />
            </Field>
          );
        })}
      </div>
    </article>
  );
}
