export type DemoTrack = {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  bpm: number;
  title: string;
};

const SAMPLE_RATE = 44100;

function midiFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function renderDemo(): DemoTrack {
  const bpm = 92;
  const beat = 60 / bpm;
  const bars = 8;
  const n = Math.floor(bars * 4 * beat * SAMPLE_RATE);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const sr = SAMPLE_RATE;

  const add = (channel: Float32Array, index: number, value: number) => {
    if (index >= 0 && index < channel.length) channel[index] += value;
  };

  const chords: { root: number; third: number; fifth: number; bass: number }[] = [
    { root: 57, third: 60, fifth: 64, bass: 45 },
    { root: 53, third: 57, fifth: 60, bass: 41 },
    { root: 48, third: 52, fifth: 55, bass: 48 },
    { root: 55, third: 59, fifth: 62, bass: 43 },
  ];
  const melody = [
    [69, 72, 76, 72],
    [69, 65, 69, 72],
    [67, 64, 67, 72],
    [71, 67, 71, 74],
  ];

  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % 4];
    const line = melody[bar % 4];
    const barStart = bar * 4 * beat;

    const level = bar < 2 ? 0.42 : 1;
    for (let beatIndex = 0; beatIndex < 4; beatIndex++) {
      const tBeat = barStart + beatIndex * beat;
      addKick(left, right, tBeat, sr, 0.9 * level);
      if (level > 0.5 && (beatIndex === 1 || beatIndex === 3)) addSnare(left, right, tBeat, sr, level);
      for (let hat = 0; hat < 2; hat++) {
        addHat(left, right, tBeat + hat * beat * 0.5, sr, (bar + beatIndex + hat) % 2 === 0 ? -0.35 : 0.45, 0.28 * level);
      }
      addVocal(left, right, tBeat, midiFreq(line[beatIndex]), beat, sr, 0.3 * Math.max(level, 0.75));
    }

    addBass(left, right, barStart, midiFreq(chord.bass), beat * 1.7, sr, 0.34 * level);
    addBass(left, right, barStart + beat * 2, midiFreq(chord.bass + 7), beat * 1.15, sr, 0.28 * level);
    addPiano(left, right, barStart, midiFreq(chord.root), beat * 1.9, sr, -0.55, 0.2 * level);
    addPiano(left, right, barStart + 0.01, midiFreq(chord.third), beat * 1.8, sr, 0.15, 0.16 * level);
    addPiano(left, right, barStart + 0.016, midiFreq(chord.fifth), beat * 1.7, sr, 0.7, 0.16 * level);
    addPad(left, right, barStart, [chord.root, chord.third, chord.fifth], beat * 4, sr);
  }

  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = 0.86 / peak;
  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i] * gain);
    right[i] = Math.tanh(right[i] * gain);
  }

  return { left, right, sampleRate: sr, bpm, title: "ตัวอย่าง · Am F C G" };
}

function addKick(left: Float32Array, right: Float32Array, startBeat: number, sr: number, amp: number): void {
  const start = Math.floor(startBeat * sr);
  const len = Math.floor(0.22 * sr);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const freq = 70 * Math.exp(-16 * t) + 46;
    phase += (2 * Math.PI * freq) / sr;
    const body = Math.sin(phase) * Math.exp(-8.5 * t);
    const click = i < 180 ? (hash(start + i) * 2 - 1) * Math.exp(-50 * t) * 0.35 : 0;
    const v = (body * 0.95 + click) * amp;
    const idx = start + i;
    if (idx >= left.length) break;
    left[idx] += v;
    right[idx] += v;
  }
}

function addSnare(left: Float32Array, right: Float32Array, startBeat: number, sr: number, amp: number): void {
  const start = Math.floor(startBeat * sr);
  const len = Math.floor(0.18 * sr);
  let tone = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    tone += (2 * Math.PI * 188) / sr;
    const noise = (hash(start * 3 + i) * 2 - 1) * Math.exp(-14 * t);
    const body = Math.sin(tone) * Math.exp(-22 * t) * 0.35;
    const v = (noise * 0.55 + body) * 0.72 * amp;
    const idx = start + i;
    if (idx >= left.length) break;
    left[idx] += v * 0.92;
    right[idx] += v * 1.05;
  }
}

