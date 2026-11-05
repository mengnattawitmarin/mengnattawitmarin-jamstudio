import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AudioWaveform,
  ChevronLeft,
  ChevronRight,
  Guitar,
  Headphones,
  Mic,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Speaker,
  Timer,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { Knob } from "@/components/ui/knob";
import { useSettings } from "@/lib/settings";
import { PENDING_PRESET_KEY } from "@/components/studio/home";
import { renderDemo } from "@/lib/audio/demo-track";
import { formatClock } from "@/lib/audio/theory";
import {
  AMP_KNOBS,
  AMPS,
  CABS,
  MICS,
  PEDAL_COLORS,
  canPickOutput,
  listAudioDevices,
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
  type CabId,
  type MicId,
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

export function RigRoom({ pullStudio, active = true }: { pullStudio: () => Pull | null; active?: boolean }) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const engineRef = useRef<RigEngine | null>(null);
  const rigRef = useRef<RigSnapshot>(DEFAULT_RIG);
  const fileRef = useRef<HTMLInputElement>(null);
  const pointers = useRef<Map<number, number>>(new Map());
  const holds = useRef<Map<number, number>>(new Map());
  const stringRef = useRef(0);
  const sourceRef = useRef<SourceId>(DEFAULT_RIG.source);

  const [rig, setRig] = useState<RigSnapshot>(DEFAULT_RIG);
  const [reading, setReading] = useState<TunerReading>({ hz: 0, rms: 0, peak: 0, clip: false });
  const settings = useSettings();
  const [view, setView] = useState<"rig" | "amps" | "fx" | "ir" | "io">("rig");
  const [focusPedal, setFocusPedal] = useState<string | null>(null);
  const [howl, setHowl] = useState(false);
  const [irName, setIrName] = useState("");
  const [latency, setLatency] = useState(0);
  const [devices, setDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);
  const irRef = useRef<HTMLInputElement>(null);
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
    if (prev.cab !== next.cab || prev.mic !== next.mic || prev.air !== next.air) engine.setCab(next.cab, next.mic, next.air);
  }

  function commit(recipe: (current: RigSnapshot) => RigSnapshot) {
    const prev = rigRef.current;
    const next = recipe(prev);
    rigRef.current = next;
    setRig(next);
    pushAudio(prev, next);
  }

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem("lane-rig");
    } catch {
      raw = null;
    }
    const saved = readSnapshot(raw);
    const initial = rigRef.current === DEFAULT_RIG ? saved : rigRef.current;
    rigRef.current = initial;
    sourceRef.current = initial.source;
    setRig(initial);
    if (initial.source === "bass") setTuneAs("bass");
    const prefs = useSettings.getState();
    const engine = new RigEngine({ latency: prefs.latency });
    engineRef.current = engine;
    engine.setCab(initial.cab, initial.mic, initial.air);
    engine.setInputTrim(prefs.inputTrimDb);
    if (prefs.outputDeviceId !== "default") void engine.setOutputDevice(prefs.outputDeviceId);
    engine.howlGuard = prefs.howlGuard;
    engine.onFeedback = (muted) => setHowl(muted);
    setLatency(engine.latencyMs());
    setUserPresets(readUserPresets());
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
        if (Math.abs(prev.hz - next.hz) < 0.35 && Math.abs(prev.rms - next.rms) < 0.03 && Math.abs(prev.peak - next.peak) < 0.03 && prev.clip === next.clip) return prev;
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
      if (event.code !== "Space" || !activeRef.current) return;
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
    try {
      localStorage.setItem("lane-rig", JSON.stringify(rig));
    } catch {
      // storage full / private mode
    }
  }, [rig]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat || !activeRef.current) return;
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
      const prefs = useSettings.getState();
      await engine.openLive({ deviceId: prefs.inputDeviceId, channel: prefs.inputChannel });
      setLiveOn(true);
      setLatency(engine.latencyMs());
      void listAudioDevices().then(setDevices);
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


  // ── extra actions for the new UI ─────────────────────────────────────────
  async function onIrFile(file: File) {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      await engine.resume();
      const buffer = await engine.ctx.decodeAudioData(await file.arrayBuffer());
      if (buffer.duration > 3) {
        setTrackError("ไฟล์ IR ยาวเกินไป (ควรสั้นกว่า 1 วินาที)");
        return;
      }
      engine.setUserIr(buffer);
      setIrName(file.name);
      commit((current) => ({ ...current, cab: "ir" }));
    } catch {
      setTrackError("อ่านไฟล์ IR ไม่ได้ ใช้ไฟล์ .wav");
    }
  }

  function saveUserPreset() {
    const name = window.prompt("ตั้งชื่อพรีเซ็ต", `พรีเซ็ตของฉัน ${userPresets.length + 1}`)?.trim();
    if (!name) return;
    const snapshot = { ...rigRef.current, cab: rigRef.current.cab === "ir" ? "auto" : rigRef.current.cab } as RigSnapshot;
    const next = [...userPresets.filter((item) => item.name !== name), { id: `u-${Date.now()}`, name: name.slice(0, 40), rig: snapshot }];
    setUserPresets(next);
    writeUserPresets(next);
  }

  function loadUserPreset(id: string) {
    const preset = userPresets.find((item) => item.id === id);
    if (!preset) return;
    const next = readSnapshot(JSON.stringify(preset.rig));
    engineRef.current?.releaseAll();
    holds.current.clear();
    setHeld([]);
    commit((current) => ({ ...next, bpm: current.bpm, click: current.click }));
  }

  function deleteUserPreset(id: string) {
    const next = userPresets.filter((item) => item.id !== id);
    setUserPresets(next);
    writeUserPresets(next);
  }

  function resetRig() {
    engineRef.current?.releaseAll();
    commit((current) => ({ ...structuredClone(DEFAULT_RIG), source: current.source, bpm: current.bpm }));
  }

  async function refreshDevices() {
    try {
      setDevices(await listAudioDevices());
    } catch {
      setDevices({ inputs: [], outputs: [] });
    }
  }

  useEffect(() => {
    if (view === "io") void refreshDevices();
  }, [view]);

  // A preset picked on the Home screen ("Legend Tones") is applied on arrival.
  useEffect(() => {
    if (!active) return;
    let pending: string | null = null;
    try {
      pending = localStorage.getItem(PENDING_PRESET_KEY);
      if (pending) localStorage.removeItem(PENDING_PRESET_KEY);
    } catch {
      pending = null;
    }
    if (pending && engineRef.current) {
      usePreset(pending);
      setView("rig");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const pitch = describePitch(reading.hz, rig.a4);
  const inTune = pitch != null && Math.abs(pitch.cents) <= 6;
  const family = rig.source === "bass" ? "bass" : tuneAs;
  const strings = stringsFor(rig.source);
  const activeAmp = AMPS.find((amp) => amp.id === rig.amp) ?? AMPS[1];
  const focused = rig.pedals.find((pedal) => pedal.id === focusPedal) ?? null;
  const artistPresets = RIG_PRESETS.filter((preset) => preset.group === "artist");
  const basicPresets = RIG_PRESETS.filter((preset) => preset.group !== "artist");
  const famCabs = CABS.filter((cab) => cab.family === "any" || cab.family === (activeAmp.family === "bass" ? "bass" : "guitar"));

  const RAIL: { id: typeof view; label: string; icon: typeof Guitar }[] = [
    { id: "rig", label: "แอมป์ & เอฟเฟค", icon: SlidersHorizontal },
    { id: "amps", label: "ตู้แอมป์", icon: Speaker },
    { id: "fx", label: "เอฟเฟค", icon: Zap },
    { id: "ir", label: "IR Loader", icon: AudioWaveform },
    { id: "io", label: "ตั้งค่าเสียง", icon: Headphones },
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:px-4">
      {howl ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger bg-danger/15 p-3 text-sm">
          <span className="font-semibold">ตรวจพบเสียงหอน (ฟีดแบ็ก) — ปิดเสียงออกให้แล้ว</span>
          <span className="text-muted">ใส่หูฟัง หรือลดอินพุต/ความดัง แล้วกดเปิดเสียงอีกครั้ง</span>
          <button type="button" onClick={() => engineRef.current?.rearmFeedback()} className={`${solidBtn} ml-auto`}>
            เปิดเสียงอีกครั้ง
          </button>
        </div>
      ) : null}

      {/* Top bar: source tabs + presets */}
      <section className="panel flex flex-wrap items-center gap-2 p-2">
        <div className="flex rounded-lg bg-bg p-1" role="tablist" aria-label="แหล่งเสียง">
          <SourceTab active={rig.source === "guitar"} onClick={() => chooseSource("guitar")} label="Guitar" />
          <SourceTab active={rig.source === "bass"} onClick={() => chooseSource("bass")} label="Bass" />
          <SourceTab active={rig.source === "line"} onClick={() => chooseSource("line")} label="ไลน์อิน" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="preset-pick">
            พรีเซ็ต
          </label>
          <select
            id="preset-pick"
            className="h-10 max-w-[15rem] rounded-md border border-line bg-surface-2 px-2 text-sm"
            value=""
            onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith("u-")) loadUserPreset(value);
              else if (value) usePreset(value);
            }}
          >
            <option value="">พรีเซ็ตของฉัน / โทนศิลปิน…</option>
            <optgroup label="โทนแบบศิลปิน">
              {artistPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="พื้นฐาน">
              {basicPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
            {userPresets.length ? (
              <optgroup label="ที่ฉันบันทึก">
                {userPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <button type="button" onClick={saveUserPreset} className={ghostBtn}>
            <Save className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">บันทึกพรีเซ็ต</span>
          </button>
          <button type="button" onClick={resetRig} className={ghostBtn} aria-label="รีเซ็ต">
            <RotateCcw className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">รีเซ็ต</span>
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)_15rem]">
        {/* Left rail */}
        <nav className="panel flex gap-1 overflow-x-auto p-2 scrollbar-none lg:flex-col" aria-label="เมนูแอมป์">
          {RAIL.map((item) => {
            const Icon = item.icon;
            const on = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-current={on}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium ${on ? "bg-brass/20 text-fg ring-1 ring-brass" : "text-muted hover:bg-surface-2"}`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Centre */}
        <div className="flex min-w-0 flex-col gap-4">
          {view === "rig" ? (
            <>
              <section className="panel p-3">
                <div className="flex items-end gap-2 overflow-x-auto pb-2 scrollbar-none" aria-label="บอร์ดเอฟเฟกต์">
                  <TunerStomp hz={reading.hz} pitchName={pitch?.name ?? ""} inTune={inTune} />
                  {rig.pedals.map((pedal) => (
                    <Stomp
                      key={pedal.id}
                      pedal={pedal}
                      focused={focusPedal === pedal.id}
                      onFocus={() => setFocusPedal(focusPedal === pedal.id ? null : pedal.id)}
                      onToggle={() =>
                        retunePedals((list) => list.map((item) => (item.id === pedal.id ? { ...item, on: !item.on } : item)))
                      }
                    />
                  ))}
                  {rig.pedals.length < MAX_PEDALS ? (
                    <button
                      type="button"
                      onClick={() => setView("fx")}
                      className="grid h-[118px] w-[74px] shrink-0 place-items-center rounded-lg border-2 border-dashed border-line text-muted"
                      aria-label="เพิ่มเอฟเฟกต์"
                    >
                      <Plus className="size-6" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                {focused ? (
                  <PedalEditor
                    pedal={focused}
                    index={rig.pedals.findIndex((item) => item.id === focused.id)}
                    total={rig.pedals.length}
                    onParam={(key, value) =>
                      retunePedals((list) =>
                        list.map((item) => (item.id === focused.id ? { ...item, params: { ...item.params, [key]: value } } : item)),
                      )
                    }
                    onToggle={() =>
                      retunePedals((list) => list.map((item) => (item.id === focused.id ? { ...item, on: !item.on } : item)))
                    }
                    onMove={(dir) =>
                      retunePedals((list) => {
                        const from = list.findIndex((item) => item.id === focused.id);
                        const to = from + dir;
                        if (from < 0 || to < 0 || to >= list.length) return list;
                        const next = list.slice();
                        const [item] = next.splice(from, 1);
                        next.splice(to, 0, item);
                        return next;
                      })
                    }
                    onRemove={() => {
                      retunePedals((list) => list.filter((item) => item.id !== focused.id));
                      setFocusPedal(null);
                    }}
                  />
                ) : (
                  <p className="px-1 text-xs text-muted">แตะตัวก้อนเพื่อปรับลูกบิด · แตะสวิตช์ด้านล่างเพื่อเปิด/ปิด · สัญญาณไหลจากซ้ายเข้าแอมป์</p>
                )}
              </section>

              <section className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <AmpHead
                  name={activeAmp.name}
                  tube={activeAmp.tube}
                  knobs={rig.knobs}
                  onKnob={(key, value) => commit((current) => ({ ...current, knobs: { ...current.knobs, [key]: value } }))}
                  onPower={() => engineRef.current?.rearmFeedback()}
                />
                <Cabinet label={rig.cab === "ir" ? irName || "IR" : (CABS.find((cab) => cab.id === rig.cab)?.name ?? "")} />
              </section>

              <section className="panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">ห้องและเสียงสะท้อน</h2>
                  <div className="ml-auto flex flex-wrap gap-1">
                    {ROOMS.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => commit((current) => ({ ...current, ambience: { ...current.ambience, kind: room.id } }))}
                        className={chipSm(rig.ambience.kind === room.id)}
                      >
                        {room.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap justify-around gap-4">
                  <Knob label="หาง" value={rig.ambience.decay} display={pct(rig.ambience.decay)} onChange={(decay) => commit((c) => ({ ...c, ambience: { ...c.ambience, decay } }))} />
                  <Knob label="มิกซ์" value={rig.ambience.mix} display={pct(rig.ambience.mix)} onChange={(mix) => commit((c) => ({ ...c, ambience: { ...c.ambience, mix } }))} />
                  <Knob label="โทน" value={rig.ambience.tone} display={pct(rig.ambience.tone)} onChange={(tone) => commit((c) => ({ ...c, ambience: { ...c.ambience, tone } }))} />
                  <Knob label="อินพุต" value={rig.input} max={1.5} display={pct(rig.input)} onChange={(input) => commit((c) => ({ ...c, input }))} />
                  <Knob label="วอลุ่มรวม" value={rig.master} display={pct(rig.master)} onChange={(master) => commit((c) => ({ ...c, master }))} />
                </div>
              </section>
            </>
          ) : null}

          {view === "amps" ? (
            <section className="panel p-4">
              <h2 className="text-lg font-semibold">เลือกหัวแอมป์</h2>
              <p className="mt-1 text-sm text-muted">หลอดใช้เส้นอิ่มอสมมาตร + แซกไฟเลี้ยง · โซลิดสเตตแตกช้ากว่าและคลีนกว่า</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <AmpGroup title="กีตาร์" family="guitar" active={rig.amp} onPick={(id) => commit((current) => ({ ...current, amp: id }))} />
                <AmpGroup title="เบส" family="bass" active={rig.amp} onPick={(id) => commit((current) => ({ ...current, amp: id }))} />
              </div>
              <h3 className="mt-6 text-sm font-semibold">โทนแบบศิลปิน</h3>
              <p className="mt-1 text-xs text-muted">ค่าตั้งต้นที่ประกอบจากอุปกรณ์ที่ศิลปินใช้จริงตามบันทึกสาธารณะ ไม่ได้เกี่ยวข้องหรือรับรองโดยศิลปิน ปรับต่อตามกีตาร์และปิกอัปของคุณ</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {artistPresets.map((preset) => (
                  <button key={preset.id} type="button" onClick={() => usePreset(preset.id)} className="rounded-md border border-line bg-surface-2 p-3 text-left hover:border-brass">
                    <span className="block text-sm font-semibold">{preset.name}</span>
                    <span className="mt-1 block text-xs text-muted">{preset.blurb}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {view === "fx" ? (
            <section className="panel p-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">เพิ่มเอฟเฟกต์</h2>
                  <p className="text-sm text-muted">
                    บอร์ดใช้ได้สูงสุด {MAX_PEDALS} ก้อน ({rig.pedals.length}/{MAX_PEDALS})
                  </p>
                </div>
                <button type="button" onClick={() => retunePedals(() => [])} className={ghostBtn}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  ล้างบอร์ด
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {PEDALS.map((pedal) => (
                  <button
                    key={pedal.kind}
                    type="button"
                    disabled={rig.pedals.length >= MAX_PEDALS}
                    onClick={() => {
                      const made = makePedal(pedal.kind, true);
                      retunePedals((list) => [...list, made]);
                      setFocusPedal(made.id);
                      setView("rig");
                    }}
                    className="flex items-start gap-2 rounded-md border border-line bg-surface-2 p-2 text-left hover:border-brass"
                  >
                    <span className="mt-0.5 h-8 w-6 shrink-0 rounded" style={{ background: PEDAL_COLORS[pedal.kind] }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{pedal.name}</span>
                      <span className="block text-xs text-muted">{pedal.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {view === "ir" ? (
            <section className="panel p-4">
              <h2 className="text-lg font-semibold">IR Loader — ตู้ลำโพงจากไฟล์</h2>
              <p className="mt-1 text-sm text-muted">
                โหลดไฟล์ Impulse Response (.wav) ของตู้ลำโพงที่อัดจากของจริง ระบบจะใช้แทนตู้จำลอง ไฟล์อยู่ในเครื่องคุณเท่านั้น
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => irRef.current?.click()} className={solidBtn}>
                  <Upload className="size-4" aria-hidden="true" />
                  เลือกไฟล์ IR
                </button>
                {irName ? (
                  <button
                    type="button"
                    onClick={() => {
                      engineRef.current?.setUserIr(null);
                      setIrName("");
                      commit((current) => ({ ...current, cab: "auto" }));
                    }}
                    className={ghostBtn}
                  >
                    เลิกใช้ IR
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-sm">{irName ? `กำลังใช้: ${irName}` : "ยังไม่ได้โหลด — ใช้ตู้จำลองอยู่"}</p>
              <p className="mt-2 text-xs text-muted">IR ไม่ถูกจำข้ามการเปิดแอป ต้องโหลดใหม่ทุกครั้ง</p>
              <input
                ref={irRef}
                type="file"
                accept=".wav,audio/wav,audio/x-wav"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void onIrFile(file);
                }}
              />
            </section>
          ) : null}

          {view === "io" ? (
            <section className="panel flex flex-col gap-4 p-4">
              <div>
                <h2 className="text-lg font-semibold">อินพุต / เอาต์พุต</h2>
                <p className="mt-1 text-sm text-muted">
                  เสียบกีตาร์ผ่านออดิโออินเทอร์เฟซหรืออะแดปเตอร์ (เช่น iRig) แล้วใส่หูฟัง · ห้ามใช้หูฟังบลูทูธถ้าต้องการดีเลย์ต่ำ
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="อุปกรณ์อินพุต"
                  value={settings.inputDeviceId}
                  onChange={(value) => settings.set({ inputDeviceId: value })}
                  options={[{ value: "default", label: "ค่าเริ่มต้นของระบบ" }, ...devices.inputs.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => ({ value: d.deviceId, label: d.label || `อินพุต ${i + 1}` }))]}
                />
                <SelectField
                  label="ช่องอินพุต"
                  value={settings.inputChannel}
                  onChange={(value) => settings.set({ inputChannel: value as typeof settings.inputChannel })}
                  options={[
                    { value: "mix", label: "รวม (โมโน)" },
                    { value: "left", label: "ช่อง 1 / ซ้าย" },
                    { value: "right", label: "ช่อง 2 / ขวา" },
                  ]}
                />
                <SelectField
                  label={canPickOutput() ? "อุปกรณ์เอาต์พุต" : "อุปกรณ์เอาต์พุต (เลือกในระบบเครื่อง)"}
                  value={settings.outputDeviceId}
                  disabled={!canPickOutput()}
                  onChange={(value) => {
                    settings.set({ outputDeviceId: value });
                    void engineRef.current?.setOutputDevice(value);
                  }}
                  options={[{ value: "default", label: "ค่าเริ่มต้นของระบบ" }, ...devices.outputs.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => ({ value: d.deviceId, label: d.label || `เอาต์พุต ${i + 1}` }))]}
                />
                <SelectField
                  label="โหมดดีเลย์ (มีผลเมื่อเปิดหน้านี้ใหม่)"
                  value={settings.latency}
                  onChange={(value) => settings.set({ latency: value as typeof settings.latency })}
                  options={[
                    { value: "interactive", label: "ต่ำสุด — สายตรง/อินเทอร์เฟซ" },
                    { value: "balanced", label: "สมดุล — เครื่องช้า/เสียงแตกกระตุก" },
                  ]}
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>ระดับอินพุต {reading.clip ? <b className="text-danger">· สัญญาณแตก! ลดเกนที่อินเทอร์เฟซ</b> : null}</span>
                  <span className="tabular-nums">{reading.peak > 0 ? `${(20 * Math.log10(reading.peak)).toFixed(1)} dBFS` : "—"}</span>
                </div>
                <div className="mt-1 h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                  <div
                    className={`h-full transition-[width] duration-75 ${reading.clip ? "bg-danger" : reading.peak > 0.7 ? "bg-amber" : "bg-olive"}`}
                    style={{ width: `${Math.round(Math.min(1, reading.peak) * 100)}%` }}
                  />
                </div>
                <label className="mt-3 flex items-center gap-3 text-sm">
                  <span className="w-28 text-muted">ทริมอินพุต</span>
                  <input
                    type="range"
                    min={-24}
                    max={24}
                    step={1}
                    value={settings.inputTrimDb}
                    className="flex-1"
                    onChange={(event) => {
                      const db = Number(event.target.value);
                      settings.set({ inputTrimDb: db });
                      engineRef.current?.setInputTrim(db);
                    }}
                  />
                  <span className="w-14 text-right tabular-nums">{settings.inputTrimDb > 0 ? "+" : ""}{settings.inputTrimDb} dB</span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void toggleLive()} className={liveOn ? solidBtn : ghostBtn}>
                  <Mic className="size-4" aria-hidden="true" />
                  {liveOn ? "ปิดไลน์อิน" : "เปิดไลน์อิน (ใช้ค่าที่เลือก)"}
                </button>
                <button type="button" onClick={() => void refreshDevices()} className={ghostBtn}>
                  ค้นหาอุปกรณ์ใหม่
                </button>
                <span className="text-sm text-muted">ดีเลย์ประมาณ {latency} ms</span>
              </div>
              {liveError ? (
                <p role="alert" className="text-sm text-danger">
                  {liveError}
                </p>
              ) : null}
              <p className="text-xs text-muted">
                เปิดไลน์อินแล้วเปลี่ยนอุปกรณ์ ให้ปิดและเปิดใหม่ · ปิดตัวลดเสียงรบกวน/ตัดเสียงสะท้อนของระบบอัตโนมัติแล้ว เพื่อไม่ให้เสียงกีตาร์ถูกบีบ · ตัวกันเสียงหอนจะตัดเสียงเมื่อพบเสียงค้างดังผิดปกติ
              </p>
            </section>
          ) : null}
        </div>

        {/* Right: cabinet / mic */}
        <aside className="panel flex flex-col gap-4 p-4">
          <SelectField
            label="Cabinet / IR"
            value={rig.cab}
            onChange={(value) => {
              if (value === "ir" && !engineRef.current?.hasUserIr()) {
                setView("ir");
                return;
              }
              commit((current) => ({ ...current, cab: value as CabId }));
            }}
            options={famCabs.map((cab) => ({ value: cab.id, label: cab.name }))}
          />
          <div className="amp-grille mx-auto grid h-24 w-24 place-items-center rounded-md border-4 border-[#222]">
            <span className="rounded bg-black/60 px-1 font-mono text-[10px] text-white/80">{rig.cab === "auto" ? "AUTO" : rig.cab.toUpperCase()}</span>
          </div>
          <SelectField
            label="Mic"
            value={rig.mic}
            onChange={(value) => commit((current) => ({ ...current, mic: value as MicId }))}
            options={MICS.map((mic) => ({ value: mic.id, label: `${mic.name} — ${mic.blurb}` }))}
          />
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span className="flex justify-between">
              <span>Room (ระยะไมค์/ห้อง)</span>
              <span className="tabular-nums text-fg">{pct(rig.air)}%</span>
            </span>
            <input type="range" min={0} max={1} step={0.01} value={rig.air} onChange={(event) => commit((current) => ({ ...current, air: Number(event.target.value) }))} />
          </label>
          <div className="rounded-md bg-surface-2 p-3 text-xs">
            <p className="font-semibold">จูนเนอร์ในตัว</p>
            <p className={`mt-1 text-3xl font-semibold tabular-nums ${inTune ? "text-olive" : ""}`}>{pitch ? pitch.name : "–"}</p>
            <p className="text-muted">
              {pitch ? `${pitch.cents > 0 ? "+" : ""}${pitch.cents} เซนต์ · ${fretHint(pitch.midi, family)}` : "ดีดสายเพื่อดูโน้ต"}
            </p>
            {rig.source === "line" ? (
              <div className="mt-2 flex gap-1">
                <button type="button" onClick={() => setTuneAs("guitar")} className={chipSm(tuneAs === "guitar")}>
                  กีตาร์
                </button>
                <button type="button" onClick={() => setTuneAs("bass")} className={chipSm(tuneAs === "bass")}>
                  เบส
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Play area */}
      {rig.source === "line" ? (
        <section className="panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">เสียบเครื่องจริง</h2>
            <button type="button" onClick={() => void toggleLive()} className={liveOn ? solidBtn : ghostBtn}>
              <Mic className="size-4" aria-hidden="true" />
              {liveOn ? "ปิดไลน์อิน" : "เปิดไลน์อิน"}
            </button>
            <button type="button" onClick={() => setView("io")} className={ghostBtn}>
              <Headphones className="size-4" aria-hidden="true" />
              เลือกอุปกรณ์
            </button>
            <span className="ml-auto text-xs text-muted">ดีเลย์ ~{latency} ms</span>
          </div>
          <MeterBars level={reading.rms} clip={reading.clip} />
          {liveError ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {liveError}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">ใส่หูฟังก่อนเปิดเสียงดัง เพื่อกันเสียงหอน</p>
          )}
        </section>
      ) : (
        <section className="panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{rig.source === "bass" ? "ฟิงเกอร์บอร์ดเบส" : "ฟิงเกอร์บอร์ดกีตาร์"}</h2>
            <div className="ml-auto flex items-center gap-2">
              <IconButton label="ลดคาโป" onClick={() => commit((current) => ({ ...current, capo: Math.max(0, current.capo - 1) }))}>
                <Minus className="size-4" aria-hidden="true" />
              </IconButton>
              <p className="min-w-16 text-center text-sm font-semibold tabular-nums">คาโป {rig.capo}</p>
              <IconButton label="เพิ่มคาโป" onClick={() => commit((current) => ({ ...current, capo: Math.min(7, current.capo + 1) }))}>
                <Plus className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">แตะเฟรตเพื่อฟังผ่านแอมป์ · คีย์บอร์ด: แถว Q–\\ คือเฟรต, ปุ่ม 1–{strings.length} เลือกสาย</p>
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-max">
              <div className="flex gap-1">
                <span className="sticky left-0 w-11 shrink-0 bg-surface" />
                {FRETS.map((fret) => (
                  <span key={fret} className="flex w-11 shrink-0 flex-col items-center text-xs text-muted">
                    {fret}
                    {DOTS.has(fret) ? <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brass" /> : <span className="mt-1 h-1.5 w-1.5" />}
                  </span>
                ))}
              </div>
              {strings.map((string, index) => (
                <div key={string.name + string.midi} className="mt-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setStringIndex(index)}
                    className={`sticky left-0 z-10 h-11 w-11 shrink-0 rounded-md text-sm font-semibold ${stringIndex === index ? "bg-brass text-brass-ink" : "bg-surface text-muted"}`}
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
                        className={`h-11 w-11 shrink-0 touch-none rounded-md border text-xs font-medium ${on ? "border-brass bg-brass text-brass-ink" : "border-line bg-surface-2"}`}
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

      <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article className="panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">เพลงประกอบ (Backing)</h2>
            <p className="truncate text-sm text-muted">{trackTitle || "ยังไม่ได้เปิดเพลง"}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className={solidBtn}>
              <Upload className="size-4" aria-hidden="true" />
              นำเพลงมาซ้อม
            </button>
            <button type="button" onClick={() => void onPull()} className={ghostBtn}>
              ใช้เพลงจากเครื่องมือแกะเพลง
            </button>
            <button type="button" onClick={() => void onDemo()} className={ghostBtn}>
              เพลงตัวอย่าง
            </button>
            <button type="button" onClick={toggleBacking} disabled={!duration} className={ghostBtn}>
              {backingOn ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              {backingOn ? "พัก" : "เล่น"}
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
          <div className="mt-3 flex items-center gap-3">
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
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex min-w-[10rem] flex-1 items-center gap-2 text-xs text-muted">
              ดังเพลง
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={songLevel}
                className="flex-1"
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSongLevel(value);
                  engineRef.current?.setBackingLevel(value);
                }}
              />
            </label>
            <div className="flex gap-1">
              {[0.5, 0.75, 1, 1.25].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRate(value);
                    engineRef.current?.setBackingRate(value);
                  }}
                  className={chipSm(rate === value)}
                >
                  {Math.round(value * 100)}%
                </button>
              ))}
            </div>
          </div>
          {trackError ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {trackError}
            </p>
          ) : null}
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
        </article>

        <article className="panel p-4">
          <p className="text-sm font-semibold">เมโทรนอม</p>
          <div className="mt-3 flex items-center gap-2">
            <IconButton label="ช้าลง" onClick={() => commit((current) => ({ ...current, bpm: Math.max(40, current.bpm - 1) }))}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </IconButton>
            <p className="w-16 text-center text-3xl font-semibold tabular-nums">{rig.bpm}</p>
            <IconButton label="เร็วขึ้น" onClick={() => commit((current) => ({ ...current, bpm: Math.min(240, current.bpm + 1) }))}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </IconButton>
            <button type="button" onClick={() => commit((current) => ({ ...current, click: !current.click }))} className={`ml-auto ${chip(rig.click)}`}>
              <Timer className="size-4" aria-hidden="true" />
              {rig.click ? "ปิด" : "เปิด"}
            </button>
          </div>
          <div className="mt-3 flex gap-2" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <span key={index} className={`h-3 flex-1 rounded-full ${rig.click && beat === index ? (index === 0 ? "bg-amber" : "bg-brass") : "bg-line"}`} />
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

// ── persistence for user presets ────────────────────────────────────────────
type UserPreset = { id: string; name: string; rig: RigSnapshot };

function readUserPresets(): UserPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem("jamstudio-user-presets") ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is UserPreset => !!item && typeof item === "object" && typeof (item as UserPreset).id === "string" && typeof (item as UserPreset).name === "string")
      .slice(0, 50);
  } catch {
    return [];
  }
}

function writeUserPresets(list: UserPreset[]) {
  try {
    localStorage.setItem("jamstudio-user-presets", JSON.stringify(list));
  } catch {
    // storage full
  }
}

// ── small UI pieces ────────────────────────────────────────────────────────
const solidBtn = "inline-flex h-10 items-center gap-2 rounded-md bg-brass px-3 text-sm font-semibold text-brass-ink";
const ghostBtn = "inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-sm font-medium";

function chip(active: boolean): string {
  return `inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium ${active ? "bg-brass text-brass-ink" : "border border-line bg-surface-2"}`;
}
function chipSm(active: boolean): string {
  return `inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium ${active ? "bg-brass text-brass-ink" : "border border-line bg-surface-2"}`;
}
function pct(value: number): string {
  return `${Math.round(value * 100)}`;
}

function SourceTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-9 rounded-md px-4 text-sm font-semibold ${active ? "bg-brass/25 text-fg ring-1 ring-brass" : "text-muted"}`}
    >
      {label}
    </button>
  );
}

function IconButton({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="grid h-10 w-10 place-items-center rounded-md border border-line bg-surface-2">
      {children}
    </button>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select
        value={options.some((option) => option.value === value) ? value : options[0]?.value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-line bg-surface-2 px-2 text-sm text-fg"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MeterBars({ level, clip }: { level: number; clip: boolean }) {
  const bars = 24;
  const lit = Math.round(Math.min(1, level) * bars);
  return (
    <div className="mt-3 flex h-6 items-end gap-[3px]" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${40 + (i / bars) * 60}%`,
            background: i < lit ? (clip || i > bars * 0.85 ? "var(--color-danger)" : i > bars * 0.65 ? "var(--color-amber)" : "var(--color-olive)") : "var(--color-line)",
          }}
        />
      ))}
    </div>
  );
}

const SHORT: Record<string, string> = {
  gate: "Gate",
  comp: "Comp",
  drive: "Drive",
  dist: "Dist",
  fuzz: "Fuzz",
  octave: "Octave",
  wah: "Wah",
  eq: "EQ",
  chorus: "Chorus",
  phaser: "Phase",
  flanger: "Flanger",
  tremolo: "Trem",
  delay: "Delay",
  spring: "Reverb",
  boost: "Boost",
  klon: "Clear OD",
  univibe: "Vibe",
  varitone: "Varitone",
};

function TunerStomp({ hz, pitchName, inTune }: { hz: number; pitchName: string; inTune: boolean }) {
  return (
    <div className="flex h-[118px] w-[74px] shrink-0 flex-col items-center justify-between rounded-lg border border-black/40 bg-[#2a2d33] p-1.5 shadow-lg">
      <div className={`grid h-9 w-full place-items-center rounded bg-black font-mono text-sm ${inTune ? "text-olive" : "text-brass"}`}>{hz > 0 ? pitchName : "--"}</div>
      <span className="text-[11px] font-semibold text-white/90">Tuner</span>
      <span className="h-6 w-6 rounded-full border-2 border-white/40 bg-gradient-to-b from-zinc-300 to-zinc-500" />
    </div>
  );
}

function Stomp({ pedal, focused, onFocus, onToggle }: { pedal: PedalState; focused: boolean; onFocus: () => void; onToggle: () => void }) {
  const color = PEDAL_COLORS[pedal.kind];
  const meta = pedalMeta(pedal.kind);
  return (
    <div
      className={`relative flex h-[118px] w-[74px] shrink-0 flex-col items-center justify-between rounded-lg border p-1.5 shadow-lg transition ${focused ? "border-white ring-2 ring-brass" : "border-black/40"}`}
      style={{ background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 70%, black))` }}
    >
      <button type="button" onClick={onFocus} aria-label={`ปรับ ${meta.name}`} aria-pressed={focused} className="flex w-full flex-col items-center gap-1">
        <span className="flex gap-1.5" aria-hidden="true">
          {meta.knobs.slice(0, 3).map((knob) => (
            <span key={knob.key} className="knob-cap block h-4 w-4 rounded-full" />
          ))}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${pedal.on ? "bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.8)]" : "bg-black/50"}`} aria-hidden="true" />
        <span className="max-w-full truncate text-[11px] font-bold text-white drop-shadow">{SHORT[pedal.kind] ?? meta.name}</span>
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={pedal.on}
        aria-label={`${pedal.on ? "ปิด" : "เปิด"} ${meta.name}`}
        className="h-7 w-7 rounded-full border-2 border-white/50 bg-gradient-to-b from-zinc-200 to-zinc-500 active:translate-y-px"
      />
    </div>
  );
}

function PedalEditor({
  pedal,
  index,
  total,
  onParam,
  onToggle,
  onMove,
  onRemove,
}: {
  pedal: PedalState;
  index: number;
  total: number;
  onParam: (key: string, value: number) => void;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const meta = pedalMeta(pedal.kind);
  return (
    <div className="mt-2 rounded-lg border border-line bg-bg/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-4 w-4 rounded" style={{ background: PEDAL_COLORS[pedal.kind] }} aria-hidden="true" />
        <h3 className="text-sm font-semibold">
          {index + 1}. {meta.name}
        </h3>
        <span className="text-xs text-muted">{meta.blurb}</span>
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={onToggle} className={chipSm(pedal.on)}>
            {pedal.on ? "เปิดอยู่" : "ปิดอยู่"}
          </button>
          <IconButton label="ย้ายไปซ้าย" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label="ย้ายไปขวา" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={`เอา ${meta.name} ออก`} onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-around gap-4">
        {meta.knobs.map((knob) => {
          const value = pedal.params[knob.key] ?? knob.def;
          return (
            <Knob
              key={knob.key}
              label={knob.label}
              value={value}
              min={knob.min}
              max={knob.max}
              step={knob.unit === "step" ? 1 : undefined}
              display={formatKnob(knob, value)}
              size={52}
              onChange={(next) => onParam(knob.key, next)}
            />
          );
        })}
      </div>
    </div>
  );
}

function AmpHead({
  name,
  tube,
  knobs,
  onKnob,
  onPower,
}: {
  name: string;
  tube: boolean;
  knobs: RigSnapshot["knobs"];
  onKnob: (key: keyof RigSnapshot["knobs"], value: number) => void;
  onPower: () => void;
}) {
  return (
    <div className="amp-tolex overflow-hidden rounded-xl border-2 border-[#2b2b2b] p-2 shadow-2xl">
      <div className="amp-grille grid h-16 place-items-center rounded-md border border-black/60 sm:h-20">
        <span className="px-2 text-center font-[family-name:var(--font-script)] text-2xl italic text-[#f3e6c4] drop-shadow sm:text-3xl">{name}</span>
      </div>
      <div className="amp-plate mt-2 flex flex-wrap items-end justify-around gap-x-2 gap-y-3 rounded-md px-2 py-3">
        <button type="button" onClick={onPower} aria-label="เปิดเสียงใหม่ (ถ้าถูกตัดเพราะเสียงหอน)" className="flex flex-col items-center gap-1">
          <span className={`h-3 w-3 rounded-full ${tube ? "bg-red-600 shadow-[0_0_8px_2px_rgba(220,38,38,0.7)]" : "bg-amber"}`} />
          <span className="text-[10px] font-semibold text-[#3a2a08]">{tube ? "TUBE" : "SS"}</span>
        </button>
        {AMP_KNOBS.map((knob) => (
          <div key={knob.key} className="[&_span]:!text-[#3a2a08]">
            <Knob label={knob.label} value={knobs[knob.key]} variant="gold" size={40} display={(knobs[knob.key] * 10).toFixed(1)} onChange={(value) => onKnob(knob.key, value)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Cabinet({ label }: { label: string }) {
  return (
    <div className="amp-tolex hidden flex-col rounded-xl border-2 border-[#2b2b2b] p-2 shadow-2xl sm:flex">
      <div className="amp-grille grid flex-1 place-items-center rounded-md border border-black/60">
        <span className="px-1 text-center font-[family-name:var(--font-script)] text-xl italic text-[#f3e6c4]">{label}</span>
      </div>
    </div>
  );
}

function AmpGroup({ title, family, active, onPick }: { title: string; family: "guitar" | "bass"; active: AmpId; onPick: (id: AmpId) => void }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{title}</p>
      <div className="mt-2 flex flex-col gap-2">
        {AMPS.filter((amp) => amp.family === family).map((amp) => (
          <button
            key={amp.id}
            type="button"
            onClick={() => onPick(amp.id)}
            className={`rounded-md border px-3 py-2 text-left ${active === amp.id ? "border-brass bg-brass/10" : "border-line bg-surface-2"}`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              {amp.name}
              {amp.tube ? <span className="rounded bg-amber/20 px-1.5 py-0.5 text-[10px] text-amber">หลอด</span> : <span className="rounded bg-line px-1.5 py-0.5 text-[10px] text-muted">โซลิด</span>}
            </span>
            <span className="mt-1 block text-xs text-muted">{amp.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

