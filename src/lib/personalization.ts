import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Sticker = Tables<"stickers">;

/* --------------------------------------------------------------- nicknames */

export async function fetchNicknames(meId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("contact_nicknames")
    .select("target_id, nickname")
    .eq("owner_id", meId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.target_id, r.nickname]));
}

export async function setNickname(meId: string, targetId: string, nickname: string) {
  const trimmed = nickname.trim();
  if (!trimmed) {
    const { error } = await supabase
      .from("contact_nicknames")
      .delete()
      .eq("owner_id", meId)
      .eq("target_id", targetId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("contact_nicknames")
    .upsert(
      { owner_id: meId, target_id: targetId, nickname: trimmed },
      { onConflict: "owner_id,target_id" },
    );
  if (error) throw error;
}

/* -------------------------------------------------------- receipt overrides */

export async function fetchReceiptOverrides(meId: string): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from("receipt_overrides")
    .select("target_id, show_read_receipts")
    .eq("owner_id", meId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.target_id, r.show_read_receipts]));
}

export async function setReceiptOverride(meId: string, targetId: string, value: boolean | null) {
  if (value === null) {
    const { error } = await supabase
      .from("receipt_overrides")
      .delete()
      .eq("owner_id", meId)
      .eq("target_id", targetId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("receipt_overrides")
    .upsert(
      { owner_id: meId, target_id: targetId, show_read_receipts: value },
      { onConflict: "owner_id,target_id" },
    );
  if (error) throw error;
}

/* ------------------------------------------------------- chat personalising */

export const WALLPAPERS = [
  { key: "none", label: "Default", css: "" },
  { key: "mist", label: "Mist", css: "linear-gradient(180deg,#e6f4f1,#f7fbfa)" },
  { key: "dusk", label: "Dusk", css: "linear-gradient(180deg,#243b53,#102a43)" },
  { key: "sand", label: "Sand", css: "linear-gradient(180deg,#fdf6ec,#f5e6d3)" },
  { key: "bloom", label: "Bloom", css: "linear-gradient(180deg,#f7e8ff,#efe1ff)" },
  { key: "ink", label: "Ink", css: "linear-gradient(180deg,#1a1a22,#0d0d12)" },
] as const;

export function wallpaperStyle(key?: string | null) {
  if (!key || key === "none") return undefined;
  if (/^https?:\/\//.test(key))
    return { backgroundImage: `url(${key})`, backgroundSize: "cover" } as const;
  const preset = WALLPAPERS.find((w) => w.key === key);
  return preset?.css ? { backgroundImage: preset.css } : undefined;
}

export async function setChatPersonalisation(
  chatId: string,
  userId: string,
  patch: { wallpaper?: string | null; notification_sound?: string | null },
) {
  const { error } = await supabase
    .from("chat_participants")
    .update(patch)
    .eq("chat_id", chatId)
    .eq("user_id", userId);
  if (error) throw error;
}

/* ---------------------------------------------------------------- stickers */

const stickerUrls = new Map<string, { url: string; expires: number }>();

export async function stickerUrl(path: string) {
  const cached = stickerUrls.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from("stickers").createSignedUrl(path, 3600);
  if (error || !data) throw error ?? new Error("Could not load sticker");
  stickerUrls.set(path, { url: data.signedUrl, expires: Date.now() + 3000_000 });
  return data.signedUrl;
}

export async function fetchStickers(meId: string): Promise<Sticker[]> {
  const { data, error } = await supabase
    .from("stickers")
    .select("*")
    .eq("user_id", meId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSticker(meId: string, blob: Blob) {
  const path = `${meId}/${crypto.randomUUID()}.png`;
  const { error: upErr } = await supabase.storage.from("stickers").upload(path, blob, {
    contentType: "image/png",
    upsert: true,
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from("stickers")
    .insert({ user_id: meId, path })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSticker(sticker: Sticker) {
  await supabase.storage.from("stickers").remove([sticker.path]);
  const { error } = await supabase.from("stickers").delete().eq("id", sticker.id);
  if (error) throw error;
}

const RECENT_KEY = "ripple:recent-stickers";

export function recentStickerIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function markStickerUsed(id: string) {
  if (typeof window === "undefined") return;
  const next = [id, ...recentStickerIds().filter((x) => x !== id)].slice(0, 12);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

/* ------------------------------------------------------------------ drafts */

const DRAFT_PREFIX = "ripple:draft:";

export function readDraft(chatId: string) {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DRAFT_PREFIX + chatId) ?? "";
}

export function writeDraft(chatId: string, text: string) {
  if (typeof window === "undefined") return;
  if (text.trim()) localStorage.setItem(DRAFT_PREFIX + chatId, text);
  else localStorage.removeItem(DRAFT_PREFIX + chatId);
}
