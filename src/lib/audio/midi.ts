/**
 * Web MIDI helpers: USB/Bluetooth MIDI keyboards, e-drum kits, foot
 * controllers, and virtual MIDI ports to/from other apps (DAWs).
 * Pure parsing lives here so it can be unit-tested without a browser.
 */
export type MidiEvent =
  | { type: "on"; channel: number; note: number; velocity: number }
  | { type: "off"; channel: number; note: number }
  | { type: "cc"; channel: number; cc: number; value: number }
  | { type: "pitch"; channel: number; value: number }
  | { type: "other" };

/** Parse one MIDI message. Channels are 1..16; velocity/value normalised 0..1. */
export function parseMidi(data: ArrayLike<number>): MidiEvent {
  if (!data || data.length < 1) return { type: "other" };
  const status = data[0] & 0xf0;
  const channel = (data[0] & 0x0f) + 1;
  const d1 = data[1] ?? 0;
  const d2 = data[2] ?? 0;
  if (status === 0x90 && d2 > 0) return { type: "on", channel, note: d1, velocity: d2 / 127 };
  if (status === 0x80 || (status === 0x90 && d2 === 0)) return { type: "off", channel, note: d1 };
  if (status === 0xb0) return { type: "cc", channel, cc: d1, value: d2 / 127 };
  if (status === 0xe0) return { type: "pitch", channel, value: ((d2 << 7) | d1) / 8192 - 1 };
  return { type: "other" };
}

/**
 * General MIDI drum notes → the six pads of the built-in kit
 * (0 kick, 1 snare, 2 closed hat, 3 open hat / cymbal, 4 tom, 5 clap).
 */
export function gmDrumPad(note: number): number {
  if (note === 35 || note === 36) return 0;
  if (note === 38 || note === 40) return 1;
  if (note === 37 || note === 39) return 5;
  if (note === 42 || note === 44) return 2;
  if (note === 46 || [49, 51, 52, 53, 55, 57, 59].includes(note)) return 3;
  if ([41, 43, 45, 47, 48, 50].includes(note)) return 4;
  return ((note % 6) + 6) % 6;
}

export function midiSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
}

export async function openMidi(): Promise<MIDIAccess> {
  if (!midiSupported()) throw new Error("no-midi");
  return navigator.requestMIDIAccess({ sysex: false });
}

export function noteOnBytes(note: number, velocity: number, channel = 1): number[] {
  return [0x90 | ((channel - 1) & 0x0f), note & 0x7f, Math.max(1, Math.min(127, Math.round(velocity * 127)))];
}

export function noteOffBytes(note: number, channel = 1): number[] {
  return [0x80 | ((channel - 1) & 0x0f), note & 0x7f, 0];
}
