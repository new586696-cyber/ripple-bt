import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Chat, Message } from "@/lib/chat";

export type Reaction = Tables<"message_reactions">;
export type Pin = Tables<"chat_pins">;

export const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
export const MORE_EMOJI = ["🔥", "🎉", "👏", "😍", "🤔", "😅", "💯", "✅", "👀", "🥲"];

/* ---------------------------------------------------------------- reactions */

export async function fetchReactions(chatId: string): Promise<Reaction[]> {
  const { data, error } = await supabase
    .from("message_reactions")
    .select("*, messages!inner(chat_id)")
    .eq("messages.chat_id", chatId);
  if (error) throw error;
  return (data ?? []) as unknown as Reaction[];
}

export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
  current?: string | null,
) {
  if (current === emoji) {
    const { error } = await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("message_reactions")
    .upsert({ message_id: messageId, user_id: userId, emoji }, { onConflict: "message_id,user_id" });
  if (error) throw error;
}

/* -------------------------------------------------------------------- stars */

export async function fetchStarIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("message_stars")
    .select("message_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.message_id);
}

export async function toggleStar(messageId: string, userId: string, starred: boolean) {
  if (starred) {
    const { error } = await supabase
      .from("message_stars")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("message_stars")
      .insert({ message_id: messageId, user_id: userId });
    if (error) throw error;
  }
}

export type StarredEntry = { message: Message; chat: Chat | null };

export async function fetchStarredMessages(userId: string): Promise<StarredEntry[]> {
  const { data, error } = await supabase
    .from("message_stars")
    .select("created_at, messages(*, chats(*))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { messages: (Message & { chats: Chat | null }) | null }[])
    .filter((r) => r.messages)
    .map((r) => {
      const message = r.messages as Message & { chats: Chat | null };
      return { message, chat: message.chats ?? null };
    });
}

/* ---------------------------------------------------------------- deletions */

export async function fetchMyHiddenIds(chatId: string, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("message_deletions")
    .select("message_id, messages!inner(chat_id)")
    .eq("user_id", userId)
    .eq("messages.chat_id", chatId);
  if (error) throw error;
  return (data ?? []).map((r) => r.message_id);
}

export async function deleteForMe(messageId: string, userId: string) {
  const { error } = await supabase
    .from("message_deletions")
    .insert({ message_id: messageId, user_id: userId });
  if (error) throw error;
}

export async function deleteForEveryone(messageId: string) {
  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString(), text: null, media_url: null, media_meta: null })
    .eq("id", messageId);
  if (error) throw error;
}

export async function editMessage(messageId: string, text: string) {
  const { error } = await supabase
    .from("messages")
    .update({ text, edited_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw error;
}

/* --------------------------------------------------------------------- pins */

export async function fetchPins(chatId: string) {
  const { data, error } = await supabase
    .from("chat_pins")
    .select("*, messages(*)")
    .eq("chat_id", chatId)
    .order("pinned_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as (Pin & { messages: Message | null })[];
}

export async function pinMessage(chatId: string, messageId: string, userId: string) {
  const { error } = await supabase
    .from("chat_pins")
    .insert({ chat_id: chatId, message_id: messageId, pinned_by: userId });
  if (error) throw error;
}

export async function unpinMessage(chatId: string, messageId: string) {
  const { error } = await supabase
    .from("chat_pins")
    .delete()
    .eq("chat_id", chatId)
    .eq("message_id", messageId);
  if (error) throw error;
}

/* ------------------------------------------------------------------ forward */

export async function forwardMessage(message: Message, chatIds: string[], userId: string) {
  const rows = chatIds.map((chatId) => ({
    chat_id: chatId,
    sender_id: userId,
    type: message.type,
    text: message.text,
    media_url: message.media_url,
    media_meta: message.media_meta,
    forwarded: true,
  }));
  const { error } = await supabase.from("messages").insert(rows);
  if (error) throw error;
}

/* ----------------------------------------------------------- mute / archive */

export async function setChatFlag(
  chatId: string,
  userId: string,
  patch: { muted?: boolean; archived?: boolean },
) {
  const { error } = await supabase
    .from("chat_participants")
    .update(patch)
    .eq("chat_id", chatId)
    .eq("user_id", userId);
  if (error) throw error;
}

/* ------------------------------------------------------------------- blocks */

export async function fetchBlock(meId: string, otherId: string) {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("*")
    .or(
      `and(blocker_id.eq.${meId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${meId})`,
    );
  if (error) throw error;
  const rows = data ?? [];
  return {
    iBlocked: rows.some((r) => r.blocker_id === meId),
    blockedMe: rows.some((r) => r.blocker_id === otherId),
  };
}

export async function blockUser(meId: string, otherId: string) {
  const { error } = await supabase
    .from("user_blocks")
    .insert({ blocker_id: meId, blocked_id: otherId });
  if (error) throw error;
}

export async function unblockUser(meId: string, otherId: string) {
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", meId)
    .eq("blocked_id", otherId);
  if (error) throw error;
}

/* ----------------------------------------------------------------- snippets */

export function messageSnippet(message: Pick<Message, "type" | "text" | "media_meta" | "deleted_at">) {
  if (message.deleted_at) return "This message was deleted";
  if (message.text) return message.text;
  if (message.type === "image") return "Photo";
  if (message.type === "voice") return "Voice message";
  if (message.type === "file") {
    const meta = (message.media_meta ?? {}) as { fileName?: string };
    return meta.fileName || "File";
  }
  return "";
}

export const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

export function firstUrl(text?: string | null) {
  if (!text) return null;
  const match = text.match(URL_PATTERN);
  return match ? match[0] : null;
}
