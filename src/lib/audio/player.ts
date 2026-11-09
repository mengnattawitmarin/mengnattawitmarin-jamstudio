import { STEM_IDS, type StemId } from "@/lib/audio/stems";
import { AI_STEMS, type AiStemId } from "@/lib/audio/demucs";

export type Audible = Record<StemId, boolean>;
export type Volumes = Record<StemId, number>;

export class MixPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stemGains = new Map<StemId, GainNode>();
  private aiGains = new Map<AiStemId, GainNode>();
  /** AI-separated stems (HT-Demucs 6s), empty until the user runs AI separation. */
  ai = new Map<AiStemId, AudioBuffer>();
  private sources: AudioBufferSourceNode[] = [];
  private metroTimer: number | null = null;
  private nextBeat = 0;
  original: AudioBuffer | null = null;
  stems = new Map<StemId, AudioBuffer>();
  beats: number[] = [];
  duration = 0;
  mode: "original" | "stems" | "ai" = "original";
  rate = 1;
  metronome = false;
  /**
   * Pre-rendered WSOLA versions (pitch kept / key shifted) for `processed.rate`.
   * They play at playbackRate 1; song time still advances at `rate`.
   */
  processed: {
    rate: number;
    semitones: number;
    original: AudioBuffer | null;
    stems: Map<StemId, AudioBuffer>;
    ai?: Map<AiStemId, AudioBuffer>;
  } | null = null;
  private offset = 0;
  private startedAt = 0;
  private playing = false;

  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const id of STEM_IDS) {
        const gain = this.ctx.createGain();
        gain.connect(this.master);
        this.stemGains.set(id, gain);
      }
      for (const id of AI_STEMS) {
        const gain = this.ctx.createGain();
        gain.connect(this.master);
        this.aiGains.set(id, gain);
      }
    }
    return this.ctx;
  }

  get currentOffset(): number {
    return this.offset;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  currentTime(): number {
    if (!this.ctx || !this.playing) return this.offset;
    const t = this.offset + (this.ctx.currentTime - this.startedAt) * this.rate;
    if (t >= this.duration) return this.duration;
    return t;
  }

  play(from?: number) {
    const ctx = this.ensure();
    void ctx.resume();
    const startAt = from ?? (this.playing ? this.currentTime() : this.offset);
    this.stopSources();
    if (this.duration <= 0) return;
    this.offset = Math.max(0, Math.min(startAt, Math.max(0, this.duration - 0.05)));
    if (startAt >= this.duration - 0.05) this.offset = 0;
    this.startedAt = ctx.currentTime;
    this.playing = true;
    const proc = this.processed && Math.abs(this.processed.rate - this.rate) < 1e-6 ? this.processed : null;
    if (this.mode === "ai" && this.ai.size) {
      for (const id of AI_STEMS) {
        const alt = proc?.ai?.get(id);
        const buffer = alt ?? this.ai.get(id);
        const gain = this.aiGains.get(id);
        if (!buffer || !gain) continue;
        if (alt) this.spawn(alt, gain, 1 / this.rate, 1);
        else this.spawn(buffer, gain);
      }
    } else if (this.mode === "original" && this.original) {
      const alt = proc?.original;
      if (alt) this.spawn(alt, this.master!, 1 / this.rate, 1);
      else this.spawn(this.original, this.master!);
    } else {
      for (const id of STEM_IDS) {
        const alt = proc?.stems.get(id);
        const buffer = alt ?? this.stems.get(id);
        const gain = this.stemGains.get(id);
        if (buffer && gain) {
          if (alt) this.spawn(alt, gain, 1 / this.rate, 1);
          else this.spawn(buffer, gain);
        }
      }
    }
    this.armMetronome();
  }

  cue(seconds: number) {
    if (this.playing) this.play(seconds);
    else this.offset = Math.max(0, Math.min(seconds, this.duration));
  }

  pause() {
    if (!this.playing) return;
    this.offset = Math.min(this.duration, this.currentTime());
    this.stopSources();
  }

  stopSources() {
    for (const source of this.sources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    this.sources = [];
    this.playing = false;
    if (this.metroTimer != null) {
      window.clearInterval(this.metroTimer);
      this.metroTimer = null;
    }
  }

  applyAiGains(volumes: Record<AiStemId, number>, audible: Record<AiStemId, boolean>, immediate = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const id of AI_STEMS) {
      const node = this.aiGains.get(id);
      if (!node) continue;
      const value = audible[id] ? volumes[id] : 0;
      node.gain.cancelScheduledValues(now);
      if (immediate) node.gain.setValueAtTime(value, now);
      else {
        node.gain.setValueAtTime(node.gain.value, now);
        node.gain.linearRampToValueAtTime(value, now + 0.03);
      }
    }
  }

  applyGains(volumes: Volumes, audible: Audible, immediate = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const id of STEM_IDS) {
      const node = this.stemGains.get(id);
      if (!node) continue;
      const value = audible[id] ? volumes[id] : 0;
      node.gain.cancelScheduledValues(now);
      if (immediate) node.gain.setValueAtTime(value, now);
      else {
        node.gain.setValueAtTime(node.gain.value, now);
        node.gain.linearRampToValueAtTime(value, now + 0.03);
      }
    }
  }

  private spawn(buffer: AudioBuffer, target: AudioNode, offsetScale = 1, playRate = this.rate) {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playRate;
    source.connect(target);
    const offset = Math.min(this.offset * offsetScale, Math.max(0, buffer.duration - 0.01));
    source.start(0, offset);
    this.sources.push(source);
  }

  private armMetronome() {
    if (this.metroTimer != null) window.clearInterval(this.metroTimer);
    this.nextBeat = this.beats.findIndex((beat) => beat >= this.offset - 0.02);
    if (this.nextBeat < 0) this.nextBeat = this.beats.length;
    this.metroTimer = window.setInterval(() => this.scheduleClicks(), 40);
    this.scheduleClicks();
  }

  private scheduleClicks() {
    if (!this.playing || !this.metronome || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const horizon = now + 0.28;
    while (this.nextBeat < this.beats.length) {
      const beat = this.beats[this.nextBeat];
      const wall = this.startedAt + (beat - this.offset) / this.rate;
      if (wall > horizon) break;
      this.nextBeat += 1;
      if (wall < now + 0.01) continue;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 1400;
      gain.gain.setValueAtTime(0.0001, wall);
      gain.gain.exponentialRampToValueAtTime(0.05, wall + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, wall + 0.04);
      osc.connect(gain).connect(this.master);
      osc.start(wall);
      osc.stop(wall + 0.05);
    }
  }
}

export function bufferFromMono(ctx: AudioContext, samples: Float32Array, sampleRate: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  return buffer;
}

export function trimBuffer(ctx: AudioContext, buffer: AudioBuffer, seconds: number): AudioBuffer {
  const frames = Math.min(buffer.length, Math.floor(seconds * buffer.sampleRate));
  if (frames >= buffer.length) return buffer;
  const out = ctx.createBuffer(buffer.numberOfChannels, frames, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const slice = new Float32Array(frames);
    slice.set(buffer.getChannelData(channel).subarray(0, frames));
    out.copyToChannel(slice, channel);
  }
  return out;
}
