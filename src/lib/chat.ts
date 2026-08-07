import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
export type Chat = Tables<"chats">;
export type Participant = Tables<"chat_participants">;
export type Message = Tables<"messages">;

export type ParticipantWithProfile = Participant & { profiles: Profile | null };

export type ChatListItem = {
  chat: Chat;
  me: Participant;
  members: ParticipantWithProfile[];
  unread: number;
};

export const APP_NAME = "Ripple";

export function directKeyFor(a: string, b: string) {
  return [a, b].sort().join("_");
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function chatTitle(item: { chat: Chat; members: ParticipantWithProfile[] }, meId: string) {
  if (item.chat.type === "group") return item.chat.group_name || "Group chat";
  const other = item.members.find((m) => m.user_id !== meId);
  return other?.profiles?.display_name || "Unknown";
}

export function chatPhoto(item: { chat: Chat; members: ParticipantWithProfile[] }, meId: string) {
  if (item.chat.type === "group") return item.chat.group_photo_url;
  return item.members.find((m) => m.user_id !== meId)?.profiles?.photo_url ?? null;
}

export function formatTime(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function dayLabel(value: string) {
  const d = new Date(value);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

export function friendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!navigator.onLine) return "You appear to be offline. Check your connection and try again.";
  if (/row-level security|permission|denied|violates/i.test(message))
    return "You don't have permission to do that.";
  if (/duplicate key/i.test(message)) return "That already exists.";
  if (/network|fetch/i.test(message)) return "Network problem — please try again.";
  return fallback;
}

/** Loads every chat the current user participates in, with members and unread counts. */
export async function fetchChatList(meId: string): Promise<ChatListItem[]> {
  const { data: mine, error } = await supabase
    .from("chat_participants")
    .select("*, chats(*)")
    .eq("user_id", meId);
  if (error) throw error;

  const rows = (mine ?? []) as (Participant & { chats: Chat | null })[];
  const chatIds = rows.map((r) => r.chat_id);
  if (chatIds.length === 0) return [];

  const [{ data: members }, { data: msgs }] = await Promise.all([
    supabase.from("chat_participants").select("*, profiles(*)").in("chat_id", chatIds),
    supabase.from("messages").select("chat_id, created_at, sender_id").in("chat_id", chatIds),
  ]);

  const memberList = (members ?? []) as ParticipantWithProfile[];

  const items: ChatListItem[] = rows
    .filter((r) => r.chats)
    .map((r) => {
      const unread = (msgs ?? []).filter(
        (m) =>
          m.chat_id === r.chat_id &&
          m.sender_id !== meId &&
          new Date(m.created_at).getTime() > new Date(r.last_read_at).getTime(),
      ).length;
      return {
        chat: r.chats as Chat,
        me: r,
        members: memberList.filter((m) => m.chat_id === r.chat_id),
        unread,
      };
    });

  return items.sort((a, b) => {
    const at = new Date(a.chat.last_message_at ?? a.chat.created_at).getTime();
    const bt = new Date(b.chat.last_message_at ?? b.chat.created_at).getTime();
    return bt - at;
  });
}

/** Finds an existing direct chat with `otherId` or creates one. Returns the chat id. */
export async function getOrCreateDirectChat(meId: string, otherId: string) {
  const key = directKeyFor(meId, otherId);
  const { data: existing } = await supabase
    .from("chats")
    .select("id")
    .eq("direct_key", key)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("chats")
    .insert({ type: "direct", direct_key: key, created_by: meId })
    .select("id")
    .single();

  if (error) {
    // Another device may have created it in parallel — reuse it.
    const { data: retry } = await supabase
      .from("chats")
      .select("id")
      .eq("direct_key", key)
      .maybeSingle();
    if (retry) return retry.id;
    throw error;
  }

  const { error: partError } = await supabase.from("chat_participants").insert([
    { chat_id: created.id, user_id: meId },
    { chat_id: created.id, user_id: otherId },
  ]);
  if (partError) throw partError;
  return created.id;
}

export async function createGroupChat(meId: string, name: string, memberIds: string[]) {
  const { data: created, error } = await supabase
    .from("chats")
    .insert({ type: "group", group_name: name, created_by: meId })
    .select("id")
    .single();
  if (error) throw error;

  const rows = [
    { chat_id: created.id, user_id: meId, is_admin: true },
    ...memberIds
      .filter((id) => id !== meId)
      .map((id) => ({ chat_id: created.id, user_id: id, is_admin: false })),
  ];
  const { error: partError } = await supabase.from("chat_participants").insert(rows);
  if (partError) throw partError;
  return created.id;
}

export async function markChatRead(chatId: string, meId: string) {
  await supabase
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("chat_id", chatId)
    .eq("user_id", meId);
}

export async function uploadChatMedia(
  chatId: string,
  messageId: string,
  file: File | Blob,
  fileName: string,
) {
  const path = `chats/${chatId}/${messageId}/${fileName}`;
  const { error } = await supabase.storage.from("chat-media").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

const signedUrlCache = new Map<string, { url: string; expires: number }>();

export async function signedMediaUrl(path: string) {
  const cached = signedUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(path, 3600);
  if (error || !data) throw error ?? new Error("Could not load attachment");
  signedUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 3000_000 });
  return data.signedUrl;
}

/** Returns an already-signed URL when one is cached, without a round trip. */
export function cachedMediaUrl(path: string | null) {
  if (!path) return null;
  const cached = signedUrlCache.get(path);
  return cached && cached.expires > Date.now() ? cached.url : null;
}

/** Warms the signed-URL cache so media can render without a skeleton step. */
export async function prefetchMediaUrls(paths: (string | null)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p && !cachedMediaUrl(p)))];
  await Promise.all(unique.map((p) => signedMediaUrl(p).catch(() => null)));
}

export function formatBytes(bytes?: number | null) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(seconds?: number | null) {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
