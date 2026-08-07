import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Delivers a push notification for a message the caller just sent. */
export const notifyNewMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId: string; preview: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // The caller must actually be a participant of the chat they're notifying.
    const { data: membership } = await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("chat_id", data.chatId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return { sent: 0 };

    const { fanOutMessagePush } = await import("./push-notify.server");
    return fanOutMessagePush({
      chatId: data.chatId,
      senderId: userId,
      preview: data.preview.slice(0, 180),
    });
  });

/** Fires a confirmation push to the caller's own devices. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendTestPushToUser } = await import("./push-notify.server");
    return sendTestPushToUser(context.userId);
  });
