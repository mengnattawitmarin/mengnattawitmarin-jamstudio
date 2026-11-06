import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Cable,
  Circle,
  Download,
  Drum,
  Guitar,
  Headphones,
  KeyboardMusic,
  Mic,
  Plus,
  Power,
  Share2,
  Square,
  Trash2,
  Usb,
} from "lucide-react";
import { Knob } from "@/components/ui/knob";
import { canPickOutput, listAudioDevices } from "@/lib/audio/rig";
import { sharedRig } from "@/lib/audio/shared-engine";
import { audibleMap, InputStrip, KINDS, newChannel, type ChannelKind, type ChannelState } from "@/lib/audio/mixer";
import { gmDrumPad, midiSupported, noteOffBytes, noteOnBytes, openMidi, parseMidi } from "@/lib/audio/midi";
import { JamSynth, type InstrumentId } from "@/lib/audio/jam-synth";
import { useSettings } from "@/lib/settings";

const STORE = "kakun-mixer-v1";
const KIND_ICON: Record<ChannelKind, typeof Guitar> = {
  guitar: Guitar,
  bass: Guitar,
  keys: KeyboardMusic,
  drums: Drum,
  vocal: Mic,
  acoustic: Guitar,
  line: Cable,
};
const MIDI_SOUNDS: { id: InstrumentId; label: string }[] = [
  { id: "piano", label: "เปียโน" },
  { id: "rhodes", label: "อิเล็กทริกเปียโน" },
  { id: "pad", label: "แพด" },
  { id: "lead", label: "ซินธ์ลีด" },
  { id: "bass", label: "ซินธ์เบส" },
  { id: "drums", label: "กลองชุด" },
];

type Saved = {
  channels: ChannelState[];
  mix: number;
  midiSound: InstrumentId;
  midiVol: number;
  drums10: boolean;
  ccMap: Record<string, string>;
  midiOut: string;
  thru: boolean;
};

function loadSaved(): Saved {
  const fallback: Saved = { channels: [], mix: 0.9, midiSound: "piano", midiVol: 0.8, drums10: true, ccMap: {}, midiOut: "", thru: false };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null") as Partial<Saved> | null;
    if (!raw) return fallback;
    return {
      ...fallback,
      ...raw,
      channels: Array.isArray(raw.channels) ? raw.channels.filter((c) => c && typeof c.id === "string" && c.kind in KINDS).slice(0, 8) : [],
    };
  } catch {
    return fallback;
  }
}

