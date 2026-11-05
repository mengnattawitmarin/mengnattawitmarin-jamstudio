import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { MessageSquare, Send, Share2, UserPlus } from "lucide-react";
import { useSettings, getSettings } from "@/lib/settings";
import {
  AudioLines,
  Copy,
  Drum,
  Guitar,
  Headphones,
  KeyboardMusic,
  Mic,
  Minus,
  Piano,
  Plus,
  Timer,
  Waves,
} from "lucide-react";
import {
  INSTRUMENTS,
  JamSynth,
  baseMidiFor,
  instrumentName,
  isInstrumentId,
  type InstrumentId,
} from "@/lib/audio/jam-synth";
import { P2PRoom, type PeerInfo } from "@/lib/multiplayer";

const ICONS = {
  piano: Piano,
  rhodes: KeyboardMusic,
  bass: Waves,
  guitar: Guitar,
  drums: Drum,
  lead: AudioLines,
  pad: Waves,
} as const;

const KEY_MAP = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", ";"];
const DRUM_KEYS: Record<string, number> = { a: 0, s: 1, d: 2, f: 3, g: 4, h: 5, " ": 0 };
const PADS = [
  { n: 0, name: "เตะ", hint: "A" },
  { n: 1, name: "สแนร์", hint: "S" },
  { n: 2, name: "แฮท", hint: "D" },
  { n: 3, name: "เปิด", hint: "F" },
  { n: 4, name: "ทอม", hint: "G" },
  { n: 5, name: "แคลป", hint: "H" },
];
const STRINGS = [
  { name: "e", open: 64 },
  { name: "B", open: 59 },
  { name: "G", open: 55 },
  { name: "D", open: 50 },
  { name: "A", open: 45 },
  { name: "E", open: 40 },
];
const KEYS = [
  { name: "C", pc: 0 },
  { name: "D", pc: 2 },
  { name: "E", pc: 4 },
  { name: "F", pc: 5 },
  { name: "G", pc: 7 },
  { name: "A", pc: 9 },
  { name: "Bb", pc: 10 },
];
const DEGREES = [
  { roman: "I", minor: false, step: 0 },
  { roman: "ii", minor: true, step: 2 },
  { roman: "iii", minor: true, step: 4 },
  { roman: "IV", minor: false, step: 5 },
  { roman: "V", minor: false, step: 7 },
  { roman: "vi", minor: true, step: 9 },
];
const PC_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

type Who = "me" | "peer";
type Wire =
  | { k: "on"; i: InstrumentId; n: number; v: number }
  | { k: "off"; i: InstrumentId; n: number }
  | { k: "held"; i: InstrumentId; n: number[] }
  | { k: "who"; name: string; i: InstrumentId };

function parseWire(data: unknown): Wire | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  if (typeof msg.i !== "string" || !isInstrumentId(msg.i)) return null;
  if (msg.k === "on" && typeof msg.n === "number") {
    return { k: "on", i: msg.i, n: msg.n, v: typeof msg.v === "number" ? msg.v : 0.8 };
  }
  if (msg.k === "off" && typeof msg.n === "number") return { k: "off", i: msg.i, n: msg.n };
  if (msg.k === "held" && Array.isArray(msg.n)) {
    return { k: "held", i: msg.i, n: msg.n.filter((n) => typeof n === "number") };
  }
  if (msg.k === "who" && typeof msg.name === "string") return { k: "who", name: msg.name.slice(0, 32), i: msg.i };
  return null;
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function chordNotes(rootPc: number, step: number, minor: boolean): number[] {
  const root = (rootPc + step) % 12;
  const third = (root + (minor ? 3 : 4)) % 12;
  const fifth = (root + 7) % 12;
  const notes: number[] = [];
  let cursor = 40;
  for (const pc of [root, third, fifth, root]) {
    while (cursor % 12 !== pc) cursor += 1;
    notes.push(cursor);
    cursor += 1;
  }
  return notes;
}

function chordLabel(rootPc: number, step: number, minor: boolean): string {
  return `${PC_NAMES[(rootPc + step) % 12]}${minor ? "m" : ""}`;
}

type ChatLine = { id: string; from: string; name: string; text: string; at: number; mine: boolean };

