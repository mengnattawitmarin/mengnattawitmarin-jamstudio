export const INSTRUMENTS = [
  { id: "piano", name: "เปียโน", en: "Piano", kind: "keys" },
  { id: "rhodes", name: "โรดส์", en: "Rhodes", kind: "keys" },
  { id: "bass", name: "เบส", en: "Bass", kind: "keys" },
  { id: "guitar", name: "กีตาร์", en: "Guitar", kind: "guitar" },
  { id: "drums", name: "กลอง", en: "Drums", kind: "drums" },
  { id: "lead", name: "ลีด", en: "Lead", kind: "keys" },
  { id: "pad", name: "แพด", en: "Pad", kind: "keys" },
] as const;

export type InstrumentId = (typeof INSTRUMENTS)[number]["id"];

export function isInstrumentId(value: string): value is InstrumentId {
  return INSTRUMENTS.some((item) => item.id === value);
}

export function instrumentName(id: InstrumentId): string {
  return INSTRUMENTS.find((item) => item.id === id)?.name ?? id;
}

const BASE_MIDI: Record<InstrumentId, number> = {
  piano: 48,
  rhodes: 48,
  bass: 36,
  guitar: 40,
  drums: 0,
  lead: 60,
  pad: 48,
};

export function baseMidiFor(id: InstrumentId): number {
  return BASE_MIDI[id];
}

function freq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function clampVel(value: number): number {
  if (!Number.isFinite(value)) return 0.8;
  return Math.min(1, Math.max(0.08, value));
}

