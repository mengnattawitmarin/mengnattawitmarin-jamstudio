import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Mic, MicOff, Volume2 } from "lucide-react";
import { detectPitch } from "@/lib/audio/rig";
import {
  TUNER_INSTRUMENTS,
  TUNING_COUNT,
  centsOff,
  midiToHz,
  nearestString,
  noteName,
} from "@/lib/audio/tunings";
import { useSettings } from "@/lib/settings";

const IN_TUNE = 5;
const TRACE = 48;

type Listen = {
  ctx: AudioContext;
  stream: MediaStream;
  analyser: AnalyserNode;
  buf: Float32Array;
  timer: number;
};

export function Tuner() {
  const a4 = useSettings((s) => s.a4);
  const inputDeviceId = useSettings((s) => s.inputDeviceId);
  const setSettings = useSettings((s) => s.set);
  const [instId, setInstId] = useState("guitar6");
  const [tuningId, setTuningId] = useState("std");
  const [picker, setPicker] = useState(false);
  const [auto, setAuto] = useState(true);
  const [selected, setSelected] = useState(0);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [hz, setHz] = useState(0);
  const [trace, setTrace] = useState<number[]>([]);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const listenRef = useRef<Listen | null>(null);
  const history = useRef<number[]>([]);
  const holdRef = useRef<{ index: number; since: number } | null>(null);
  const refCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("jamstudio-tuner") ?? "null") as { i?: string; t?: string } | null;
      const inst = TUNER_INSTRUMENTS.find((item) => item.id === saved?.i);
      if (inst) {
        setInstId(inst.id);
        if (inst.tunings.some((tuning) => tuning.id === saved?.t)) setTuningId(saved?.t ?? "std");
        else setTuningId(inst.tunings[0].id);
      }
    } catch {
      // ignore broken storage
    }
    return () => {
      stop();
      void refCtx.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const instrument = TUNER_INSTRUMENTS.find((item) => item.id === instId) ?? TUNER_INSTRUMENTS[0];
  const tuning = instrument.tunings.find((item) => item.id === tuningId) ?? instrument.tunings[0];
  const chromatic = instrument.id === "chromatic";

  function choose(nextInst: string, nextTuning: string) {
    setInstId(nextInst);
    setTuningId(nextTuning);
    setSelected(0);
    setDone({});
    setPicker(false);
    try {
      localStorage.setItem("jamstudio-tuner", JSON.stringify({ i: nextInst, t: nextTuning }));
    } catch {
      // private mode
    }
  }

  // Which string / note are we judging against?
  const target = useMemo(() => {
    if (hz <= 0) return null;
    if (chromatic) {
      const midi = Math.round(69 + 12 * Math.log2(hz / a4));
      return { index: -1, midi };
    }
    const index = auto ? nearestString(hz, tuning.notes, a4) : selected;
    return { index, midi: tuning.notes[index] };
  }, [hz, chromatic, auto, selected, tuning, a4]);

  const cents = target ? Math.max(-50, Math.min(50, centsOff(hz, target.midi, a4))) : 0;
  const inTune = target != null && Math.abs(cents) <= IN_TUNE;
  const activeIndex = target?.index ?? selected;

  useEffect(() => {
    if (!target || target.index < 0) {
      holdRef.current = null;
      return;
    }
    if (!inTune) {
      holdRef.current = null;
      return;
    }
    const now = performance.now();
    if (!holdRef.current || holdRef.current.index !== target.index) holdRef.current = { index: target.index, since: now };
    else if (now - holdRef.current.since > 600) setDone((prev) => (prev[target.index] ? prev : { ...prev, [target.index]: true }));
  }, [target, inTune]);

  async function start() {
    setError("");
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({ latencyHint: "interactive" });
      const audio: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      if (inputDeviceId && inputDeviceId !== "default") audio.deviceId = { exact: inputDeviceId };
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 25;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      src.connect(hp);
      hp.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const timer = window.setInterval(() => tick(), 60);
      listenRef.current = { ctx, stream, analyser, buf, timer };
      setListening(true);
    } catch {
      setError("เปิดไมโครโฟนไม่ได้ — อนุญาตการใช้ไมค์ในเบราว์เซอร์/แอป แล้วลองอีกครั้ง");
      setListening(false);
    }
  }

  function stop() {
    const live = listenRef.current;
    if (!live) return;
    window.clearInterval(live.timer);
    live.stream.getTracks().forEach((track) => track.stop());
    void live.ctx.close();
    listenRef.current = null;
    setListening(false);
    setHz(0);
    history.current = [];
  }

  function tick() {
    const live = listenRef.current;
    if (!live) return;
    live.analyser.getFloatTimeDomainData(live.buf as Float32Array<ArrayBuffer>);
    const found = detectPitch(live.buf, live.ctx.sampleRate);
    if (!found) {
      history.current = history.current.slice(-2);
      if (history.current.length === 0) setHz(0);
      return;
    }
    // Median of the last 5 frames rejects octave slips on the attack.
    history.current = [...history.current.slice(-4), found];
    const sorted = [...history.current].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    setHz((prev) => (prev > 0 && Math.abs(1200 * Math.log2(median / prev)) < 30 ? prev * 0.6 + median * 0.4 : median));
  }

  useEffect(() => {
    if (!listening) return;
    setTrace((prev) => [...prev.slice(-(TRACE - 1)), target ? cents : Number.NaN]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hz]);

  function playReference(midi: number) {
    const ctx = refCtx.current ?? new AudioContext();
    refCtx.current = ctx;
    void ctx.resume();
    const t0 = ctx.currentTime;
    const freq = midiToHz(midi, a4);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(Math.min(8000, freq * 10), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2), t0 + 1.8);
    out.connect(lp);
    lp.connect(ctx.destination);
    [1, 2, 3].forEach((harm, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = freq * harm;
      const g = ctx.createGain();
      g.gain.value = [1, 0.35, 0.15][i];
      osc.connect(g);
      g.connect(out);
      osc.start(t0);
      osc.stop(t0 + 2.5);
    });
  }

  function tapString(index: number) {
    setSelected(index);
    setAuto(false);
    playReference(tuning.notes[index]);
  }

  const count = tuning.notes.length;
  const half = Math.ceil(count / 2);
  const left = tuning.notes.slice(0, half).map((midi, i) => ({ midi, index: i })).reverse();
  const right = tuning.notes.slice(half).map((midi, i) => ({ midi, index: half + i }));
  const flats = usesFlats(tuning.name);
  const direction = !target || inTune ? "" : cents < 0 ? "หมุนขึ้น" : "หมุนลง";
  const bubbleX = 50 + cents; // 0..100 %

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
      <section className="panel flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setPicker((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={picker}
        >
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold">
              {instrument.name}
              <ChevronRight className={`ml-1 inline size-4 transition ${picker ? "rotate-90" : ""}`} aria-hidden="true" />
            </span>
            <span className="block text-sm text-muted">{tuning.name}</span>
          </span>
        </button>
        {!chromatic ? (
          <label className="flex items-center gap-2 text-sm font-semibold">
            AUTO
            <button
              type="button"
              role="switch"
              aria-checked={auto}
              onClick={() => setAuto((v) => !v)}
              className={`relative h-8 w-14 rounded-full transition ${auto ? "bg-olive" : "bg-line"}`}
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${auto ? "left-7" : "left-1"}`} />
            </button>
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => (listening ? stop() : void start())}
          className={`inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold ${listening ? "border border-line bg-surface-2" : "bg-brass text-brass-ink"}`}
        >
          {listening ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
          {listening ? "หยุดฟัง" : "เริ่มจูน"}
        </button>
      </section>

      {picker ? (
        <section className="panel grid gap-4 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted">
              {TUNER_INSTRUMENTS.length} เครื่องดนตรี · {TUNING_COUNT} จูนนิ่ง
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {TUNER_INSTRUMENTS.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => choose(item.id, item.tunings[0].id)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${item.id === instId ? "bg-brass text-brass-ink" : "hover:bg-surface-2"}`}
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-muted">จูนนิ่ง</p>
            <ul className="mt-2 flex flex-col gap-1">
              {instrument.tunings.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => choose(instId, item.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm ${item.id === tuning.id ? "bg-surface-2 ring-1 ring-brass" : "hover:bg-surface-2"}`}
                  >
                    <span>{item.name}</span>
                    <span className="font-mono text-xs text-muted">{item.notes.map((m) => noteName(m, usesFlats(item.name))).join(" ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="panel relative overflow-hidden p-4">
        {/* Cents scale */}
        <div className="relative mx-auto h-56 max-w-xl">
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          <span className="absolute left-2 top-2 text-2xl font-semibold text-muted">♭</span>
          <span className="absolute right-2 top-2 text-2xl font-semibold text-muted">♯</span>
          <span className={`absolute inset-y-0 left-1/2 w-px ${inTune ? "bg-olive" : "bg-muted/60"}`} />
          <svg className="absolute inset-x-0 bottom-0 h-32 w-full" viewBox={`0 0 100 ${TRACE}`} preserveAspectRatio="none" aria-hidden="true">
            <polyline
              fill="none"
              stroke={inTune ? "var(--color-olive)" : "var(--color-danger)"}
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
              points={trace
                .map((value, i) => (Number.isNaN(value) ? null : `${50 + value},${TRACE - i}`))
                .filter(Boolean)
                .join(" ")}
            />
          </svg>
          <div
            className="absolute top-14 flex -translate-x-1/2 items-center gap-2 transition-[left] duration-100"
            style={{ left: `${target ? bubbleX : 50}%` }}
          >
            <span
              className={`grid h-16 w-16 place-items-center rounded-full border-4 bg-bg text-xl font-bold tabular-nums ${!target ? "border-line text-muted" : inTune ? "border-olive text-olive" : "border-danger text-fg"}`}
            >
              {target ? (inTune ? <Check className="size-7" aria-hidden="true" /> : `${cents > 0 ? "+" : ""}${Math.round(cents)}`) : "–"}
            </span>
          </div>
          {direction ? (
            <span className="absolute left-1/2 top-[8.5rem] -translate-x-1/2 rounded-full bg-surface-2 px-3 py-1 text-sm">{direction}</span>
          ) : null}
        </div>
        <p className="mt-2 text-center text-sm text-muted" aria-live="polite">
          {hz > 0 && target
            ? `${noteName(target.midi, flats)}${Math.floor(target.midi / 12) - 1} · ${hz.toFixed(1)} Hz · เป้า ${midiToHz(target.midi, a4).toFixed(1)} Hz`
            : listening
              ? "ดีดทีละสาย ปล่อยให้เสียงค้าง"
              : "กด “เริ่มจูน” แล้วดีดสาย หรือแตะชื่อสายเพื่อฟังเสียงอ้างอิง"}
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-center text-sm text-danger">
            {error}
          </p>
        ) : null}

        {/* Headstock */}
        {!chromatic ? (
          <div className="mx-auto mt-4 grid max-w-md grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex flex-col items-end gap-3">
              {left.map(({ midi, index }) => (
                <StringButton key={index} midi={midi} flats={flats} active={activeIndex === index} done={done[index]} onClick={() => tapString(index)} side="left" />
              ))}
            </div>
            <Headstock strings={count} active={activeIndex} half={half} />
            <div className="flex flex-col items-start gap-3">
              {right.map(({ midi, index }) => (
                <StringButton key={index} midi={midi} flats={flats} active={activeIndex === index} done={done[index]} onClick={() => tapString(index)} side="right" />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel flex flex-wrap items-center gap-3 p-4 text-sm">
        <Volume2 className="size-4 text-muted" aria-hidden="true" />
        <span className="text-muted">ความถี่อ้างอิง A4</span>
        <button type="button" className="h-9 w-9 rounded-md border border-line" onClick={() => setSettings({ a4: Math.max(430, a4 - 1) })} aria-label="ลด A4">
          −
        </button>
        <span className="w-16 text-center font-semibold tabular-nums">{a4} Hz</span>
        <button type="button" className="h-9 w-9 rounded-md border border-line" onClick={() => setSettings({ a4: Math.min(450, a4 + 1) })} aria-label="เพิ่ม A4">
          +
        </button>
        <button type="button" className="ml-auto text-xs text-muted underline" onClick={() => setDone({})}>
          ล้างเครื่องหมายถูก
        </button>
      </section>
    </main>
  );
}

function usesFlats(name: string): boolean {
  return /Eb|ลดครึ่ง/.test(name);
}

function StringButton({
  midi,
  flats,
  active,
  done,
  side,
  onClick,
}: {
  midi: number;
  flats: boolean;
  active: boolean;
  done?: boolean;
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`สาย ${noteName(midi, flats)} — แตะเพื่อฟังเสียงอ้างอิง`}
      className={`relative grid h-14 w-14 place-items-center rounded-full text-lg font-semibold transition ${active ? "bg-brass text-brass-ink ring-4 ring-brass/30" : done ? "bg-olive/20 text-olive" : "bg-surface-2 text-fg"}`}
    >
      {noteName(midi, flats)}
      <span className="absolute -bottom-0.5 text-[10px] font-normal opacity-70">{Math.floor(midi / 12) - 1}</span>
      {done ? (
        <Check className={`absolute top-0 size-4 rounded-full bg-olive p-0.5 text-white ${side === "left" ? "-left-1" : "-right-1"}`} aria-hidden="true" />
      ) : null}
    </button>
  );
}

function Headstock({ strings, active, half }: { strings: number; active: number; half: number }) {
  const rows = Math.max(half, strings - half);
  const height = 60 + rows * 68;
  return (
    <svg viewBox={`0 0 140 ${height}`} className="h-auto w-28 sm:w-36" aria-hidden="true">
      <defs>
        <linearGradient id="wood" x1="0" x2="1">
          <stop offset="0" stopColor="#5c2f15" />
          <stop offset="0.5" stopColor="#9b5a2e" />
          <stop offset="1" stopColor="#5c2f15" />
        </linearGradient>
      </defs>
      <path
        d={`M30 ${height} L22 40 Q20 14 46 8 L70 2 L94 8 Q120 14 118 40 L110 ${height} Z`}
        fill="url(#wood)"
        stroke="#f0e6d6"
        strokeWidth="2.5"
      />
      {Array.from({ length: strings }, (_, i) => {
        const isLeft = i < half;
        const row = isLeft ? half - 1 - i : i - half;
        const y = 44 + row * 68;
        const x = isLeft ? 40 : 100;
        const on = i === active;
        return (
          <g key={i}>
            <line x1={x} y1={y} x2={60 + (i / Math.max(1, strings - 1)) * 20} y2={height} stroke={on ? "#7fb0ff" : "#d9d9d9"} strokeWidth={on ? 2 : 1.2} />
            <circle cx={x} cy={y} r="8" fill="#e8e8e8" stroke="#888" />
            <rect x={isLeft ? 0 : 118} y={y - 9} width="22" height="18" rx="6" fill="#cfcfcf" stroke="#777" />
          </g>
        );
      })}
    </svg>
  );
}
