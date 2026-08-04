import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Tracks which users are currently online via a shared presence channel. */
export function usePresence(userId: string | null | undefined) {
  const [online, setOnline] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel("presence:global", {
      config: { presence: { key: userId } },
    });

    const sync = () => {
      const state = channel.presenceState();
      setOnline(Object.keys(state));
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return useMemo(() => new Set(online), [online]);
}

type TypingPayload = { userId: string; name: string };

/** Broadcast-based typing indicator for a single chat. */
export function useTyping(chatId: string, userId: string | null | undefined, name: string) {
  const [typing, setTyping] = useState<TypingPayload[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSent = useRef(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!chatId || !userId) return;
    const channel = supabase.channel(`typing:${chatId}`, { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as TypingPayload;
        if (!p?.userId || p.userId === userId) return;
        setTyping((prev) => (prev.some((t) => t.userId === p.userId) ? prev : [...prev, p]));
        clearTimeout(timers.current[p.userId]);
        timers.current[p.userId] = setTimeout(() => {
          setTyping((prev) => prev.filter((t) => t.userId !== p.userId));
        }, 3500);
      })
      .subscribe();
    channelRef.current = channel;

    const pending = timers.current;
    return () => {
      Object.values(pending).forEach(clearTimeout);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [chatId, userId]);

  const notifyTyping = () => {
    const now = Date.now();
    if (!channelRef.current || !userId || now - lastSent.current < 1500) return;
    lastSent.current = now;
    void channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId, name } satisfies TypingPayload,
    });
  };

  return { typing, notifyTyping };
}
