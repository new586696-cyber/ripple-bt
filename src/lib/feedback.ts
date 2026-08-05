/**
 * Sensory feedback layer: haptics + short synthesised sound effects.
 * Everything is feature-detected and silently no-ops where unsupported.
 */

const SOUND_KEY = "ripple:sounds";
const HAPTIC_KEY = "ripple:haptics";

export function soundsEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SOUND_KEY) !== "off";
}

export function setSoundsEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_KEY, on ? "on" : "off");
}

export function hapticsEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(HAPTIC_KEY) !== "off";
}

export function setHapticsEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HAPTIC_KEY, on ? "on" : "off");
}

export type HapticPattern = "tap" | "double" | "success" | "warn";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 12,
  double: [10, 40, 10],
  success: [14, 30, 24],
  warn: [30, 60, 30],
};

/** Fires a short vibration where the platform supports it. */
export function haptic(pattern: HapticPattern = "tap") {
  if (!hapticsEnabled()) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    /* best effort */
  }
}

/* ------------------------------------------------------------------ sounds */

let ctx: AudioContext | null = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type Tone = {
  from: number;
  to: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
};

function play(tones: Tone[]) {
  if (!soundsEnabled()) return;
  const audio = audioContext();
  if (!audio) return;
  try {
    for (const tone of tones) {
      const start = audio.currentTime + (tone.delay ?? 0);
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = tone.type ?? "sine";
      osc.frequency.setValueAtTime(tone.from, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), start + tone.duration);
      const peak = tone.gain ?? 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + tone.duration + 0.02);
    }
  } catch {
    /* best effort */
  }
}

/** Outgoing message "whoosh". */
export function playSend() {
  play([{ from: 520, to: 1180, duration: 0.16, type: "triangle", gain: 0.07 }]);
}

/** Incoming message "pop". */
export function playReceive() {
  play([
    { from: 880, to: 660, duration: 0.09, type: "sine", gain: 0.09 },
    { from: 1240, to: 980, duration: 0.11, type: "sine", gain: 0.05, delay: 0.06 },
  ]);
}

/** Reaction added. */
export function playPop() {
  play([{ from: 700, to: 1500, duration: 0.1, type: "sine", gain: 0.06 }]);
}

/** Something completed / a story was opened. */
export function playChime() {
  play([
    { from: 660, to: 660, duration: 0.12, type: "sine", gain: 0.05 },
    { from: 990, to: 990, duration: 0.16, type: "sine", gain: 0.045, delay: 0.09 },
  ]);
}

/* --------------------------------------- per-contact notification sounds */

export const NOTIFICATION_SOUNDS = [
  { key: "default", label: "Ripple (default)" },
  { key: "chime", label: "Chime" },
  { key: "pop", label: "Pop" },
  { key: "bell", label: "Bell" },
  { key: "none", label: "Silent" },
] as const;

export type NotificationSoundKey = (typeof NOTIFICATION_SOUNDS)[number]["key"];

export function playNotificationSound(key?: string | null) {
  switch (key) {
    case "none":
      return;
    case "chime":
      return playChime();
    case "pop":
      return playPop();
    case "bell":
      return play([
        { from: 1320, to: 1320, duration: 0.28, type: "sine", gain: 0.06 },
        { from: 1980, to: 1760, duration: 0.3, type: "sine", gain: 0.03, delay: 0.02 },
      ]);
    default:
      return playReceive();
  }
}
