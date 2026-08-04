/** Desktop notification helpers for incoming messages. */

const STORAGE_KEY = "ripple:notifications";

export function notificationsEnabled() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  return localStorage.getItem(STORAGE_KEY) === "on" && Notification.permission === "granted";
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPreference() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "on";
}

export async function setNotificationsEnabled(enabled: boolean) {
  if (!notificationsSupported()) return false;
  if (!enabled) {
    localStorage.setItem(STORAGE_KEY, "off");
    return false;
  }
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  localStorage.setItem(STORAGE_KEY, permission === "granted" ? "on" : "off");
  return permission === "granted";
}

export function notifyMessage(title: string, body: string, tag?: string) {
  if (!notificationsEnabled()) return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  try {
    const options: NotificationOptions = { body, icon: "/favicon.ico" };
    if (tag) options.tag = tag;
    new Notification(title, options);
  } catch {
    /* notifications are best-effort */
  }
}