function addHat(
  left: Float32Array,
  right: Float32Array,
  startBeat: number,
  sr: number,
  pan: number,
  amp: number,
): void {
  const start = Math.floor(startBeat * sr);
  const len = Math.floor(0.045 * sr);
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const x = hash(start * 5 + i * 2) * 2 - 1;
    hp = x - prev + 0.7 * hp;
    prev = x;
    const v = hp * Math.exp(-46 * t) * amp;
    const idx = start + i;
    if (idx >= left.length) break;
    left[idx] += v * (1 - pan);
    right[idx] += v * (1 + pan);
  }
}

function addVocal(
  left: Float32Array,
  right: Float32Array,
  startBeat: number,
  freq: number,
  beat: number,
  sr: number,
  amp: number,
): void {
  const start = Math.floor(startBeat * sr);
  const len = Math.floor(beat * sr * 0.7);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.sin((Math.PI * i) / len) ** 0.85;
    const vib = 1 + 0.0045 * Math.sin(2 * Math.PI * 5.2 * t);
    const f = freq * vib;
    const s =
      Math.sin(2 * Math.PI * f * t) * 0.62 +
      Math.sin(2 * Math.PI * f * 2 * t) * 0.2 +
      Math.sin(2 * Math.PI * f * 3 * t) * 0.07;
    const v = s * env * amp;
    const idx = start + i;
    if (idx >= left.length) break;
    left[idx] += v;
    right[idx] += v;
  }
}

function addBass(
  left: Float32Array,
  right: Float32Array,
  startBeat: number,
  freq: number,
  dur: number,
  sr: number,
  amp: number,
): void {
  const start = Math.floor(startBeat * sr);
  const len = Math.floor(dur * sr);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.02) * Math.exp(-1.15 * t);
    const s = Math.sin(2 * Math.PI * freq * t) * 0.85 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.12;
    const v = s * env * amp;
    const idx = start + i;
    if (idx >= left.length) break;
    left[idx] += v;
    right[idx] += v * 0.96;
  }
}

function addPiano(
  left: Float32Array,
  right: Float32Array,
  startBeat: number,
  freq: number,
  dur: number,
  sr: number,
  pan: number,
  amp: number,
): void {
  const start = Math.floor(startBeat * sr);
  const len = Math.floor(dur * sr);
  const gL = Math.max(0, 0.75 - pan * 0.45);
  const gR = Math.max(0, 0.75 + pan * 0.45);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-3.4 * t);
    const detune = pan * 0.006;
    const s =
      Math.sin(2 * Math.PI * freq * (1 + detune) * t) * 0.7 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.16 * Math.exp(-1.6 * t);
    const v = s * env * amp;
    const idx = start + i;
    if (idx >= left.length) break;
    left[idx] += v * gL;
    right[idx] += v * gR;
  }
}

function addPad(
  left: Float32Array,
  right: Float32Array,
  startBeat: number,
  midis: number[],
  dur: number,
  sr: number,
): void {
  const start = Math.floor(startBeat * sr);
  const len = Math.floor(dur * sr);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, i / (0.08 * sr)) * (i > len - 0.1 * sr ? (len - i) / (0.1 * sr) : 1);
    let s = 0;
    for (const midi of midis) {
      const f = midiFreq(midi - 12);
      s += Math.sin(2 * Math.PI * f * t) * 0.04;
      s += Math.sin(2 * Math.PI * f * 1.003 * t + 1.2) * 0.03;
    }
    const idx = start + i;
    if (idx >= left.length) break;
    left[idx] += s * env * 0.7;
    right[idx] += s * env * 0.55;
  }
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
