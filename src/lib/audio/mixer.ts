import type { InputChannel } from "@/lib/audio/rig";

/** What is plugged into a channel; decides the starting processing. */
export type ChannelKind = "guitar" | "bass" | "keys" | "drums" | "vocal" | "acoustic" | "line";
/** "amp" = through the amp/pedal chain, "direct" = clean DI to the mix. */
export type ChannelRoute = "amp" | "direct";

export type ChannelState = {
  id: string;
  name: string;
  kind: ChannelKind;
  deviceId: string;
  channel: InputChannel;
  route: ChannelRoute;
  /** Input trim, dB. */
  gain: number;
  /** EQ, dB. */
  low: number;
  mid: number;
  high: number;
  /** Compression amount 0..1. */
  comp: number;
  /** -1 (L) .. 1 (R). */
  pan: number;
  /** Channel fader 0..1.2. */
  fader: number;
  mute: boolean;
  solo: boolean;
};

export const KINDS: Record<
  ChannelKind,
  { label: string; blurb: string; hpf: number; midHz: number; route: ChannelRoute; gain: number; low: number; mid: number; high: number; comp: number }
> = {
  guitar: { label: "กีตาร์ไฟฟ้า", blurb: "ผ่านอินเทอร์เฟซ Hi-Z / iRig แล้วเข้าแอมป์ในแอป", hpf: 70, midHz: 2000, route: "amp", gain: 6, low: 0, mid: 0, high: 0, comp: 0.1 },
  bass: { label: "เบส", blurb: "DI สะอาด โลว์แน่น คอมเพรสคุมไดนามิก", hpf: 32, midHz: 800, route: "direct", gain: 4, low: 2, mid: -1, high: 1, comp: 0.4 },
  keys: { label: "คีย์บอร์ด / ซินธ์", blurb: "ไลน์เอาต์ของคีย์บอร์ด (ถ้ามี USB-MIDI ใช้ส่วน MIDI ด้านล่าง)", hpf: 30, midHz: 1000, route: "direct", gain: 0, low: 0, mid: 0, high: 1, comp: 0.15 },
  drums: { label: "กลองไฟฟ้า / แพด", blurb: "ไลน์เอาต์ของกลองไฟฟ้า คอมเพรสเร็ว คุมพีค", hpf: 30, midHz: 3000, route: "direct", gain: 0, low: 1, mid: -2, high: 2, comp: 0.35 },
  vocal: { label: "ร้อง / ไมค์", blurb: "ตัดลมและเสียงต่ำ ดันความชัด", hpf: 100, midHz: 3000, route: "direct", gain: 8, low: -2, mid: 2, high: 2, comp: 0.45 },
  acoustic: { label: "กีตาร์โปร่ง", blurb: "ปิกอัปหรือไมค์ ลดเสียงบูมจากบอดี้", hpf: 85, midHz: 250, route: "direct", gain: 6, low: -1, mid: -3, high: 2, comp: 0.3 },
  line: { label: "ไลน์ / แอปอื่น", blurb: "สัญญาณไลน์ หรือเสียงจากแอปอื่นผ่านสายเสมือน", hpf: 20, midHz: 1000, route: "direct", gain: 0, low: 0, mid: 0, high: 0, comp: 0 },
};