export function JamRoom({
  active = true,
  onStatus,
}: {
  active?: boolean;
  onStatus?: (inRoom: boolean, online: number, leave: () => void) => void;
}) {
  const savedName = useSettings((state) => state.name);
  const setSettings = useSettings((state) => state.set);
  const [name, setName] = useState(savedName);
  const [draft, setDraft] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const [player, setPlayer] = useState("นักดนตรี");

  useEffect(() => setName(savedName), [savedName]);

  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get("room");
      if (code && /^[A-Za-z0-9]{4}$/.test(code)) setDraft(code.toUpperCase());
    } catch {
      // no URL params
    }
  }, []);

  useEffect(() => {
    if (!room) onStatus?.(false, 0, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  function enter(code: string) {
    const clean = name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 32) || "นักดนตรี";
    setSettings({ name: clean });
    setPlayer(clean);
    setRoom(`jam-${code.toUpperCase()}`);
  }

  if (room) {
    return (
      <Session
        key={`${room}:${player}`}
        room={room}
        name={player}
        active={active}
        onCount={(online) => onStatus?.(true, online, () => setRoom(null))}
        onLeave={() => setRoom(null)}
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <section className="max-w-xl">
        <p className="tape text-sm">ห้องซ้อมออนไลน์</p>
        <h1 className="title-rock mt-2 text-5xl sm:text-6xl">แจมกัน โดยเสียงคุณไมดีเลย์</h1>
        <p className="mt-4 text-base text-muted">
          เลือกเครื่องบนจอแล้วเล่นได้ทันทีในเครื่องนี้ โน้ตเดินทางตรงถึงเพื่อน ไม่ผ่านเซิร์ฟเวอร์เสียง
          ถ้าเสียบกีตาร์หรือคีย์บอร์ดเข้าไมค์ ให้เปิดไลน์อิน ใช้หูฟัง เสียงจริงจะถูกส่งแบบบัฟเฟอร์สั้นสุด
        </p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <form
          className="flex flex-col gap-3 panel p-4"
          onSubmit={(event) => {
            event.preventDefault();
            enter(makeCode());
          }}
        >
          <label className="text-sm font-medium" htmlFor="jam-name">
            ชื่อในห้อง
            <input
              id="jam-name"
              value={name}
              maxLength={32}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-12 w-full rounded-md border border-line bg-surface-2 px-3 text-base"
            />
          </label>
          <button type="submit" className="h-12 rounded-md bg-brass text-sm font-semibold text-brass-ink">
            สร้างห้องซ้อม
          </button>
        </form>
        <form
          className="flex flex-col gap-3 panel p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const code = draft.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
            if (code.length === 4) enter(code);
          }}
        >
          <label className="text-sm font-medium" htmlFor="jam-code">
            มีรหัสอยู่แล้ว
            <input
              id="jam-code"
              value={draft}
              inputMode="text"
              autoCapitalize="characters"
              placeholder="เช่น K7MQ"
              maxLength={6}
              onChange={(event) => setDraft(event.target.value.toUpperCase())}
              className="mt-2 h-12 w-full rounded-md border border-line bg-surface-2 px-3 text-base tracking-widest"
            />
          </label>
          <button type="submit" className="h-12 rounded-md border border-line bg-surface-2 text-sm font-semibold">
            เข้าห้องนี้
          </button>
        </form>
      </section>
      <ul className="grid gap-3 sm:grid-cols-3">
        <li className="panel p-4 text-sm">
          <Piano className="size-5 text-brass" aria-hidden="true" />
          <p className="mt-3 font-semibold">เครื่องบนจอ</p>
          <p className="mt-1 text-muted">เปียโน เบส กีตาร์ กลอง ลีด สัมผัสแล้วได้ยินทันที</p>
        </li>
        <li className="panel p-4 text-sm">
          <Mic className="size-5 text-brass" aria-hidden="true" />
          <p className="mt-3 font-semibold">ไลน์อินเครื่องจริง</p>
          <p className="mt-1 text-muted">มอนิเตอร์ในหูคุณตรง ๆ เพื่อนได้ยินผ่านเส้นตรง</p>
        </li>
        <li className="panel p-4 text-sm">
          <Timer className="size-5 text-brass" aria-hidden="true" />
          <p className="mt-3 font-semibold">คลิกไม่เดินทาง</p>
          <p className="mt-1 text-muted">เมโทรนอมอยู่ในเครื่องคุณ จังหวะจึงไม่ตามหลังเน็ต</p>
        </li>
      </ul>
    </main>
  );
}