export class JamSynth {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly voices = new Map<string, (when: number) => void>();
  private noise: AudioBuffer | null = null;
  private metroTimer: ReturnType<typeof setInterval> | null = null;
  private metroNext = 0;
  private closed = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 2.4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.12;
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);
  }

  resume(): Promise<void> {
    if (this.ctx.state === "running") return Promise.resolve();
    return this.ctx.resume().then(() => undefined);
  }

  outputLatencyMs(): number {
    const extra = this.ctx as AudioContext & { outputLatency?: number };
    return Math.round(((this.ctx.baseLatency || 0) + (extra.outputLatency || 0)) * 1000);
  }

  setLevel(value: number) {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(Math.min(1, Math.max(0, value)), now, 0.02);
  }

  noteOn(voiceId: string, inst: InstrumentId, note: number, velocity = 0.8) {
    if (this.closed) return;
    const vel = clampVel(velocity);
    const key = `${voiceId}|${inst}|${note}`;
    this.noteOff(voiceId, inst, note);
    if (inst === "drums") {
      this.hitDrum(note, vel);
      return;
    }
    const stop =
      inst === "guitar"
        ? this.pluck(freq(note), vel)
        : inst === "bass"
          ? this.bass(freq(note), vel)
          : inst === "rhodes"
            ? this.rhodes(freq(note), vel)
            : inst === "lead"
              ? this.lead(freq(note), vel)
              : inst === "pad"
                ? this.pad(freq(note), vel)
                : this.piano(freq(note), vel);
    this.voices.set(key, stop);
    if (inst === "guitar") {
      window.setTimeout(() => {
        if (this.voices.get(key) === stop) {
          stop(this.ctx.currentTime);
          this.voices.delete(key);
        }
      }, 2200);
    }
  }

  noteOff(voiceId: string, inst: InstrumentId, note: number) {
    if (inst === "drums" || inst === "guitar") return;
    const key = `${voiceId}|${inst}|${note}`;
    const stop = this.voices.get(key);
    if (!stop) return;
    this.voices.delete(key);
    stop(this.ctx.currentTime);
  }

  releasePeer(voiceId: string) {
    for (const [key, stop] of this.voices) {
      if (!key.startsWith(`${voiceId}|`)) continue;
      this.voices.delete(key);
      stop(this.ctx.currentTime);
    }
  }

  setMetronome(bpm: number | null) {
    if (this.metroTimer) clearInterval(this.metroTimer);
    this.metroTimer = null;
    if (bpm == null || bpm < 40 || bpm > 240) return;
    const step = 60 / bpm;
    this.metroNext = this.ctx.currentTime + 0.05;
    let beat = 0;
    this.metroTimer = setInterval(() => {
      if (this.closed) return;
      const horizon = this.ctx.currentTime + 0.18;
      while (this.metroNext < horizon) {
        this.click(this.metroNext, beat % 4 === 0);
        this.metroNext += step;
        beat += 1;
      }
    }, 40);
  }

  close() {
    this.closed = true;
    this.setMetronome(null);
    for (const stop of this.voices.values()) stop(0);
    this.voices.clear();
    this.master.disconnect();
    void this.ctx.close();
  }

  private burst(length: number): AudioBufferSourceNode {
    const buffer = this.noiseBuffer();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const offset = Math.random() * Math.max(0, buffer.duration - length);
    src.loop = true;
    src.start(this.ctx.currentTime, offset);
    src.stop(this.ctx.currentTime + length);
    return src;
  }

  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }

  private env(peak: number, attack: number, decay: number, sustain: number, release: number) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    const top = Math.max(0.0002, peak);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(top, t + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, top * sustain), t + attack + decay);
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [gain];
    return {
      gain,
      track(node: AudioNode) {
        nodes.push(node);
      },
      source(node: AudioScheduledSourceNode) {
        sources.push(node);
        nodes.push(node);
      },
      stop: (when: number) => {
        const now = Math.max(when, ctx.currentTime);
        gain.gain.cancelScheduledValues(now);
        const current = Math.max(0.0002, gain.gain.value || top * sustain);
        gain.gain.setValueAtTime(current, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
        const stopAt = now + release + 0.03;
        for (const src of sources) {
          try {
            src.stop(stopAt);
          } catch {
            // Already stopped.
          }
        }
        window.setTimeout(() => {
          for (const node of nodes) {
            try {
              node.disconnect();
            } catch {
              // Already disconnected.
            }
          }
        }, (release + 0.08) * 1000);
      },
    };
  }

  private piano(f: number, vel: number) {
    const body = this.env(0.28 * vel, 0.006, 0.22, 0.35, 0.28);
    const tone = this.ctx.createOscillator();
    tone.type = "triangle";
    tone.frequency.value = f;
    const partial = this.ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = f * 2;
    const partialGain = this.ctx.createGain();
    partialGain.gain.value = 0.28;
    const hammer = this.burst(0.04);
    const hammerFilter = this.ctx.createBiquadFilter();
    hammerFilter.type = "highpass";
    hammerFilter.frequency.value = 1800;
    const hammerGain = this.ctx.createGain();
    hammerGain.gain.setValueAtTime(0.08 * vel, this.ctx.currentTime);
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.05);
    tone.connect(body.gain);
    partial.connect(partialGain);
    partialGain.connect(body.gain);
    hammer.connect(hammerFilter);
    hammerFilter.connect(hammerGain);
    hammerGain.connect(body.gain);
    body.gain.connect(this.master);
    body.source(tone);
    body.source(partial);
    body.track(partialGain);
    body.track(hammerFilter);
    body.track(hammerGain);
    tone.start();
    partial.start();
    return body.stop;
  }

  private rhodes(f: number, vel: number) {
    const body = this.env(0.22 * vel, 0.01, 0.4, 0.45, 0.22);
    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = f;
    const mod = this.ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = f * 2;
    const modGain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    modGain.gain.setValueAtTime(f * 1.4 * vel, t);
    modGain.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.15), t + 0.7);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(body.gain);
    body.gain.connect(this.master);
    body.source(carrier);
    body.source(mod);
    body.track(modGain);
    carrier.start();
    mod.start();
    return body.stop;
  }

  private bass(f: number, vel: number) {
    const body = this.env(0.4 * vel, 0.005, 0.08, 0.72, 0.06);
    const sub = this.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = f;
    const grit = this.ctx.createOscillator();
    grit.type = "triangle";
    grit.frequency.value = f * 2;
    const gritGain = this.ctx.createGain();
    gritGain.gain.value = 0.18;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    sub.connect(filter);
    grit.connect(gritGain);
    gritGain.connect(filter);
    filter.connect(body.gain);
    body.gain.connect(this.master);
    body.source(sub);
    body.source(grit);
    body.track(gritGain);
    body.track(filter);
    sub.start();
    grit.start();
    return body.stop;
  }

  private lead(f: number, vel: number) {
    const body = this.env(0.16 * vel, 0.008, 0.12, 0.7, 0.08);
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    const t = this.ctx.currentTime;
    filter.frequency.setValueAtTime(Math.max(200, f * 2), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, f * 6), t + 0.04);
    filter.frequency.exponentialRampToValueAtTime(Math.max(240, f * 3), t + 0.22);
    osc.connect(filter);
    filter.connect(body.gain);
    body.gain.connect(this.master);
    body.source(osc);
    body.track(filter);
    osc.start();
    return body.stop;
  }

  private pad(f: number, vel: number) {
    const body = this.env(0.1 * vel, 0.03, 0.35, 0.85, 0.4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    const a = this.ctx.createOscillator();
    const b = this.ctx.createOscillator();
    a.type = "sawtooth";
    b.type = "sawtooth";
    a.frequency.value = f * 0.995;
    b.frequency.value = f * 1.005;
    a.connect(filter);
    b.connect(filter);
    filter.connect(body.gain);
    body.gain.connect(this.master);
    body.source(a);
    body.source(b);
    body.track(filter);
    a.start();
    b.start();
    return body.stop;
  }

  private pluck(f: number, vel: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const period = Math.max(8, Math.round(ctx.sampleRate / f));
    const buffer = ctx.createBuffer(1, period, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < period; i += 1) data[i] = Math.random() * 2 - 1;
    const burst = ctx.createBufferSource();
    burst.buffer = buffer;
    const delay = ctx.createDelay(1);
    delay.delayTime.setValueAtTime(1 / f, t);
    const feedback = ctx.createGain();
    feedback.gain.setValueAtTime(0.955, t);
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.45 * vel, t);
    burst.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    feedback.connect(gain);
    gain.connect(this.master);
    burst.start(t);
    burst.stop(t + 0.03);
    const nodes = [burst, delay, damp, feedback, gain];
    return (when: number) => {
      const now = Math.max(when, ctx.currentTime);
      feedback.gain.cancelScheduledValues(now);
      feedback.gain.setTargetAtTime(0.0001, now, 0.04);
      gain.gain.setTargetAtTime(0.0001, now, 0.05);
      window.setTimeout(() => {
        for (const node of nodes) {
          try {
            node.disconnect();
          } catch {
            // Already disconnected.
          }
        }
      }, 360);
    };
  }

  private hitDrum(pad: number, vel: number) {
    const index = ((pad % 6) + 6) % 6;
    if (index === 0 || index === 4) this.tonalDrum(index === 0 ? 148 : 196, index === 0 ? 52 : 90, vel, index === 0 ? 0.22 : 0.16);
    if (index === 1 || index === 5) this.noiseDrum(vel, index === 1 ? 0.16 : 0.12, index === 1 ? 1800 : 900, index === 5);
    if (index === 2 || index === 3) this.hat(vel, index === 3 ? 0.22 : 0.045);
  }

  private tonalDrum(startF: number, endF: number, vel: number, length: number) {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    osc.frequency.setValueAtTime(startF, t);
    osc.frequency.exponentialRampToValueAtTime(endF, t + 0.08);
    gain.gain.setValueAtTime(0.55 * vel, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + length + 0.02);
    window.setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
    }, (length + 0.08) * 1000);
  }

  private noiseDrum(vel: number, length: number, hp: number, clap: boolean) {
    const src = this.burst(length);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    if (clap) {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.4 * vel, t + 0.012);
      gain.gain.linearRampToValueAtTime(0.05 * vel, t + 0.04);
      gain.gain.linearRampToValueAtTime(0.28 * vel, t + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    } else {
      gain.gain.setValueAtTime(0.4 * vel, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    }
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    window.setTimeout(() => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    }, (length + 0.08) * 1000);
  }

  private hat(vel: number, length: number) {
    const src = this.burst(length);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.22 * vel, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    window.setTimeout(() => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    }, (length + 0.08) * 1000);
  }

  private click(when: number, accent: boolean) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(accent ? 1760 : 1320, when);
    gain.gain.setValueAtTime(accent ? 0.09 : 0.05, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + 0.04);
  }
}
