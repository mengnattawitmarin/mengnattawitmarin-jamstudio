/**
 * iPhone/iPad audio fixes for Web Audio.
 *
 * 1. Silent switch: Safari puts Web Audio in the "ambient" category, which the
 *    ring/silent switch mutes. We switch the page to "playback" (Audio Session
 *    API on iOS 17+, plus a one-shot silent <audio> element for older iOS) on
 *    the first tap, and to "play-and-record" right before any microphone use.
 * 2. Suspended / "interrupted" contexts: after a call, Siri, locking the phone
 *    or switching apps, iOS leaves AudioContexts suspended. We track every
 *    context and resume them on the next tap and when the page is visible again.
 *
 * Harmless on other platforms. Call installAudioUnlock() once at startup,
 * before any AudioContext is created.
 */
type SessionType = "auto" | "playback" | "transient" | "transient-solo" | "ambient" | "play-and-record";
type NavigatorWithSession = Navigator & { audioSession?: { type: SessionType } };

const contexts = new Set<BaseAudioContext>();
let installed = false;
let silentPlayed = false;

function setSession(type: SessionType) {
  try {
    const session = (navigator as NavigatorWithSession).audioSession;
    if (session && session.type !== type) session.type = type;
  } catch {
    // unsupported
  }
}

/** A tiny silent WAV, built at runtime (no network, no data: URI in markup). */
function silentWavUrl(): string {
  const samples = 2205; // 50 ms @ 44.1 kHz, 8-bit mono
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 44100, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function playSilentOnce() {
  if (silentPlayed) return;
  silentPlayed = true;
  try {
    const url = silentWavUrl();
    const el = document.createElement("audio");
    el.setAttribute("playsinline", "");
    el.setAttribute("x-webkit-airplay", "deny");
    el.preload = "auto";
    el.src = url;
    void el
      .play()
      .catch(() => {
        silentPlayed = false; // try again on the next tap
      })
      .finally(() => window.setTimeout(() => URL.revokeObjectURL(url), 1000));
  } catch {
    silentPlayed = false;
  }
}

export function resumeAllAudio() {
  for (const ctx of contexts) {
    if (ctx.state === "closed") {
      contexts.delete(ctx);
      continue;
    }
    if (ctx.state !== "running" && "resume" in ctx) void (ctx as AudioContext).resume().catch(() => undefined);
  }
}

function onGesture() {
  setSession("playback");
  playSilentOnce();
  resumeAllAudio();
}

export function installAudioUnlock() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Track every AudioContext the app creates (also webkit-prefixed on old iOS).
  const w = window as unknown as Record<string, unknown>;
  for (const name of ["AudioContext", "webkitAudioContext"]) {
    const Orig = w[name] as (new (opts?: AudioContextOptions) => AudioContext) | undefined;
    if (typeof Orig !== "function") continue;
    const Tracked = class extends Orig {
      constructor(opts?: AudioContextOptions) {
        super(opts);
        contexts.add(this);
      }
    };
    w[name] = Tracked;
  }

  // Before the mic opens, ask for play-and-record so playback keeps working.
  const md = navigator.mediaDevices;
  if (md && typeof md.getUserMedia === "function") {
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = (constraints?: MediaStreamConstraints) => {
      if (constraints?.audio) setSession("play-and-record");
      return original(constraints);
    };
  }

  for (const type of ["pointerdown", "touchend", "keydown"]) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resumeAllAudio();
  });
  window.addEventListener("pageshow", resumeAllAudio);
}