function Session({
  room,
  name,
  active,
  onCount,
  onLeave,
}: {
  room: string;
  name: string;
  active: boolean;
  onCount: (online: number) => void;
  onLeave: () => void;
}) {
  const code = room.slice(4);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const chatEnd = useRef<HTMLDivElement>(null);
  const synthRef = useRef<JamSynth | null>(null);
  const p2pRef = useRef<P2PRoom | null>(null);
  const instRef = useRef<InstrumentId>("piano");
  const heldRef = useRef<Set<number>>(new Set());
  const remoteHeld = useRef<Map<string, Set<number>>>(new Map());
  const remoteGain = useRef<Map<string, { gain: GainNode; src: MediaStreamAudioSourceNode }>>(new Map());
  const liveRef = useRef<{ stream: MediaStream; gain: GainNode; analyser: AnalyserNode; src: MediaStreamAudioSourceNode } | null>(null);
  const pointers = useRef<Map<number, number>>(new Map());

  const [instrument, setInstrument] = useState<InstrumentId>("piano");
  const [selfId] = useState(() => `p-${Math.random().toString(36).slice(2, 10)}`);
  const [octave, setOctave] = useState(0);
  const [pressed, setPressed] = useState<Record<number, Who>>({});
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [roles, setRoles] = useState<Record<string, InstrumentId>>({});
  const [heard, setHeard] = useState<Record<string, number>>({});
  const [joined, setJoined] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [liveOn, setLiveOn] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [monitor, setMonitor] = useState(0.8);
  const [level, setLevel] = useState(0);
  const [bpm, setBpm] = useState(96);
  const [clickOn, setClickOn] = useState(false);
  const [guitarKey, setGuitarKey] = useState(0);
  const [levelSelf, setLevelSelf] = useState(0.9);

  instRef.current = instrument;

  useEffect(() => {
    const synth = new JamSynth();
    synthRef.current = synth;
    const p2p = new P2PRoom({
      room,
      selfId,
      name,
      onConnected: () => setJoined(true),
      onPeersChanged: (next) => {
        setPeers(next);
        const alive = new Set(next.map((peer) => peer.id));
        for (const peerId of remoteHeld.current.keys()) {
          if (!alive.has(peerId)) {
            synth.releasePeer(peerId);
            remoteHeld.current.delete(peerId);
          }
        }
        for (const [peerId, node] of remoteGain.current) {
          if (!alive.has(peerId)) {
            node.src.disconnect();
            node.gain.disconnect();
            remoteGain.current.delete(peerId);
          }
        }
      },
      onRemoteStream: (from, stream) => {
        try {
          const prev = remoteGain.current.get(from);
          prev?.src.disconnect();
          prev?.gain.disconnect();
          remoteGain.current.delete(from);
          if (!stream) return;
          const src = synth.ctx.createMediaStreamSource(stream);
          const gain = synth.ctx.createGain();
          gain.gain.value = 0.9;
          src.connect(gain);
          gain.connect(synth.ctx.destination);
          remoteGain.current.set(from, { gain, src });
        } catch {
          // A replaced track can end before the next one arrives.
        }
      },
      onMessage: (from, data) => {
        if (data && typeof data === "object" && (data as { k?: unknown }).k === "chat") {
          const raw = data as { text?: unknown; name?: unknown; at?: unknown };
          if (typeof raw.text !== "string") return;
          const text = raw.text.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 500);
          if (!text) return;
          setChat((prev) => [
            ...prev.slice(-199),
            {
              id: `${from}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              from,
              name: typeof raw.name === "string" ? raw.name.slice(0, 32) : "เพื่อน",
              text,
              at: Date.now(),
              mine: false,
            },
          ]);
          setUnread((n) => n + 1);
          return;
        }
        const msg = parseWire(data);
        if (!msg) return;
        if (msg.k === "who") {
          setRoles((prev) => ({ ...prev, [from]: msg.i }));
          return;
        }
        flash(from);
        if (msg.k === "on") {
          void synth.resume().then(() => synth.noteOn(from, msg.i, msg.n, msg.v));
          if (msg.i === instRef.current) light(msg.n, "peer", true);
          if (msg.i === "drums" || msg.i === "guitar") {
            window.setTimeout(() => {
              if (instRef.current === msg.i) light(msg.n, "peer", false);
            }, msg.i === "drums" ? 120 : 240);
          } else {
            const set = remoteHeld.current.get(from) ?? new Set<number>();
            set.add(msg.n);
            remoteHeld.current.set(from, set);
          }
          return;
        }
        if (msg.k === "off") {
          synth.noteOff(from, msg.i, msg.n);
          if (msg.i === instRef.current) light(msg.n, "peer", false);
          remoteHeld.current.get(from)?.delete(msg.n);
          return;
        }
        const prev = remoteHeld.current.get(from) ?? new Set<number>();
        const next = new Set(msg.n);
        for (const note of prev) {
          if (!next.has(note)) synth.noteOff(from, msg.i, note);
        }
        remoteHeld.current.set(from, next);
      },
    });
    p2pRef.current = p2p;
    void p2p.join();
    const latencyTimer = window.setInterval(() => setLatency(synth.outputLatencyMs()), 1000);
    const heldTimer = window.setInterval(() => {
      const inst = instRef.current;
      if (inst === "drums" || inst === "guitar") return;
      p2p.send({ k: "held", i: inst, n: [...heldRef.current] });
    }, 500);
    return () => {
      window.clearInterval(latencyTimer);
      window.clearInterval(heldTimer);
      p2p.close();
      stopLive();
      synth.close();
      synthRef.current = null;
      p2pRef.current = null;
    };
    // Room, name, and selfId are fixed for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, name, selfId]);

  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;
    synth.setMetronome(clickOn ? bpm : null);
  }, [clickOn, bpm]);

  useEffect(() => {
    const live = liveRef.current;
    if (!live) return;
    live.gain.gain.value = monitor;
  }, [monitor]);

  useEffect(() => {
    synthRef.current?.setLevel(levelSelf);
  }, [levelSelf]);

  useEffect(() => {
    if (!liveOn) return;
    const timer = window.setInterval(() => {
      const analyser = liveRef.current?.analyser;
      if (!analyser) return;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const sample = (value - 128) / 128;
        sum += sample * sample;
      }
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
    }, 80);
    return () => window.clearInterval(timer);
  }, [liveOn]);

  const linked = peers
    .filter((peer) => peer.connectionState === "connected")
    .map((peer) => peer.id)
    .join(",");

  useEffect(() => {
    p2pRef.current?.send({ k: "who", name, i: instrument });
  }, [instrument, name, linked]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat || !activeRef.current) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const inst = instRef.current;
      if (inst === "drums") {
        const pad = DRUM_KEYS[event.key.toLowerCase()];
        if (pad == null && event.code !== "Space") return;
        event.preventDefault();
        strike(pad ?? 0, 0.9);
        return;
      }
      if (inst === "guitar") {
        const index = Number(event.key) - 1;
        if (index >= 0 && index < DEGREES.length) {
          event.preventDefault();
          strum(index);
        }
        return;
      }
      const index = KEY_MAP.indexOf(event.key.toLowerCase());
      if (index < 0) return;
      event.preventDefault();
      const note = baseMidiFor(inst) + octave * 12 + index;
      attack(note, 0.84);
    };
    const up = (event: KeyboardEvent) => {
      const inst = instRef.current;
      if (inst === "drums" || inst === "guitar") return;
      const index = KEY_MAP.indexOf(event.key.toLowerCase());
      if (index < 0) return;
      const note = baseMidiFor(inst) + octave * 12 + index;
      release(note);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [octave]);

  function flash(id: string) {
    setHeard((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    window.setTimeout(() => {
      setHeard((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 1) - 1) }));
    }, 140);
  }

  function light(note: number, who: Who, on: boolean) {
    setPressed((prev) => {
      const next = { ...prev };
      if (on) {
        if (who === "me" || next[note] !== "me") next[note] = who;
        return next;
      }
      if (next[note] === who || who === "me") delete next[note];
      return next;
    });
  }

  function attack(note: number, velocity: number) {
    const synth = synthRef.current;
    const inst = instRef.current;
    if (!synth || heldRef.current.has(note)) return;
    heldRef.current.add(note);
    light(note, "me", true);
    const go = () => {
      if (!heldRef.current.has(note)) return;
      synth.noteOn("me", inst, note, velocity);
      p2pRef.current?.broadcast({ k: "on", i: inst, n: note, v: velocity });
    };
    if (synth.ctx.state === "running") go();
    else void synth.resume().then(go);
  }

  function release(note: number) {
    const inst = instRef.current;
    if (!heldRef.current.has(note)) return;
    heldRef.current.delete(note);
    synthRef.current?.noteOff("me", inst, note);
    light(note, "me", false);
    p2pRef.current?.broadcast({ k: "off", i: inst, n: note });
  }

  function strike(pad: number, velocity: number) {
    const synth = synthRef.current;
    if (!synth) return;
    const go = () => {
      synth.noteOn("me", "drums", pad, velocity);
      light(pad, "me", true);
      window.setTimeout(() => light(pad, "me", false), 120);
      p2pRef.current?.broadcast({ k: "on", i: "drums", n: pad, v: velocity });
    };
    if (synth.ctx.state === "running") go();
    else void synth.resume().then(go);
  }

  function strum(index: number) {
    const degree = DEGREES[index];
    if (!degree) return;
    const notes = chordNotes(guitarKey, degree.step, degree.minor);
    notes.forEach((note, order) => {
      window.setTimeout(() => attackGuitar(note, 0.7 + order * 0.05), order * 16);
    });
  }

  function attackGuitar(note: number, velocity: number) {
    const synth = synthRef.current;
    if (!synth) return;
    const go = () => {
      synth.noteOn("me", "guitar", note, velocity);
      light(note, "me", true);
      window.setTimeout(() => light(note, "me", false), 220);
      p2pRef.current?.broadcast({ k: "on", i: "guitar", n: note, v: velocity });
    };
    if (synth.ctx.state === "running") go();
    else void synth.resume().then(go);
  }

  function chooseInstrument(next: InstrumentId) {
    for (const note of [...heldRef.current]) release(note);
    setPressed({});
    setOctave(0);
    setInstrument(next);
  }

  async function toggleLive() {
    if (liveRef.current) {
      stopLive();
      setLiveOn(false);
      setLevel(0);
      p2pRef.current?.setLocalStream(null);
      return;
    }
    const synth = synthRef.current;
    if (!synth) return;
    setLiveError("");
    try {
      await synth.resume();
      const prefs = getSettings();
      const audio: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      };
      if (prefs.inputDeviceId && prefs.inputDeviceId !== "default") audio.deviceId = { exact: prefs.inputDeviceId };
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      const src = synth.ctx.createMediaStreamSource(stream);
      const analyser = synth.ctx.createAnalyser();
      analyser.fftSize = 512;
      const gain = synth.ctx.createGain();
      gain.gain.value = monitor;
      src.connect(analyser);
      analyser.connect(gain);
      gain.connect(synth.ctx.destination);
      liveRef.current = { stream, gain, analyser, src };
      p2pRef.current?.setLocalStream(stream);
      setLiveOn(true);
    } catch {
      setLiveError("เปิดอินพุตไม่ได้ ตรวจสิทธิ์ไมค์หรือว่ามีอุปกรณ์ต่ออยู่");
      setLiveOn(false);
    }
  }

  function stopLive() {
    const live = liveRef.current;
    if (!live) return;
    live.stream.getTracks().forEach((track) => track.stop());
    live.src.disconnect();
    live.gain.disconnect();
    liveRef.current = null;
  }

  const base = baseMidiFor(instrument) + octave * 12;
  const connected = peers.filter((peer) => peer.connectionState === "connected").length;

  useEffect(() => {
    onCount(1 + connected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [chat.length]);

  function sendChat() {
    const text = chatDraft.trim().slice(0, 500);
    if (!text) return;
    p2pRef.current?.send({ k: "chat", text, name });
    setChat((prev) => [...prev.slice(-199), { id: `me-${Date.now()}`, from: selfId, name, text, at: Date.now(), mine: true }]);
    setChatDraft("");
    setUnread(0);
  }

  async function invite() {
    const url = typeof window !== "undefined" && window.location.protocol.startsWith("http") ? `${window.location.origin}${window.location.pathname}?room=${code}` : "";
    const text = `มาแจมกันใน Kakunstudio! รหัสห้อง ${code}${url ? `\n${url}` : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: "Kakunstudio", text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }
    } catch {
      // user cancelled share
    }
  }

  const members = [
    { id: selfId, name: `${name}`, me: true, inst: instrumentName(instrument), lvl: liveOn ? level : Object.keys(pressed).length ? 0.6 : 0, rtt: null as number | null, state: "connected" as RTCPeerConnectionState | "connected" },
    ...peers.map((peer) => ({
      id: peer.id,
      name: peer.name || "เพื่อน",
      me: false,
      inst: roles[peer.id] ? instrumentName(roles[peer.id]) : "กำลังเข้า",
      lvl: (heard[peer.id] ?? 0) > 0 ? 0.75 : 0,
      rtt: peer.rttMs,
      state: peer.connectionState as RTCPeerConnectionState | "connected",
    })),
  ];

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <section className="panel p-3">
          <h2 className="px-1 text-base font-semibold">ห้องซ้อมออนไลน์</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: avatarColor(member.id) }}>
                  {member.name.slice(0, 1).toUpperCase()}
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${member.state === "connected" ? "bg-olive" : "bg-amber"}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {member.me ? `${member.name} (คุณ)` : member.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {member.inst}
                    {member.rtt != null ? ` · ${member.rtt} ms` : ""}
                  </span>
                </span>
                <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
                  {[0.15, 0.3, 0.45, 0.6, 0.75].map((t, i) => (
                    <span key={t} className="meter-bar" data-on={member.lvl >= t} style={{ height: `${6 + i * 2.5}px` }} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void invite()} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 text-sm font-medium">
            <UserPlus className="size-4" aria-hidden="true" />
            {copied ? "คัดลอกคำเชิญแล้ว" : "เชิญเพื่อน"}
            <Share2 className="size-3.5 text-muted" aria-hidden="true" />
          </button>
        </section>

        <section className="panel flex max-h-[26rem] flex-col p-3" onFocus={() => setUnread(0)}>
          <h2 className="flex items-center gap-2 px-1 text-base font-semibold">
            <MessageSquare className="size-4" aria-hidden="true" />
            แชท
            {unread > 0 ? <span className="rounded-full bg-brass px-1.5 text-xs text-brass-ink">{unread}</span> : null}
          </h2>
          <div className="mt-2 min-h-24 flex-1 overflow-y-auto pr-1" aria-live="polite">
            {chat.length === 0 ? <p className="px-1 py-4 text-center text-xs text-muted">ยังไม่มีข้อความ ทักทายเพื่อนได้เลย</p> : null}
            <ul className="flex flex-col gap-2">
              {chat.map((line) => (
                <li key={line.id} className="flex gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: avatarColor(line.from) }}>
                    {line.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-xs font-semibold ${line.mine ? "text-fg" : "text-brass"}`}>{line.mine ? "คุณ" : line.name}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted">
                        {new Date(line.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </span>
                    <span className="block break-words text-sm">{line.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div ref={chatEnd} />
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              sendChat();
            }}
          >
            <label className="sr-only" htmlFor="chat-input">
              พิมพ์ข้อความ
            </label>
            <input
              id="chat-input"
              value={chatDraft}
              maxLength={500}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder="พิมพ์ข้อความ..."
              className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 text-sm"
            />
            <button type="submit" aria-label="ส่ง" className="grid h-10 w-10 place-items-center rounded-lg bg-brass text-brass-ink">
              <Send className="size-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
      <section className="flex flex-wrap items-center gap-2">
        <p className="rounded-md bg-brass px-3 py-2 text-lg font-semibold tracking-widest text-brass-ink tabular-nums">{code}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }).catch(() => setCopied(false));
          }}
          className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm"
        >
          <Copy className="size-4" aria-hidden="true" />
          {copied ? "คัดลอกแล้ว" : "คัดลอกรหัส"}
        </button>
        <p className="text-sm text-muted" aria-live="polite">
          {joined ? (connected > 0 ? `เส้นตรงถึง ${connected} คน` : "รอเพื่อนใส่รหัสนี้") : "กำลังเปิดห้อง"}
          {latency != null ? ` · เสียงคุณในเครื่อง ${latency} ms` : ""}
        </p>
        <button type="button" onClick={onLeave} className="ml-auto h-11 rounded-md border border-line bg-surface px-3 text-sm">
          ออกจากห้อง
        </button>
      </section>

      <section className="flex flex-wrap gap-2" aria-label="คนในห้อง">
        <PeerChip name={`${name} · คุณ`} detail={instrumentName(instrument)} live={false} rtt={null} state="connected" />
        {peers.map((peer) => (
          <PeerChip
            key={peer.id}
            name={peer.name || "เพื่อน"}
            detail={roles[peer.id] ? instrumentName(roles[peer.id]) : "กำลังเข้า"}
            live={(heard[peer.id] ?? 0) > 0}
            rtt={peer.rttMs}
            state={peer.connectionState}
          />
        ))}
        {peers.length === 0 ? <p className="self-center text-sm text-muted">ยังมีแค่คุณ เล่นซ้อมไปก่อนได้</p> : null}
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="เครื่องดนตรี">
        {INSTRUMENTS.map((item) => {
          const Icon = ICONS[item.id];
          const on = instrument === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => chooseInstrument(item.id)}
              className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium ${on ? "bg-brass text-brass-ink" : "border border-line bg-surface"}`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.name}
            </button>
          );
        })}
      </div>

      {instrument === "drums" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PADS.map((pad) => (
            <button
              key={pad.n}
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                strike(pad.n, 0.75 + Math.random() * 0.25);
              }}
              className={`flex h-24 flex-col items-center justify-center rounded-lg border text-base font-semibold ${pressed[pad.n] ? "border-brass bg-brass text-brass-ink" : "border-line bg-surface"}`}
            >
              {pad.name}
              <span className="mt-1 text-xs font-normal opacity-70">{pad.hint}</span>
            </button>
          ))}
        </div>
      ) : null}

      {instrument === "guitar" ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto">
            {KEYS.map((key) => (
              <button
                key={key.name}
                type="button"
                onClick={() => setGuitarKey(key.pc)}
                className={`h-11 shrink-0 rounded-md px-3 text-sm ${guitarKey === key.pc ? "bg-brass text-brass-ink" : "border border-line bg-surface"}`}
              >
                คีย์ {key.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {DEGREES.map((degree, index) => (
              <button
                key={degree.roman}
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  strum(index);
                }}
                className="flex h-16 flex-col items-center justify-center rounded-lg border border-line bg-surface"
              >
                <span className="text-base font-semibold">{chordLabel(guitarKey, degree.step, degree.minor)}</span>
                <span className="text-xs text-muted">{index + 1}</span>
              </button>
            ))}
          </div>
          <Fretboard pressed={pressed} onPluck={(note) => attackGuitar(note, 0.8)} />
        </div>
      ) : null}

      {instrument !== "drums" && instrument !== "guitar" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="ลดอ็อกเทฟ" onClick={() => setOctave((value) => Math.max(-2, value - 1))} className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface">
              <Minus className="size-4" />
            </button>
            <p className="min-w-16 text-center text-sm tabular-nums">{octave > 0 ? `+${octave}` : octave} oct</p>
            <button type="button" aria-label="เพิ่มอ็อกเทฟ" onClick={() => setOctave((value) => Math.min(2, value + 1))} className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface">
              <Plus className="size-4" />
            </button>
            <p className="hidden text-xs text-muted sm:block">กด A W S E D F ไล่โน้ต กดลากนิ้วเพื่อกลิส</p>
          </div>
          <Keyboard
            base={base}
            pressed={pressed}
            onDown={(note, velocity) => attack(note, velocity)}
            onUp={(note) => release(note)}
            pointers={pointers}
          />
        </div>
      ) : null}

      <section className="grid gap-3 panel p-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={clickOn}
              onClick={() => setClickOn((value) => !value)}
              className={`inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm ${clickOn ? "bg-brass text-brass-ink" : "border border-line bg-surface-2"}`}
            >
              <Timer className="size-4" aria-hidden="true" />
              คลิก
            </button>
            <button type="button" aria-label="ลดเทมโป" onClick={() => setBpm((value) => Math.max(60, value - 4))} className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface-2">
              <Minus className="size-4" />
            </button>
            <span className="w-16 text-center text-sm tabular-nums">{bpm} BPM</span>
            <button type="button" aria-label="เพิ่มเทมโป" onClick={() => setBpm((value) => Math.min(180, value + 4))} className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface-2">
              <Plus className="size-4" />
            </button>
          </div>
          <label className="text-xs text-muted">
            ความดังเครื่องบนจอ
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={levelSelf}
              onChange={(event) => setLevelSelf(Number(event.target.value))}
              className="w-full"
            />
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={liveOn}
              onClick={() => void toggleLive()}
              className={`inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm ${liveOn ? "bg-olive text-brass-ink" : "border border-line bg-surface-2"}`}
            >
              <Mic className="size-4" aria-hidden="true" />
              {liveOn ? "ปิดไลน์อิน" : "เปิดไลน์อิน"}
            </button>
            <Headphones className="size-4 text-muted" aria-hidden="true" />
            <span className="text-xs text-muted">ใส่หูฟังกันเสียงหอน</span>
          </div>
          {liveOn ? (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <div className="h-full bg-olive" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
              <label className="text-xs text-muted">
                มอนิเตอร์ในหูคุณ
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={monitor}
                  onChange={(event) => setMonitor(Number(event.target.value))}
                  className="w-full"
                />
              </label>
            </>
          ) : (
            <p className="text-xs text-muted">เสียบเครื่องเข้าไมค์หรืออินเทอร์เฟส แล้วเปิดไลน์อิน เสียงคุณในหูไม่วิ่งผ่านเน็ต</p>
          )}
          {liveError ? <p className="text-sm text-brass">{liveError}</p> : null}
        </div>
      </section>
      <p className="text-xs text-muted">
        เครื่องบนจอส่งเป็นโน้ต เพื่อนสังเคราะห์เองเลยไม่มีดีเลย์ของตัวถอดรหัสเสียง ตัวเลข ms ข้างชื่อคือเวลาไปกลับของเส้นตรง
      </p>
      </div>
    </main>
  );
}

function PeerChip({
  name,
  detail,
  live,
  rtt,
  state,
}: {
  name: string;
  detail: string;
  live: boolean;
  rtt: number | null;
  state: RTCPeerConnectionState | "connected";
}) {
  const rttClass = rtt == null ? "text-muted" : rtt < 60 ? "text-olive" : rtt < 140 ? "text-brass" : "text-muted";
  const waiting = state !== "connected";
  return (
    <span className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${live ? "border-brass bg-surface-2" : "border-line bg-surface"}`}>
      <span className={`size-2 rounded-full ${waiting ? "bg-muted" : "bg-olive"}`} />
      <span className="font-medium">{name}</span>
      <span className="text-muted">{detail}</span>
      {rtt != null ? <span className={`tabular-nums ${rttClass}`}>{rtt} ms</span> : null}
      {waiting ? (
        <span className="text-xs text-muted">{state === "failed" ? "เชื่อมตรงไม่ได้" : "กำลังเชื่อม"}</span>
      ) : null}
    </span>
  );
}

function Keyboard({
  base,
  pressed,
  onDown,
  onUp,
  pointers,
}: {
  base: number;
  pressed: Record<number, Who>;
  onDown: (note: number, velocity: number) => void;
  onUp: (note: number) => void;
  pointers: MutableRefObject<Map<number, number>>;
}) {
  const whites: number[] = [];
  const blacks: { midi: number; index: number }[] = [];
  let whiteIndex = 0;
  for (let midi = base; midi < base + 24; midi += 1) {
    if ([0, 2, 4, 5, 7, 9, 11].includes(midi % 12)) {
      whites.push(midi);
      whiteIndex += 1;
    } else blacks.push({ midi, index: whiteIndex });
  }

  function noteAt(event: React.PointerEvent): { note: number; velocity: number } | null {
    const node = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-midi]");
    if (!node) return null;
    const note = Number(node.getAttribute("data-midi"));
    const rect = node.getBoundingClientRect();
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.7;
    return { note, velocity: Math.min(1, Math.max(0.28, 0.3 + y * 0.7)) };
  }

  function down(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const hit = noteAt(event);
    if (!hit) return;
    pointers.current.set(event.pointerId, hit.note);
    onDown(hit.note, hit.velocity);
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const hit = noteAt(event);
    const prev = pointers.current.get(event.pointerId);
    if (!hit) {
      if (prev != null) onUp(prev);
      pointers.current.delete(event.pointerId);
      return;
    }
    if (hit.note === prev) return;
    if (prev != null) onUp(prev);
    pointers.current.set(event.pointerId, hit.note);
    onDown(hit.note, hit.velocity);
  }

  function up(event: React.PointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (prev != null) onUp(prev);
  }

  return (
    <div
      className="relative h-40 touch-none select-none"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex h-full gap-px">
        {whites.map((midi) => {
          const on = pressed[midi];
          const hint = KEY_MAP[midi - base];
          return (
            <div
              key={midi}
              data-midi={midi}
              className={`flex h-full flex-1 items-end justify-center rounded-sm pb-2 text-xs ${on === "me" ? "bg-brass text-brass-ink" : on === "peer" ? "bg-olive text-brass-ink" : "bg-fg text-bg"}`}
            >
              {hint ? hint.toUpperCase() : ""}
            </div>
          );
        })}
      </div>
      {blacks.map((key) => {
        const on = pressed[key.midi];
        return (
          <div
            key={key.midi}
            data-midi={key.midi}
            className={`absolute top-0 h-24 w-6 rounded-sm ${on === "me" ? "bg-brass" : on === "peer" ? "bg-olive" : "bg-bg"}`}
            style={{ left: `calc(${(key.index / whites.length) * 100}% - 0.75rem)` }}
          />
        );
      })}
    </div>
  );
}

function Fretboard({ pressed, onPluck }: { pressed: Record<number, Who>; onPluck: (note: number) => void }) {
  return (
    <div className="overflow-x-auto panel p-2">
      <div className="grid min-w-lg grid-cols-8 gap-1">
        {STRINGS.map((string) =>
          Array.from({ length: 8 }, (_, fret) => {
            const note = string.open + fret;
            const on = pressed[note];
            return (
              <button
                key={`${string.name}-${fret}`}
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  onPluck(note);
                }}
                className={`h-11 rounded-sm text-xs ${on ? "bg-brass text-brass-ink" : fret === 0 ? "bg-surface-2" : "bg-bg"}`}
              >
                {fret === 0 ? string.name : fret}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 45%)`;
}
