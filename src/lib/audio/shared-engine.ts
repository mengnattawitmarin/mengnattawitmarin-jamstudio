import { RigEngine, type LatencyMode } from "@/lib/audio/rig";

/**
 * One audio engine for the whole app so the amp, the input mixer, MIDI
 * instruments, recording and the output device all share a single
 * AudioContext and a single path to the speakers/headphones.
 */
let engine: RigEngine | null = null;
const listeners = new Set<(engine: RigEngine) => void>();

export function sharedRig(latency: LatencyMode = "interactive"): RigEngine {
  if (!engine || engine.isClosed()) {
    engine = new RigEngine({ latency });
    for (const fn of listeners) fn(engine);
  }
  return engine;
}

export function peekSharedRig(): RigEngine | null {
  return engine && !engine.isClosed() ? engine : null;
}

/** Notified when a (new) shared engine is created. Returns an unsubscribe. */
export function onSharedRig(fn: (engine: RigEngine) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
