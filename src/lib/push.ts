import { supabase } from "@/integrations/supabase/client";

/** Public VAPID key — safe to ship to the browser. */
export const VAPID_PUBLIC_KEY =
  "BAFF2hpCOYtWPthK6Jk1_zn6w3bTqLDapSmlVC9znQ67dYDuWR3WJUV1-bWPuFIVIZW05iXT84h9VDxzJxGwVOU";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function encodeKey(buffer: ArrayBuffer | null) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** True on iOS/iPadOS Safari outside of an installed home-screen app. */
export function needsHomeScreenInstall() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isApple = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  if (!isApple) return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !standalone;
}

export async function registerServiceWorker() {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** Asks permission, subscribes and stores the subscription. Returns success. */
export async function enablePush(userId: string) {
  if (!pushSupported()) return false;
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (!registration) return false;
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    }));

  const p256dh = encodeKey(subscription.getKey("p256dh"));
  const auth = encodeKey(subscription.getKey("auth"));
  if (!p256dh || !auth) return false;

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint: subscription.endpoint, p256dh, auth },
      { onConflict: "user_id,endpoint" },
    );
  return !error;
}

export async function disablePush(userId: string) {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
  } catch {
    /* best effort */
  }
}