export function ConnectPage({ active = true }: { active?: boolean }) {
  const settings = useSettings();
  const [saved, setSaved] = useState<Saved>(() => ({ channels: [], mix: 0.9, midiSound: "piano", midiVol: 0.8, drums10: true, ccMap: {}, midiOut: "", thru: false }));
  const [ready, setReady] = useState(false);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [meters, setMeters] = useState<Record<string, { peak: number; clip: boolean }>>({});
  const [outPeak, setOutPeak] = useState(0);
  const [devices, setDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  const [latency, setLatency] = useState(0);
  const [adding, setAdding] = useState(false);
  // MIDI
  const [midiState, setMidiState] = useState<"off" | "on" | "unsupported" | "denied">("off");
  const [midiIns, setMidiIns] = useState<{ id: string; name: string }[]>([]);
  const [midiOuts, setMidiOuts] = useState<{ id: string; name: string }[]>([]);
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [learn, setLearn] = useState<string | null>(null);
  const [lastCc, setLastCc] = useState<string>("");
  const [held, setHeld] = useState<number[]>([]);
  // Recording
  const [recording, setRecording] = useState(false);
  const [recStart, setRecStart] = useState(0);
  const [recClock, setRecClock] = useState(0);
  const [take, setTake] = useState<{ url: string; blob: Blob; name: string } | null>(null);
  const [notice, setNotice] = useState("");

  const strips = useRef(new Map<string, InputStrip>());
  const mixBus = useRef<GainNode | null>(null);
  const midiGain = useRef<GainNode | null>(null);
  const outMeter = useRef<AnalyserNode | null>(null);
  const synth = useRef<JamSynth | null>(null);
  const midiRef = useRef<MIDIAccess | null>(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const learnRef = useRef(learn);
  learnRef.current = learn;

  // Build the mixer graph inside the shared engine once.
  useEffect(() => {
    const engine = sharedRig(useSettings.getState().latency);
    const ctx = engine.ctx;
    const bus = ctx.createGain();
    bus.connect(engine.mixIn);
    const mg = ctx.createGain();
    mg.connect(bus);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    engine.outBus.connect(an);
    mixBus.current = bus;
    midiGain.current = mg;
    outMeter.current = an;
    synth.current = new JamSynth({ ctx, destination: mg });
    const initial = loadSaved();
    setSaved(initial);
    setReady(true);
    setLatency(engine.latencyMs());
    void listAudioDevices().then(setDevices).catch(() => undefined);
    const stripMap = strips.current;
    return () => {
      for (const strip of stripMap.values()) strip.dispose();
      stripMap.clear();
      synth.current?.close();
      synth.current = null;
      if (midiRef.current) for (const input of midiRef.current.inputs.values()) input.onmidimessage = null;
      try {
        bus.disconnect();
        mg.disconnect();
        engine.outBus.disconnect(an);
      } catch {
        // already gone
      }
    };
  }, []);

  // Persist + push parameters to audio.
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(saved));
    } catch {
      // storage full
    }
    const engine = sharedRig();
    const t = engine.ctx.currentTime;
    mixBus.current?.gain.setTargetAtTime(saved.mix, t, 0.02);
    midiGain.current?.gain.setTargetAtTime(saved.midiVol, t, 0.02);
    const audible = audibleMap(saved.channels);
    for (const channel of saved.channels) strips.current.get(channel.id)?.update(channel, audible[channel.id]);
  }, [saved, ready]);

  // Meters.
  useEffect(() => {
    if (!active) return;
    const buf = new Float32Array(1024);
    const id = window.setInterval(() => {
      const next: Record<string, { peak: number; clip: boolean }> = {};
      for (const [cid, strip] of strips.current) next[cid] = strip.read();
      setMeters(next);
      const an = outMeter.current;
      if (an) {
        an.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
        setOutPeak(peak);
      }
      if (recording) setRecClock((performance.now() - recStart) / 1000);
    }, 90);
    return () => window.clearInterval(id);
  }, [active, recording, recStart]);

  function patch(fn: (prev: Saved) => Saved) {
    setSaved((prev) => fn(prev));
  }

  function patchChannel(id: string, change: Partial<ChannelState>) {
    patch((prev) => ({ ...prev, channels: prev.channels.map((c) => (c.id === id ? { ...c, ...change } : c)) }));
  }

  function addChannel(kind: ChannelKind) {
    patch((prev) => ({ ...prev, channels: [...prev.channels, newChannel(kind, prev.channels.filter((c) => c.kind === kind).length + 1)].slice(0, 8) }));
    setAdding(false);
  }

  function removeChannel(id: string) {
    strips.current.get(id)?.dispose();
    strips.current.delete(id);
    setOpenIds((prev) => ({ ...prev, [id]: false }));
    patch((prev) => ({ ...prev, channels: prev.channels.filter((c) => c.id !== id) }));
  }

  async function toggleOpen(channel: ChannelState) {
    const engine = sharedRig();
    await engine.resume();
    let strip = strips.current.get(channel.id);
    if (strip?.isOpen) {
      strip.close();
      setOpenIds((prev) => ({ ...prev, [channel.id]: false }));
      return;
    }
    if (!strip) {
      strip = new InputStrip(engine.ctx, { direct: mixBus.current ?? engine.mixIn, amp: engine.ampInputNode() });
      strips.current.set(channel.id, strip);
    }
    try {
      await strip.open(channel);
      strip.update(channel, audibleMap(savedRef.current.channels)[channel.id]);
      setOpenIds((prev) => ({ ...prev, [channel.id]: true }));
      setErrors((prev) => ({ ...prev, [channel.id]: "" }));
      setDevices(await listAudioDevices());
      setLatency(engine.latencyMs());
    } catch {
      setErrors((prev) => ({ ...prev, [channel.id]: "เปิดอินพุตไม่ได้ — อนุญาตไมค์ หรือเลือกอุปกรณ์อื่น (มือถือบางรุ่นเปิดได้ทีละอุปกรณ์)" }));
    }
  }

  async function reopenIfOpen(channel: ChannelState) {
    const strip = strips.current.get(channel.id);
    if (!strip?.isOpen) return;
    try {
      await strip.open(channel);
      strip.update(channel, audibleMap(savedRef.current.channels)[channel.id]);
    } catch {
      setErrors((prev) => ({ ...prev, [channel.id]: "เปลี่ยนอุปกรณ์ไม่สำเร็จ" }));
    }
  }

  // ── MIDI ────────────────────────────────────────────────────────────────
  function refreshPorts(access: MIDIAccess) {
    const ins: { id: string; name: string }[] = [];
    for (const input of access.inputs.values()) {
      ins.push({ id: input.id, name: input.name || "MIDI input" });
      input.onmidimessage = (event) => onMidi(input.id, event);
    }
    const outs: { id: string; name: string }[] = [];
    for (const out of access.outputs.values()) outs.push({ id: out.id, name: out.name || "MIDI output" });
    setMidiIns(ins);
    setMidiOuts(outs);
  }

  async function connectMidi() {
    if (!midiSupported()) {
      setMidiState("unsupported");
      return;
    }
    try {
      await sharedRig().resume();
      const access = await openMidi();
      midiRef.current = access;
      refreshPorts(access);
      access.onstatechange = () => refreshPorts(access);
      setMidiState("on");
    } catch {
      setMidiState("denied");
    }
  }

  function midiOutPort(): MIDIOutput | null {
    const id = savedRef.current.midiOut;
    if (!id || !midiRef.current) return null;
    return midiRef.current.outputs.get(id) ?? null;
  }

  function onMidi(inputId: string, event: MIDIMessageEvent) {
    const data = event.data;
    if (!data) return;
    const s = savedRef.current;
    if (s.thru) midiOutPort()?.send(Array.from(data));
    const msg = parseMidi(data);
    if (msg.type === "on" || msg.type === "off") setActivity((prev) => ({ ...prev, [inputId]: performance.now() }));
    const voice = synth.current;
    if (msg.type === "on" && voice) {
      const drums = s.midiSound === "drums" || (s.drums10 && msg.channel === 10);
      if (drums) voice.noteOn("midi", "drums", gmDrumPad(msg.note), msg.velocity);
      else voice.noteOn(`midi${msg.channel}`, s.midiSound, msg.note, msg.velocity);
    } else if (msg.type === "off" && voice) {
      if (!(s.midiSound === "drums" || (s.drums10 && msg.channel === 10))) voice.noteOff(`midi${msg.channel}`, s.midiSound, msg.note);
    } else if (msg.type === "cc") {
      const key = `${msg.channel}:${msg.cc}`;
      setLastCc(`CC${msg.cc} ช่อง ${msg.channel} = ${Math.round(msg.value * 127)}`);
      const target = learnRef.current;
      if (target) {
        patch((prev) => {
          const ccMap = Object.fromEntries(Object.entries(prev.ccMap).filter(([, t]) => t !== target));
          return { ...prev, ccMap: { ...ccMap, [key]: target } };
        });
        setLearn(null);
        return;
      }
      const mapped = s.ccMap[key];
      if (mapped) applyCc(mapped, msg.value);
    }
  }

  function applyCc(target: string, value: number) {
    if (target === "mix") patch((prev) => ({ ...prev, mix: value }));
    else if (target === "midi") patch((prev) => ({ ...prev, midiVol: value }));
    else if (target === "rig") sharedRig().setMaster(value);
    else if (target.startsWith("fader:")) patchChannel(target.slice(6), { fader: value * 1.2 });
  }

  function keyDown(note: number) {
    void sharedRig().resume();
    const s = savedRef.current;
    if (s.midiSound === "drums") synth.current?.noteOn("kbd", "drums", gmDrumPad(note), 0.85);
    else synth.current?.noteOn("kbd", s.midiSound, note, 0.85);
    midiOutPort()?.send(noteOnBytes(note, 0.85));
    setHeld((prev) => [...prev, note]);
  }

  function keyUp(note: number) {
    const s = savedRef.current;
    if (s.midiSound !== "drums") synth.current?.noteOff("kbd", s.midiSound, note);
    midiOutPort()?.send(noteOffBytes(note));
    setHeld((prev) => prev.filter((n) => n !== note));
  }

  // ── Recording ──────────────────────────────────────────────────────────
  async function toggleRecord() {
    const engine = sharedRig();
    if (recording) {
      const blob = await engine.stopRecording();
      setRecording(false);
      if (!blob) return;
      if (take) URL.revokeObjectURL(take.url);
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      setTake({ url: URL.createObjectURL(blob), blob, name: `kakunstudio-${stamp}.${ext}` });
      return;
    }
    await engine.resume();
    if (engine.startRecording()) {
      setRecording(true);
      setRecStart(performance.now());
      setRecClock(0);
    } else setNotice("อุปกรณ์นี้อัดเสียงไม่ได้");
  }

  async function shareTake() {
    if (!take) return;
    const file = new File([take.blob], take.name, { type: take.blob.type });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    try {
      if (nav.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Kakunstudio" });
      else setNotice("อุปกรณ์นี้แชร์ไฟล์ไม่ได้ — ใช้ปุ่มดาวน์โหลดแทน");
    } catch {
      // cancelled
    }
  }

  const channels = saved.channels;
  const ccTargets: { id: string; label: string }[] = [
    { id: "rig", label: "วอลุ่มแอมป์" },
    { id: "mix", label: "มิกเซอร์รวม" },
    { id: "midi", label: "เสียง MIDI" },
    ...channels.map((c) => ({ id: `fader:${c.id}`, label: `เฟดเดอร์ ${c.name}` })),
  ];
  const ccFor = (target: string) => Object.entries(saved.ccMap).find(([, t]) => t === target)?.[0];
  const now = performance.now();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:px-4">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="title-rock text-5xl">เชื่อมต่อ & มิกเซอร์</h1>
          <p className="text-sm text-muted">ต่อกีตาร์ เบส คีย์บอร์ด กลองไฟฟ้า ไมค์ หรือเสียงจากแอปอื่น ปรับสัญญาณเข้า-ออกในที่เดียว</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Chip>ดีเลย์ ~{latency} ms</Chip>
          <Chip>{channels.filter((c) => openIds[c.id]).length} อินพุตเปิดอยู่</Chip>
          <Chip>MIDI {midiState === "on" ? `${midiIns.length} เครื่อง` : midiState === "unsupported" ? "ไม่รองรับ" : "ปิด"}</Chip>
        </div>
      </section>

      {/* Input channels */}
      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="title-rock text-3xl">อินพุตเสียง</h2>
          <button type="button" onClick={() => setAdding((v) => !v)} disabled={channels.length >= 8} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brass px-3 text-sm font-semibold text-white">
            <Plus className="size-4" aria-hidden="true" />
            เพิ่มช่อง
          </button>
        </div>
        {adding ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {(Object.keys(KINDS) as ChannelKind[]).map((kind) => {
              const Icon = KIND_ICON[kind];
              return (
                <button key={kind} type="button" onClick={() => addChannel(kind)} className="flex flex-col items-start gap-1 rounded-lg border-2 border-line bg-surface-2 p-3 text-left hover:border-brass">
                  <Icon className="size-5 text-brass" aria-hidden="true" />
                  <span className="text-sm font-semibold">{KINDS[kind].label}</span>
                  <span className="text-[11px] text-muted">{KINDS[kind].blurb}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {channels.length === 0 && !adding ? (
          <div className="mt-3 rounded-lg border-2 border-dashed border-line p-6 text-center text-sm text-muted">
            ยังไม่มีช่องสัญญาณ — กด “เพิ่มช่อง” แล้วเลือกเครื่องดนตรีที่เสียบอยู่
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => {
            const Icon = KIND_ICON[channel.kind];
            const meter = meters[channel.id] ?? { peak: 0, clip: false };
            const isOpen = !!openIds[channel.id];
            return (
              <article key={channel.id} className={`rounded-xl border-2 p-3 ${isOpen ? "border-brass/70 bg-surface-2" : "border-line bg-surface-2/60"}`}>
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 border-black bg-brass text-white">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">ชื่อช่อง</span>
                    <input value={channel.name} maxLength={24} onChange={(e) => patchChannel(channel.id, { name: e.target.value })} className="h-9 w-full rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold hover:border-line focus:border-brass" />
                  </label>
                  <button
                    type="button"
                    onClick={() => void toggleOpen(channel)}
                    aria-pressed={isOpen}
                    className={`inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${isOpen ? "bg-olive text-black" : "border-2 border-line"}`}
                  >
                    <Power className="size-3.5" aria-hidden="true" />
                    {isOpen ? "เปิด" : "ปิด"}
                  </button>
                  <button type="button" aria-label={`ลบ ${channel.name}`} onClick={() => removeChannel(channel.id)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-danger">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Select
                    label="อุปกรณ์"
                    value={channel.deviceId}
                    onChange={(deviceId) => {
                      const next = { ...channel, deviceId };
                      patchChannel(channel.id, { deviceId });
                      void reopenIfOpen(next);
                    }}
                    options={[{ value: "default", label: "ค่าเริ่มต้น" }, ...devices.inputs.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => ({ value: d.deviceId, label: d.label || `อินพุต ${i + 1}` }))]}
                  />
                  <Select
                    label="ช่องของอุปกรณ์"
                    value={channel.channel}
                    onChange={(value) => {
                      const next = { ...channel, channel: value as ChannelState["channel"] };
                      patchChannel(channel.id, { channel: next.channel });
                      void reopenIfOpen(next);
                    }}
                    options={[
                      { value: "mix", label: "รวม (โมโน)" },
                      { value: "left", label: "ช่อง 1 / ซ้าย" },
                      { value: "right", label: "ช่อง 2 / ขวา" },
                    ]}
                  />
                </div>

                <div className="mt-2 flex rounded-lg border-2 border-line bg-bg p-0.5 text-xs font-semibold" role="radiogroup" aria-label="เส้นทางสัญญาณ">
                  {(
                    [
                      ["amp", "ผ่านแอมป์ & เอฟเฟค"],
                      ["direct", "ตรง (DI สะอาด)"],
                    ] as const
                  ).map(([route, label]) => (
                    <button
                      key={route}
                      type="button"
                      role="radio"
                      aria-checked={channel.route === route}
                      onClick={() => patchChannel(channel.id, { route })}
                      className={`h-8 flex-1 rounded-md ${channel.route === route ? "bg-brass text-white" : "text-muted"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-muted">
                    <span>สัญญาณเข้า {meter.clip ? <b className="text-danger">แตก! ลดเกน</b> : null}</span>
                    <span className="tabular-nums">{meter.peak > 0.0001 ? `${(20 * Math.log10(meter.peak)).toFixed(1)} dB` : "—"}</span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-bg" aria-hidden="true">
                    <div className={`h-full transition-[width] duration-75 ${meter.clip ? "bg-danger" : meter.peak > 0.7 ? "bg-amber" : "bg-olive"}`} style={{ width: `${Math.round(meter.peak * 100)}%` }} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap justify-between gap-2">
                  <Knob label="เกน" value={channel.gain} min={-12} max={30} step={1} size={40} display={`${channel.gain > 0 ? "+" : ""}${channel.gain} dB`} onChange={(gain) => patchChannel(channel.id, { gain })} />
                  <Knob label="ต่ำ" value={channel.low} min={-12} max={12} step={1} size={40} display={`${channel.low}`} onChange={(low) => patchChannel(channel.id, { low })} />
                  <Knob label="กลาง" value={channel.mid} min={-12} max={12} step={1} size={40} display={`${channel.mid}`} onChange={(mid) => patchChannel(channel.id, { mid })} />
                  <Knob label="สูง" value={channel.high} min={-12} max={12} step={1} size={40} display={`${channel.high}`} onChange={(high) => patchChannel(channel.id, { high })} />
                  <Knob label="คอมเพรส" value={channel.comp} size={40} display={`${Math.round(channel.comp * 100)}`} onChange={(comp) => patchChannel(channel.id, { comp })} />
                  <Knob label="แพน" value={channel.pan} min={-1} max={1} size={40} display={channel.pan === 0 ? "C" : channel.pan < 0 ? `L${Math.round(-channel.pan * 100)}` : `R${Math.round(channel.pan * 100)}`} onChange={(pan) => patchChannel(channel.id, { pan: Math.abs(pan) < 0.04 ? 0 : pan })} />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button type="button" aria-pressed={channel.mute} onClick={() => patchChannel(channel.id, { mute: !channel.mute })} className={`h-9 w-9 rounded-md text-xs font-bold ${channel.mute ? "bg-danger text-white" : "border-2 border-line"}`}>
                    M
                  </button>
                  <button type="button" aria-pressed={channel.solo} onClick={() => patchChannel(channel.id, { solo: !channel.solo })} className={`h-9 w-9 rounded-md text-xs font-bold ${channel.solo ? "bg-amber text-black" : "border-2 border-line"}`}>
                    S
                  </button>
                  <label className="flex flex-1 items-center gap-2 text-xs text-muted">
                    <span className="sr-only">เฟดเดอร์ {channel.name}</span>
                    <input type="range" min={0} max={1.2} step={0.01} value={channel.fader} onChange={(e) => patchChannel(channel.id, { fader: Number(e.target.value) })} className="flex-1" />
                    <span className="w-10 text-right tabular-nums">{channel.fader <= 0.001 ? "-∞" : `${(20 * Math.log10(channel.fader)).toFixed(0)}dB`}</span>
                  </label>
                </div>
                {errors[channel.id] ? (
                  <p role="alert" className="mt-2 text-xs text-danger">
                    {errors[channel.id]}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          ช่องที่เลือก “ผ่านแอมป์” จะใช้แอมป์และก้อนเอฟเฟกต์ที่ตั้งไว้ในหน้าแอมป์ · ถ้าเปิดไลน์อินในหน้าแอมป์ด้วย เสียงจะซ้อน ให้ใช้ทางใดทางหนึ่ง · ใส่หูฟังกันเสียงหอน
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* MIDI */}
        <section className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="title-rock text-3xl">MIDI</h2>
            {midiState !== "on" ? (
              <button type="button" onClick={() => void connectMidi()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brass px-3 text-sm font-semibold text-white">
                <Usb className="size-4" aria-hidden="true" />
                เชื่อมต่อ MIDI
              </button>
            ) : (
              <span className="text-xs text-olive">เชื่อมต่อแล้ว</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">คีย์บอร์ดใบ้ (USB/บลูทูธ MIDI), กลองไฟฟ้า, ฟุตคอนโทรลเลอร์ หรือพอร์ต MIDI เสมือนจากแอปอื่น</p>
          {midiState === "unsupported" ? (
            <p className="mt-2 rounded-md bg-surface-2 p-3 text-sm">
              เบราว์เซอร์นี้ยังไม่รองรับ MIDI (เช่น Safari บน iPhone) — ใช้แอป Android, Chrome หรือ Edge บนคอมพิวเตอร์ หรือต่อไลน์เอาต์ของเครื่องดนตรีเป็นช่องเสียงด้านบนแทน
            </p>
          ) : null}
          {midiState === "denied" ? <p className="mt-2 text-sm text-danger">ไม่ได้รับสิทธิ์ใช้ MIDI — อนุญาตในเบราว์เซอร์แล้วลองใหม่</p> : null}

          {midiState === "on" ? (
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <p className="mb-1 text-xs font-semibold text-muted">อุปกรณ์ขาเข้า</p>
                {midiIns.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {midiIns.map((input) => (
                      <li key={input.id} className="flex items-center gap-2 rounded-full border-2 border-line bg-surface-2 px-3 py-1 text-xs">
                        <span className={`h-2.5 w-2.5 rounded-full ${now - (activity[input.id] ?? 0) < 250 ? "bg-olive shadow-[0_0_8px_var(--color-olive)]" : "bg-line"}`} />
                        {input.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">ยังไม่พบอุปกรณ์ — เสียบสาย USB แล้วรอสักครู่</p>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select label="เสียงที่เล่น" value={saved.midiSound} onChange={(v) => patch((p) => ({ ...p, midiSound: v as InstrumentId }))} options={MIDI_SOUNDS.map((s) => ({ value: s.id, label: s.label }))} />
                <Select label="ส่ง MIDI ออกไปที่" value={saved.midiOut} onChange={(v) => patch((p) => ({ ...p, midiOut: v }))} options={[{ value: "", label: "ไม่ส่ง" }, ...midiOuts.map((o) => ({ value: o.id, label: o.name }))]} />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={saved.drums10} onChange={(e) => patch((p) => ({ ...p, drums10: e.target.checked }))} className="h-4 w-4 accent-[var(--color-brass)]" />
                  ช่อง 10 = กลอง (มาตรฐาน GM)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={saved.thru} onChange={(e) => patch((p) => ({ ...p, thru: e.target.checked }))} className="h-4 w-4 accent-[var(--color-brass)]" />
                  ส่งต่อ (MIDI thru)
                </label>
                <label className="flex min-w-[10rem] flex-1 items-center gap-2 text-xs text-muted">
                  ดังเสียง MIDI
                  <input type="range" min={0} max={1} step={0.01} value={saved.midiVol} onChange={(e) => patch((p) => ({ ...p, midiVol: Number(e.target.value) }))} className="flex-1" />
                </label>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted">ลูกบิด/ฟุตสวิตช์ MIDI (CC)</p>
                  <span className="text-[11px] text-muted">{lastCc}</span>
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {ccTargets.map((target) => {
                    const cc = ccFor(target.id);
                    const learning = learn === target.id;
                    return (
                      <li key={target.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2 py-1.5 text-sm">
                        <span className="truncate">{target.label}</span>
                        <button type="button" onClick={() => setLearn(learning ? null : target.id)} className={`h-8 shrink-0 rounded-md px-2 text-xs font-semibold ${learning ? "animate-pulse bg-amber text-black" : "border border-line"}`}>
                          {learning ? "ขยับลูกบิด…" : cc ? `CC ${cc.split(":")[1]} ·ช่อง ${cc.split(":")[0]}` : "เรียนรู้"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold text-muted">คีย์บอร์ดบนจอ (เล่นเสียงในแอป และส่งออก MIDI ถ้าเลือกไว้)</p>
            <PianoKeys from={48} octaves={2} held={held} onDown={keyDown} onUp={keyUp} />
          </div>
        </section>

        {/* Output + recording */}
        <section className="panel flex flex-col gap-4 p-4">
          <h2 className="title-rock text-3xl">เอาต์พุต & อัดเสียง</h2>
          <Select
            label={canPickOutput() ? "ส่งเสียงออกที่" : "ส่งเสียงออกที่ (เลือกจากระบบเครื่อง)"}
            value={settings.outputDeviceId}
            disabled={!canPickOutput()}
            onChange={(value) => {
              settings.set({ outputDeviceId: value });
              void sharedRig().setOutputDevice(value);
            }}
            options={[{ value: "default", label: "ค่าเริ่มต้นของระบบ" }, ...devices.outputs.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => ({ value: d.deviceId, label: d.label || `เอาต์พุต ${i + 1}` }))]}
          />
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="w-24">มิกเซอร์รวม</span>
            <input type="range" min={0} max={1.2} step={0.01} value={saved.mix} onChange={(e) => patch((p) => ({ ...p, mix: Number(e.target.value) }))} className="flex-1" />
          </label>
          <div>
            <div className="flex justify-between text-[11px] text-muted">
              <span>สัญญาณออกรวม</span>
              <span className="tabular-nums">{outPeak > 0.0001 ? `${(20 * Math.log10(outPeak)).toFixed(1)} dB` : "—"}</span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-bg" aria-hidden="true">
              <div className={`h-full transition-[width] duration-75 ${outPeak > 0.95 ? "bg-danger" : outPeak > 0.7 ? "bg-amber" : "bg-olive"}`} style={{ width: `${Math.round(Math.min(1, outPeak) * 100)}%` }} />
            </div>
          </div>

          <div className="rounded-lg border-2 border-line bg-surface-2 p-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void toggleRecord()}
                aria-pressed={recording}
                className={`grid h-14 w-14 place-items-center rounded-full border-4 ${recording ? "border-danger" : "border-fg"}`}
                aria-label={recording ? "หยุดอัด" : "เริ่มอัด"}
              >
                {recording ? <Square className="size-5 fill-danger text-danger" aria-hidden="true" /> : <Circle className="size-7 fill-danger text-danger" aria-hidden="true" />}
              </button>
              <div>
                <p className="font-semibold">{recording ? "กำลังอัด…" : "อัดเสียงทั้งหมดที่เล่น"}</p>
                <p className="text-xs tabular-nums text-muted">
                  {recording ? `${Math.floor(recClock / 60)}:${String(Math.floor(recClock % 60)).padStart(2, "0")}` : "แอมป์ + ทุกช่อง + MIDI + เพลงประกอบ"}
                </p>
              </div>
            </div>
            {take ? (
              <div className="mt-3 flex flex-col gap-2">
                <audio src={take.url} controls className="w-full" />
                <div className="flex flex-wrap gap-2">
                  <a href={take.url} download={take.name} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brass px-3 text-sm font-semibold text-white">
                    <Download className="size-4" aria-hidden="true" />
                    ดาวน์โหลด
                  </a>
                  <button type="button" onClick={() => void shareTake()} className="inline-flex h-10 items-center gap-2 rounded-lg border-2 border-line px-3 text-sm font-semibold">
                    <Share2 className="size-4" aria-hidden="true" />
                    ส่งไปแอปอื่น
                  </button>
                </div>
              </div>
            ) : null}
            {notice ? <p className="mt-2 text-xs text-muted">{notice}</p> : null}
          </div>
        </section>
      </div>

      {/* How to connect */}
      <section className="panel p-4">
        <h2 className="title-rock text-3xl">ต่ออย่างไรดี</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Guide icon={Guitar} title="กีตาร์ / เบส">
            ใช้ออดิโออินเทอร์เฟซที่มีช่อง Hi-Z (หรือ iRig/อะแดปเตอร์กีตาร์) ต่อ USB-C / Lightning เข้ามือถือ หรือ USB เข้าคอม → เพิ่มช่อง “กีตาร์ไฟฟ้า” แล้วเลือกผ่านแอมป์
          </Guide>
          <Guide icon={KeyboardMusic} title="คีย์บอร์ด">
            มีพอร์ต USB-MIDI: เสียบแล้วกด “เชื่อมต่อ MIDI” ใช้เสียงในแอปได้เลย · ถ้าอยากใช้เสียงของคีย์บอร์ดเอง: ต่อ Line Out เข้าอินเทอร์เฟซ เพิ่มช่อง “คีย์บอร์ด”
          </Guide>
          <Guide icon={Drum} title="กลองไฟฟ้า">
            USB-MIDI → เชื่อมต่อ MIDI (เปิด “ช่อง 10 = กลอง”) · หรือ Line/Phones Out เข้าอินเทอร์เฟซ เพิ่มช่อง “กลองไฟฟ้า” · กลองชุดจริงใช้ไมค์เป็นช่อง “ร้อง/ไมค์”
          </Guide>
          <Guide icon={Mic} title="ร้อง / กีตาร์โปร่ง">
            ไมค์ USB หรือไมค์ XLR ผ่านอินเทอร์เฟซ (ไมค์คอนเดนเซอร์ต้องเปิด 48V ที่อินเทอร์เฟซ) เลือกช่องให้ตรงกับช่องที่เสียบ
          </Guide>
          <Guide icon={Cable} title="รับ-ส่งกับแอปอื่น (DAW)">
            บนคอม: ติดตั้งสายเสมือน (เช่น BlackHole บน Mac, VB-Cable บน Windows) แล้วเลือกเป็นเอาต์พุตหรืออินพุตที่นี่ · MIDI: ใช้พอร์ตเสมือน (IAC/loopMIDI) ในช่อง “ส่ง MIDI ออก” · บนมือถือ: อัดแล้วกด “ส่งไปแอปอื่น”
          </Guide>
          <Guide icon={Headphones} title="หูฟัง / มอนิเตอร์">
            ใช้หูฟังมีสายหรือเสียบที่ช่องหูฟังของอินเทอร์เฟซ ดีเลย์ต่ำสุด · หูฟังบลูทูธหน่วง 150–300 ms ไม่เหมาะเล่นสด
          </Guide>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          มือถือส่วนใหญ่เปิดอุปกรณ์เสียงขาเข้าได้ทีละตัว ใช้อินเทอร์เฟซหลายช่องแล้วแยกด้วย “ช่องของอุปกรณ์” · MIDI ใช้ได้บน Android, Chrome/Edge บนคอม (ยังไม่รองรับ iPhone)
        </p>
      </section>
    </main>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border-2 border-line bg-surface px-3 py-1 font-semibold">{children}</span>;
}

function Select({
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
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
      {label}
      <select
        value={options.some((o) => o.value === value) ? value : options[0]?.value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 min-w-0 rounded-md border-2 border-line bg-bg px-2 text-sm text-fg"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Guide({ icon: Icon, title, children }: { icon: typeof Guitar; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-brass" aria-hidden="true" />
        {title}
      </p>
      <p className="mt-1 text-xs text-muted">{children}</p>
    </div>
  );
}

const BLACK = new Set([1, 3, 6, 8, 10]);

function PianoKeys({ from, octaves, held, onDown, onUp }: { from: number; octaves: number; held: number[]; onDown: (n: number) => void; onUp: (n: number) => void }) {
  const notes = Array.from({ length: octaves * 12 + 1 }, (_, i) => from + i);
  const whites = notes.filter((n) => !BLACK.has(n % 12));
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return (
    <div className="relative h-28 select-none overflow-hidden rounded-lg border-2 border-black" style={{ touchAction: "none" }}>
      <div className="flex h-full">
        {whites.map((note) => (
          <button
            key={note}
            type="button"
            aria-label={`${names[note % 12]}${Math.floor(note / 12) - 1}`}
            onPointerDown={(e) => {
              (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
              onDown(note);
            }}
            onPointerUp={() => onUp(note)}
            onPointerLeave={() => held.includes(note) && onUp(note)}
            className={`flex-1 border-r border-black/40 ${held.includes(note) ? "bg-brass" : "bg-[#f4f1ea]"}`}
          />
        ))}
      </div>
      {notes
        .filter((n) => BLACK.has(n % 12))
        .map((note) => {
          const whiteIndex = whites.filter((w) => w < note).length;
          const left = (whiteIndex / whites.length) * 100;
          return (
            <button
              key={note}
              type="button"
              aria-label={`${names[note % 12]}${Math.floor(note / 12) - 1}`}
              onPointerDown={() => onDown(note)}
              onPointerUp={() => onUp(note)}
              onPointerLeave={() => held.includes(note) && onUp(note)}
              className={`absolute top-0 h-[60%] -translate-x-1/2 rounded-b-md border border-black ${held.includes(note) ? "bg-brass" : "bg-[#111]"}`}
              style={{ left: `${left}%`, width: `${(100 / whites.length) * 0.62}%` }}
            />
          );
        })}
    </div>
  );
}
