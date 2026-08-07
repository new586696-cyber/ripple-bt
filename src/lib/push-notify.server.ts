import { sendWebPush } from "./webpush.server";

export type NotifyInput = {
  chatId: string;
  senderId: string;
  preview: string;
};

/** Fans a new-message notification out to every eligible recipient's devices. */
export async function fanOutMessagePush({ chatId, senderId, preview }: NotifyInput) {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] ?? "mailto:push@ripple.app";
  if (!publicKey || !privateKey) return { sent: 0, skipped: "missing-keys" as const };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: chat }, { data: sender }, { data: participants }] = await Promise.all([
    supabaseAdmin.from("chats").select("type, group_name").eq("id", chatId).maybeSingle(),
    supabaseAdmin.from("profiles").select("display_name").eq("id", senderId).maybeSingle(),
    supabaseAdmin
      .from("chat_participants")
      .select("user_id, muted, muted_until")
      .eq("chat_id", chatId),
  ]);

  const now = Date.now();
  const recipients = (participants ?? []).filter((p) => {
    if (p.user_id === senderId) return false;
    if (p.muted) return false;
    if (p.muted_until && new Date(p.muted_until).getTime() > now) return false;
    return true;
  });
  if (recipients.length === 0) return { sent: 0 };

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in(
      "user_id",
      recipients.map((r) => r.user_id),
    );
  if (!subs || subs.length === 0) return { sent: 0 };

  const senderName = sender?.display_name ?? "Someone";
  const title =
    chat?.type === "group" ? (chat.group_name ?? "Group chat") : senderName;
  const body = chat?.type === "group" ? `${senderName}: ${preview}` : preview;

  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const status = await sendWebPush(
          sub,
          { title, body, url: `/chats/${chatId}`, tag: chatId },
          { publicKey, privateKey, subject },
        );
        if (status === 404 || status === 410) dead.push(sub.id);
        else if (status >= 200 && status < 300) sent += 1;
      } catch {
        /* one bad endpoint must not block the rest */
      }
    }),
  );

  if (dead.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);
  }

  return { sent };
}

/** Sends a confirmation push to every device the given user has registered. */
export async function sendTestPushToUser(userId: string) {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] ?? "mailto:push@ripple.app";
  if (!publicKey || !privateKey) return { sent: 0, reason: "missing-keys" as const };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { sent: 0, reason: "no-subscription" as const };

  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const status = await sendWebPush(
          sub,
          {
            title: "Ripple",
            body: "Push notifications are working on this device.",
            url: "/chats",
            tag: "ripple-test",
          },
          { publicKey, privateKey, subject },
        );
        if (status === 404 || status === 410) dead.push(sub.id);
        else if (status >= 200 && status < 300) sent += 1;
      } catch {
        /* one bad endpoint must not block the rest */
      }
    }),
  );

  if (dead.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);
  }

  return { sent, reason: sent > 0 ? ("ok" as const) : ("delivery-failed" as const) };
}
