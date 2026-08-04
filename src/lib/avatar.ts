import { supabase } from "@/integrations/supabase/client";

const AVATAR_BUCKET = "avatars";
const cache = new Map<string, { url: string; expires: number }>();

/** True when the stored value is a bucket path rather than an absolute URL. */
export function isStoragePath(value?: string | null) {
  if (!value) return false;
  return !/^(https?:|data:|blob:)/i.test(value);
}

export async function avatarUrl(path: string) {
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24);
  if (error || !data) throw error ?? new Error("Could not load avatar");
  cache.set(path, { url: data.signedUrl, expires: Date.now() + 60 * 60 * 20 * 1000 });
  return data.signedUrl;
}

/** Uploads an avatar into the user's own folder and returns the stored path. */
export async function uploadAvatar(userId: string, file: File) {
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}
