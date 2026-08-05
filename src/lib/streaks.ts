import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type FriendStreak = Tables<"friend_streaks">;

function pair(a: string, b: string) {
  return a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a };
}

/** Reads the calm daily-interaction streak between two people. */
export async function fetchStreak(meId: string, otherId: string): Promise<FriendStreak | null> {
  const { user_a, user_b } = pair(meId, otherId);
  const { data, error } = await supabase
    .from("friend_streaks")
    .select("*")
    .eq("user_a", user_a)
    .eq("user_b", user_b)
    .maybeSingle();
  if (error) return null;
  return data;
}

/** A streak only counts as live if it was touched today or yesterday. */
export function streakIsLive(streak: FriendStreak | null) {
  if (!streak || streak.count <= 0 || !streak.last_interaction_date) return false;
  const last = new Date(`${streak.last_interaction_date}T00:00:00Z`).getTime();
  const days = Math.floor((Date.now() - last) / 86400000);
  return days <= streak.freeze_days_remaining + 1;
}