export function newChannel(kind: ChannelKind, index: number): ChannelState {
  const p = KINDS[kind];
  return {
    id: `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: `${p.label} ${index}`,
    kind,
    deviceId: "default",
    channel: "mix",
    route: p.route,
    gain: p.gain,
    low: p.low,
    mid: p.mid,
    high: p.high,
    comp: p.comp,
    pan: 0,
    fader: 0.8,
    mute: false,
    solo: false,
  };
}

const dbToGain = (db: number) => 10 ** (db / 20);

/** One live input: device → split → HPF → comp → EQ → trim → [meter] → pan → fader → route. */
export class InputStrip {
  private stream: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private split: ChannelSplitterNode | null = null;
  private readonly hpf: BiquadFilterNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly low: BiquadFilterNode;
  private readonly mid: BiquadFilterNode;
  private readonly high: BiquadFilterNode;
  private readonly trim: GainNode;
  private readonly meter: AnalyserNode;
  private readonly meterBuf: Float32Array;
  private readonly pan: StereoPannerNode;
  private readonly fader: GainNode;
  private route: ChannelRoute | null = null;
  private clipUntil = 0;
  private openedFor = "";
  private readonly ctx: AudioContext;
  private readonly outs: { direct: AudioNode; amp: AudioNode };

  constructor(ctx: AudioContext, outs: { direct: AudioNode; amp: AudioNode }) {
    this.ctx = ctx;
    this.outs = outs;
    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = "highpass";
    this.hpf.Q.value = 0.7;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.15;
    this.low = ctx.createBiquadFilter();
    this.low.type = "lowshelf";
    this.low.frequency.value = 120;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = "peaking";
    this.mid.Q.value = 0.9;
    this.high = ctx.createBiquadFilter();
    this.high.type = "highshelf";
    this.high.frequency.value = 6000;
    this.trim = ctx.createGain();
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 1024;
    this.meterBuf = new Float32Array(this.meter.fftSize);
    this.pan = ctx.createStereoPanner();
    this.fader = ctx.createGain();
    this.hpf.connect(this.comp);
    this.comp.connect(this.low);
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.trim);
    this.trim.connect(this.meter);
    this.trim.connect(this.pan);
    this.pan.connect(this.fader);
  }

  get isOpen(): boolean {
    return this.stream != null;
  }

  /** Open (or re-open when device/channel changed) the input device. */
  async open(state: ChannelState): Promise<void> {
    const key = `${state.deviceId}|${state.channel}`;
    if (this.stream && this.openedFor === key) return;
    this.closeSource();
    const audio: MediaTrackConstraints & { latency?: number } = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: state.channel === "mix" ? 1 : 2,
      latency: 0.005,
    };
    if (state.deviceId && state.deviceId !== "default") audio.deviceId = { exact: state.deviceId };
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    const src = this.ctx.createMediaStreamSource(stream);
    if (state.channel === "mix") src.connect(this.hpf);
    else {
      const split = this.ctx.createChannelSplitter(2);
      src.connect(split);
      split.connect(this.hpf, state.channel === "left" ? 0 : 1);
      this.split = split;
    }
    this.stream = stream;
    this.src = src;
    this.openedFor = key;
  }

  /** Apply all parameters; `audible` folds in mute/solo. */
  update(state: ChannelState, audible: boolean) {
    const t = this.ctx.currentTime;
    const kind = KINDS[state.kind];
    this.hpf.frequency.setTargetAtTime(kind.hpf, t, 0.02);
    this.mid.frequency.setTargetAtTime(kind.midHz, t, 0.02);
    this.low.gain.setTargetAtTime(state.low, t, 0.02);
    this.mid.gain.setTargetAtTime(state.mid, t, 0.02);
    this.high.gain.setTargetAtTime(state.high, t, 0.02);
    this.comp.threshold.setTargetAtTime(-6 - state.comp * 28, t, 0.02);
    this.comp.ratio.setTargetAtTime(1 + state.comp * 5, t, 0.02);
    this.comp.knee.setTargetAtTime(6, t, 0.02);
    // Make-up gain for the compression so turning it up doesn't just get quieter.
    this.trim.gain.setTargetAtTime(dbToGain(state.gain + state.comp * 6), t, 0.02);
    this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, state.pan)), t, 0.02);
    this.fader.gain.setTargetAtTime(audible ? Math.max(0, Math.min(1.2, state.fader)) : 0, t, 0.02);
    if (state.route !== this.route) {
      try {
        this.fader.disconnect();
      } catch {
        // not connected yet
      }
      this.fader.connect(state.route === "amp" ? this.outs.amp : this.outs.direct);
      this.route = state.route;
    }
  }

  /** Pre-fader peak (0..1) and clip flag (held ~1 s). */
  read(): { peak: number; clip: boolean } {
    if (!this.stream) return { peak: 0, clip: false };
    this.meter.getFloatTimeDomainData(this.meterBuf as Float32Array<ArrayBuffer>);
    let peak = 0;
    for (let i = 0; i < this.meterBuf.length; i++) peak = Math.max(peak, Math.abs(this.meterBuf[i]));
    const now = performance.now();
    if (peak >= 0.97) this.clipUntil = now + 1000;
    return { peak: Math.min(1, peak), clip: now < this.clipUntil };
  }

  private closeSource() {
    try {
      this.src?.disconnect();
      this.split?.disconnect();
    } catch {
      // ignore
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.src = null;
    this.split = null;
    this.openedFor = "";
  }

  close() {
    this.closeSource();
  }

  dispose() {
    this.closeSource();
    for (const node of [this.hpf, this.comp, this.low, this.mid, this.high, this.trim, this.meter, this.pan, this.fader]) {
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
  }
}

/** Effective audibility with solo: any soloed channel silences the non-soloed ones. */
export function audibleMap(channels: ChannelState[]): Record<string, boolean> {
  const anySolo = channels.some((c) => c.solo);
  const out: Record<string, boolean> = {};
  for (const c of channels) out[c.id] = !c.mute && (!anySolo || c.solo);
  return out;
}
