import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Profile } from "@/lib/chat";

export type Story = Tables<"stories">;

export type StoryGroup = {
  user: Profile;
  stories: Story[];
  allViewed: boolean;
};

export const STORY_BACKGROUNDS = [
  { key: "teal", from: "#0f766e", to: "#14b8a6" },
  { key: "sunset", from: "#c2410c", to: "#f59e0b" },
  { key: "violet", from: "#6d28d9", to: "#c026d3" },
  { key: "ocean", from: "#1e3a8a", to: "#0ea5e9" },
  { key: "forest", from: "#14532d", to: "#65a30d" },
  { key: "slate", from: "#1f2937", to: "#64748b" },
] as const;

export function backgroundStyle(background: unknown) {
  const key = (background as { key?: string } | null)?.key;
  const preset = STORY_BACKGROUNDS.find((b) => b.key === key) ?? STORY_BACKGROUNDS[0];
  return { backgroundImage: `linear-gradient(160deg, ${preset.from}, ${preset.to})` };
}

const urlCache = new Map<string, { url: string; expires: number }>();

export async function storyMediaUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  const cached = urlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from("stories").createSignedUrl(path, 3600);
  if (error || !data) throw error ?? new Error("Could not load story");
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 3000_000 });
  return data.signedUrl;
}

/** Loads all unexpired stories grouped by author, mine first. */
export async function fetchStoryFeed(meId: string): Promise<StoryGroup[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("stories")
    .select("*, profiles(*)")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as (Story & { profiles: Profile | null })[];
  if (rows.length === 0) return [];

  const { data: views } = await supabase
    .from("story_views")
    .select("story_id")
    .eq("viewer_id", meId);
  const viewed = new Set((views ?? []).map((v) => v.story_id));

  const groups = new Map<string, StoryGroup>();
  for (const row of rows) {
    if (!row.profiles) continue;
    const group = groups.get(row.user_id) ?? {
      user: row.profiles,
      stories: [],
      allViewed: true,
    };
    group.stories.push(row);
    if (!viewed.has(row.id) && row.user_id !== meId) group.allViewed = false;
    groups.set(row.user_id, group);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.user.id === meId) return -1;
    if (b.user.id === meId) return 1;
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    return 0;
  });
}

export async function markStoryViewed(storyId: string, viewerId: string) {
  await supabase.from("story_views").upsert(
    { story_id: storyId, viewer_id: viewerId },
    { onConflict: "story_id,viewer_id", ignoreDuplicates: true },
  );
}

export async function fetchStoryViewers(storyId: string) {
  const { data, error } = await supabase
    .from("story_views")
    .select("viewed_at, profiles:viewer_id(*)")
    .eq("story_id", storyId)
    .order("viewed_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { viewed_at: string; profiles: Profile | null }[])
    .filter((r) => r.profiles)
    .map((r) => ({ viewedAt: r.viewed_at, profile: r.profiles as Profile }));
}

export async function postTextStory(userId: string, text: string, backgroundKey: string) {
  const { error } = await supabase.from("stories").insert({
    user_id: userId,
    type: "text",
    text_content: text,
    background: { key: backgroundKey },
  });
  if (error) throw error;
}

export async function postMediaStory(userId: string, file: File | Blob, caption?: string) {
  const isVideo = (file.type || "").startsWith("video/");
  const ext = isVideo ? "mp4" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("stories").upload(path, file, {
    contentType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
    upsert: true,
  });
  if (upErr) throw upErr;

  const { error } = await supabase.from("stories").insert({
    user_id: userId,
    type: isVideo ? "video" : "image",
    media_url: path,
    text_content: caption?.trim() ? caption.trim() : null,
  });
  if (error) throw error;
}

export async function deleteStory(storyId: string) {
  const { error } = await supabase.from("stories").delete().eq("id", storyId);
  if (error) throw error;
}
