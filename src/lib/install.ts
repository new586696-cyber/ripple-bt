/** Home-screen install support: Chrome's prompt event plus iOS written steps. */

import { needsHomeScreenInstall, pushSupported } from "@/lib/push";

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "ripple:install-dismissed";

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as PromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function subscribeInstall(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function canPromptInstall() {
  return deferred !== null;
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** True on iOS/iPadOS Safari, where installing is manual. */
export function needsIosInstructions() {
  return needsHomeScreenInstall();
}

export function installDismissed() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(DISMISS_KEY) === "1";
}

export function dismissInstall() {
  localStorage.setItem(DISMISS_KEY, "1");
  emit();
}

export function resetInstallDismissal() {
  localStorage.removeItem(DISMISS_KEY);
  emit();
}

/** Shows the native install prompt. Returns true when the user accepted. */
export async function promptInstall() {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === "accepted";
  } catch {
    return false;
  }
}

/** Whether installing would actually unlock anything for this visitor. */
export function installWorthShowing() {
  if (isStandalone()) return false;
  if (canPromptInstall()) return true;
  return needsIosInstructions() && pushSupported();
}

export const IOS_INSTALL_STEPS = [
  "Tap the Share button in Safari's toolbar.",
  "Scroll down and choose “Add to Home Screen”.",
  "Tap Add, then open Ripple from your Home Screen.",
];
