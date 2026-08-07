/**
 * Offline outbox: text messages composed without a connection are stored and
 * flushed automatically the moment the browser comes back online.
 */

const KEY = "ripple:outbox";

export type QueuedMessage = {
  id: string;
  chatId: string;
  text: string;
  mentions: string[];
  replyTo: string | null;
  createdAt: string;
};

function readAll(): QueuedMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as QueuedMessage[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: QueuedMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-100)));
  } catch {
    /* storage is best-effort */
  }
}

export function outboxFor(chatId: string) {
  return readAll().filter((m) => m.chatId === chatId);
}

export function queueMessage(message: QueuedMessage) {
  writeAll([...readAll(), message]);
}

export function dequeueMessage(id: string) {
  writeAll(readAll().filter((m) => m.id !== id));
}

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Calls back whenever connectivity returns. */
export function onReconnect(handler: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
