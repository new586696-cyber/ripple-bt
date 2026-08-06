import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Ban,
  BellOff,
  Bell,
  Flame,
  Info,
  Palette,
  MoreVertical,
  Pin,
  Search,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useRequireAuth } from "@/lib/use-require-auth";
import {
  chatPhoto,
  chatTitle,
  dayLabel,
  formatTime,
  friendlyError,
  markChatRead,
  uploadChatMedia,
  type Chat,
  type Message,
  type ParticipantWithProfile,
  type Profile,
} from "@/lib/chat";
import {
  blockUser,
  deleteForEveryone,
  deleteForMe,
  editMessage,
  fetchBlock,
  fetchMyHiddenIds,
  fetchPins,
  fetchReactions,
  fetchStarIds,
  firstUrl,
  forwardMessage,
  messageSnippet,
  pinMessage,
  setChatFlag,
  toggleReaction,
  toggleStar,
  unblockUser,
  unpinMessage,
} from "@/lib/messaging";
import { fetchLinkPreview } from "@/lib/link-preview.functions";
import { usePresence, useTyping } from "@/lib/realtime";
import { notifyMessage } from "@/lib/notifications";
import { fetchNicknames, wallpaperStyle } from "@/lib/personalization";
import { fetchStreak, streakIsLive } from "@/lib/streaks";
import { haptic, playNotificationSound } from "@/lib/feedback";
import { notifyNewMessage } from "@/lib/push.functions";
import { ChatPersonalizeDialog } from "@/components/chat/ChatPersonalizeDialog";
import { AppShell, TopBar } from "@/components/chat/AppShell";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { Composer, type EditTarget, type OutgoingMessage, type ReplyTarget } from "@/components/chat/Composer";
import { MessageRow, type RowMessage } from "@/components/chat/MessageRow";
import { ForwardDialog } from "@/components/chat/ForwardDialog";
import { ProfileDialog } from "@/components/chat/ProfileDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/chats/$chatId/")({
  head: () => ({
    meta: [
      { title: "Conversation — Ripple" },
      {
        name: "description",
        content: "Read and reply in real time with text, photos, voice notes and files on Ripple.",
      },
      { property: "og:title", content: "Conversation — Ripple" },
      { property: "og:description", content: "Real-time conversation on Ripple." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { chatId } = Route.useParams();
  const { userId, profile, ready } = useRequireAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSeenId = useRef<string | null>(null);

  const [pending, setPending] = useState<RowMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [personaliseOpen, setPersonaliseOpen] = useState(false);

  const chatQuery = useQuery({
    queryKey: ["chat", chatId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: chat, error }, { data: members }] = await Promise.all([
        supabase.from("chats").select("*").eq("id", chatId).maybeSingle(),
        supabase.from("chat_participants").select("*, profiles(*)").eq("chat_id", chatId),
      ]);
      if (error) throw error;
      return { chat: chat as Chat | null, members: (members ?? []) as ParticipantWithProfile[] };
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", chatId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  const reactionsQuery = useQuery({
    queryKey: ["reactions", chatId],
    enabled: !!userId,
    queryFn: () => fetchReactions(chatId),
  });

  const starsQuery = useQuery({
    queryKey: ["stars", userId],
    enabled: !!userId,
    queryFn: () => fetchStarIds(userId as string),
  });

  const hiddenQuery = useQuery({
    queryKey: ["hidden", chatId, userId],
    enabled: !!userId,
    queryFn: () => fetchMyHiddenIds(chatId, userId as string),
  });

  const pinsQuery = useQuery({
    queryKey: ["pins", chatId],
    enabled: !!userId,
    queryFn: () => fetchPins(chatId),
  });

  const members = useMemo(() => chatQuery.data?.members ?? [], [chatQuery.data]);
  const chat = chatQuery.data?.chat ?? null;
  const others = useMemo(() => members.filter((m) => m.user_id !== userId), [members, userId]);
  const me = members.find((m) => m.user_id === userId);
  const otherUser = chat?.type === "direct" ? (others[0]?.profiles ?? null) : null;

  const nicknamesQuery = useQuery({
    queryKey: ["nicknames", userId],
    enabled: !!userId,
    queryFn: () => fetchNicknames(userId as string),
  });

  const streakQuery = useQuery({
    queryKey: ["streak", userId, otherUser?.id],
    enabled: !!userId && !!otherUser?.id,
    queryFn: () => fetchStreak(userId as string, otherUser?.id as string),
  });

  const blockQuery = useQuery({
    queryKey: ["block", userId, otherUser?.id],
    enabled: !!userId && !!otherUser?.id,
    queryFn: () => fetchBlock(userId as string, otherUser?.id as string),
  });

  const online = usePresence(userId);
  // Presence is reciprocal: hiding your own last seen also hides everyone else's.
  const iSharePresence = profile?.show_last_seen !== false;
  const canSeePresence = iSharePresence && !!otherUser && otherUser.show_last_seen !== false;
  const otherIsOnline = canSeePresence && online.has(otherUser.id);
  const { typing, notifyTyping } = useTyping(chatId, userId, profile?.display_name ?? "Someone");

  // Live message + read-receipt updates for this conversation.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
          void queryClient.invalidateQueries({ queryKey: ["chat-list", userId] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["reactions", chatId] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_pins", filter: `chat_id=eq.${chatId}` },
        () => void queryClient.invalidateQueries({ queryKey: ["pins", chatId] }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_participants",
          filter: `chat_id=eq.${chatId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: ["chat", chatId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, userId, queryClient]);

  const hidden = useMemo(() => new Set(hiddenQuery.data ?? []), [hiddenQuery.data]);
  const starred = useMemo(() => new Set(starsQuery.data ?? []), [starsQuery.data]);
  const pinnedIds = useMemo(
    () => new Set((pinsQuery.data ?? []).map((p) => p.message_id)),
    [pinsQuery.data],
  );

  const allMessages = messagesQuery.data ?? [];
  const messages = useMemo(
    () => allMessages.filter((m) => !hidden.has(m.id)),
    [allMessages, hidden],
  );
  const messageById = useMemo(() => {
    const map = new Map<string, Message>();
    allMessages.forEach((m) => map.set(m.id, m));
    return map;
  }, [allMessages]);

  // Desktop notification for messages that arrive from someone else.
  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest || !userId) return;
    if (lastSeenId.current === null) {
      lastSeenId.current = latest.id;
      return;
    }
    if (latest.id === lastSeenId.current) return;
    lastSeenId.current = latest.id;
    if (latest.sender_id === userId || me?.muted) return;
    const sender = members.find((m) => m.user_id === latest.sender_id)?.profiles;
    playNotificationSound(me?.notification_sound);
    haptic("tap");
    notifyMessage(sender?.display_name ?? "New message", messageSnippet(latest), chatId);
  }, [messages, userId, members, me?.muted, me?.notification_sound, chatId]);

  // Mark as read on open and whenever new messages arrive while open.
  useEffect(() => {
    if (!userId || !ready) return;
    void markChatRead(chatId, userId).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["chat-list", userId] });
    });
  }, [chatId, userId, ready, messages.length, queryClient]);

  useEffect(() => {
    if (searchOpen) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending.length, searchOpen]);

  const nickname = otherUser ? nicknamesQuery.data?.[otherUser.id] : undefined;
  const streak = streakQuery.data ?? null;
  const streakLive = streakIsLive(streak);

  const title = nickname
    ? nickname
    : chat
    ? chatTitle({ chat, members }, userId ?? "")
    : chatQuery.isLoading
      ? "Loading…"
      : "Conversation";

  const typingLabel =
    typing.length === 0
      ? null
      : typing.length === 1
        ? `${typing[0]?.name ?? "Someone"} is typing…`
        : "Several people are typing…";

  const subtitle =
    typingLabel ??
    (chat?.type === "group"
      ? `${members.length} members`
      : otherIsOnline
        ? "Online"
        : canSeePresence
          ? "Offline"
          : undefined);

  const iBlocked = blockQuery.data?.iBlocked ?? false;
  const blockedMe = blockQuery.data?.blockedMe ?? false;

  const jumpTo = (id: string) => {
    setHighlightId(id);
    document.getElementById(`message-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => setHighlightId(null), 1600);
  };

  const refetchAfterMutation = (keys: unknown[][]) => {
    keys.forEach((key) => void queryClient.invalidateQueries({ queryKey: key }));
  };

  const send = async (outgoing: OutgoingMessage) => {
    if (!userId) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const base: RowMessage = {
      id,
      chat_id: chatId,
      sender_id: userId,
      created_at: now,
      type: "text",
      text: null,
      media_url: null,
      media_meta: null,
      reply_to: replyTo?.message.id ?? null,
      deleted_at: null,
      edited_at: null,
      forwarded: false,
      link_preview: null,
      mentions: [],
      pending: true,
    };

    let optimistic: RowMessage = base;
    if (outgoing.kind === "text")
      optimistic = { ...base, text: outgoing.text, mentions: outgoing.mentions };
    if (outgoing.kind === "image")
      optimistic = { ...base, type: "image", text: outgoing.caption || null };
    if (outgoing.kind === "file") optimistic = { ...base, type: "file" };
    if (outgoing.kind === "voice") optimistic = { ...base, type: "voice" };

    const replyId = replyTo?.message.id ?? null;
    setReplyTo(null);
    setPending((prev) => [...prev, optimistic]);

    try {
      let mediaUrl: string | null = null;
      let mediaMeta: Json | null = null;

      if (outgoing.kind === "image") {
        mediaUrl = await uploadChatMedia(chatId, id, outgoing.file, outgoing.file.name);
        mediaMeta = { mimeType: outgoing.file.type, sizeBytes: outgoing.file.size };
      } else if (outgoing.kind === "file") {
        mediaUrl = await uploadChatMedia(chatId, id, outgoing.file, outgoing.file.name);
        mediaMeta = {
          mimeType: outgoing.file.type,
          sizeBytes: outgoing.file.size,
          fileName: outgoing.file.name,
        };
      } else if (outgoing.kind === "voice") {
        mediaUrl = await uploadChatMedia(chatId, id, outgoing.blob, "voice-note.webm");
        mediaMeta = {
          mimeType: outgoing.blob.type,
          sizeBytes: outgoing.blob.size,
          durationSeconds: outgoing.durationSeconds,
          waveform: outgoing.waveform,
        };
      }

      const { data, error } = await supabase
        .from("messages")
        .insert({
          id,
          chat_id: chatId,
          sender_id: userId,
          type: optimistic.type,
          text: optimistic.text,
          media_url: mediaUrl,
          media_meta: mediaMeta,
          reply_to: replyId,
          mentions: optimistic.mentions,
        })
        .select("*")
        .single();
      if (error) throw error;

      queryClient.setQueryData<Message[]>(["messages", chatId], (prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === data.id)) return list;
        return [...list, data as Message];
      });
      setPending((prev) => prev.filter((m) => m.id !== id));
      void queryClient.invalidateQueries({ queryKey: ["chat-list", userId] });

      void notifyNewMessage({
        data: { chatId, preview: messageSnippet(data as Message) },
      }).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ["streak", userId, otherUser?.id] });

      const url = firstUrl(optimistic.text);
      if (url) void attachLinkPreview(id, url);
    } catch (error) {
      setPending((prev) => prev.map((m) => (m.id === id ? { ...m, failed: true } : m)));
      toast.error(friendlyError(error, "Your message didn't send."), {
        action: {
          label: "Dismiss",
          onClick: () => setPending((prev) => prev.filter((m) => m.id !== id)),
        },
      });
      setTimeout(() => setPending((prev) => prev.filter((m) => m.id !== id)), 6000);
    }
  };

  const attachLinkPreview = async (messageId: string, url: string) => {
    try {
      const preview = await fetchLinkPreview({ data: { url } });
      if (!preview) return;
      await supabase
        .from("messages")
        .update({ link_preview: preview as unknown as Json })
        .eq("id", messageId);
      void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
    } catch {
      /* previews are best-effort */
    }
  };

  useEffect(() => {
    if (!chatQuery.isLoading && chatQuery.data && !chatQuery.data.chat) {
      toast.error("That conversation isn't available to you.");
      void navigate({ to: "/chats", replace: true });
    }
  }, [chatQuery.isLoading, chatQuery.data, navigate]);

  const combined: RowMessage[] = [...messages, ...pending];
  const visible = term.trim()
    ? combined.filter((m) => (m.text ?? "").toLowerCase().includes(term.trim().toLowerCase()))
    : combined;

  const memberNames = members.map((m) => m.profiles?.display_name ?? "").filter(Boolean);
  const mentionCandidates = others
    .map((m) => m.profiles)
    .filter((p): p is Profile => !!p);
  const pinnedList = (pinsQuery.data ?? []).filter((p) => p.messages && !hidden.has(p.message_id));

  return (
    <AppShell>
      <TopBar
        left={
          <Link to="/chats" aria-label="Back to chats">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-5" />
            </Button>
          </Link>
        }
        title={
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 text-left"
            disabled={!otherUser}
            onClick={() => otherUser && setProfileUserId(otherUser.id)}
          >
            <span className="relative shrink-0">
              <UserAvatar
                name={title}
                src={chat ? chatPhoto({ chat, members }, userId ?? "") : null}
                className="size-8"
              />
              {otherIsOnline ? (
                <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
              ) : null}
            </span>
            <span className="truncate">{title}</span>
            {streakLive ? (
              <span
                className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"
                title={`${streak?.count} day streak`}
              >
                <Flame className="size-3" />
                {streak?.count}
              </span>
            ) : null}
          </button>
        }
        subtitle={subtitle}
        right={
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search in conversation"
              onClick={() => {
                setSearchOpen((s) => !s);
                setTerm("");
              }}
            >
              <Search className="size-5" />
            </Button>
            {chat?.type === "group" ? (
              <Link to="/chats/$chatId/info" params={{ chatId }} aria-label="Group info">
                <Button variant="ghost" size="icon">
                  <Info className="size-5" />
                </Button>
              </Link>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Chat options">
                  <MoreVertical className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={async () => {
                    if (!userId) return;
                    await setChatFlag(chatId, userId, { muted: !me?.muted });
                    refetchAfterMutation([["chat", chatId], ["chat-list", userId]]);
                    toast.success(me?.muted ? "Notifications on" : "Chat muted");
                  }}
                >
                  {me?.muted ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                  {me?.muted ? "Unmute" : "Mute notifications"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!userId) return;
                    await setChatFlag(chatId, userId, { archived: !me?.archived });
                    refetchAfterMutation([["chat", chatId], ["chat-list", userId]]);
                    toast.success(me?.archived ? "Chat unarchived" : "Chat archived");
                  }}
                >
                  {me?.archived ? (
                    <ArchiveRestore className="size-4" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                  {me?.archived ? "Unarchive" : "Archive chat"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPersonaliseOpen(true)}>
                  <Palette className="size-4" />
                  Personalise chat
                </DropdownMenuItem>
                {otherUser ? (
                  <DropdownMenuItem
                    className={iBlocked ? "" : "text-destructive"}
                    onClick={async () => {
                      if (!userId) return;
                      try {
                        if (iBlocked) await unblockUser(userId, otherUser.id);
                        else await blockUser(userId, otherUser.id);
                        refetchAfterMutation([["block", userId, otherUser.id]]);
                        toast.success(iBlocked ? "Unblocked" : "Blocked");
                      } catch (error) {
                        toast.error(friendlyError(error, "We couldn't update the block."));
                      }
                    }}
                  >
                    <Ban className="size-4" />
                    {iBlocked ? `Unblock ${otherUser.display_name}` : `Block ${otherUser.display_name}`}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {searchOpen ? (
        <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search this conversation"
            aria-label="Search this conversation"
            className="h-10 rounded-xl"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close search"
            onClick={() => {
              setSearchOpen(false);
              setTerm("");
            }}
          >
            <X className="size-5" />
          </Button>
        </div>
      ) : null}

      {pinnedList.length > 0 ? (
        <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2">
          <Pin className="size-4 shrink-0 text-primary" />
          <button
            type="button"
            onClick={() => {
              const first = pinnedList[0];
              if (first) jumpTo(first.message_id);
            }}
            className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground"
          >
            <span className="font-semibold text-foreground">Pinned:</span>{" "}
            {messageSnippet(pinnedList[0]?.messages as Message)}
            {pinnedList.length > 1 ? ` · +${pinnedList.length - 1} more` : ""}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Unpin message"
            onClick={async () => {
              const first = pinnedList[0];
              if (!first) return;
              await unpinMessage(chatId, first.message_id);
              refetchAfterMutation([["pins", chatId]]);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <div
        className="flex-1 space-y-1 overflow-y-auto bg-thread px-3 py-4"
        style={wallpaperStyle(me?.wallpaper)}
      >
        {messagesQuery.isLoading ? (
          <MessagesSkeleton />
        ) : messagesQuery.isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            We couldn't load these messages. Check your connection.
          </p>
        ) : visible.length === 0 ? (
          <div className="py-20 text-center">
            <h2 className="text-base font-semibold text-foreground">
              {term.trim() ? "No matches" : "No messages yet"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {term.trim() ? "Try a different search." : "Say hello to get things started."}
            </p>
          </div>
        ) : (
          visible.map((message, index) => {
            const prev = visible[index - 1];
            const showDay =
              !prev ||
              new Date(prev.created_at).toDateString() !==
                new Date(message.created_at).toDateString();
            const replied = message.reply_to ? messageById.get(message.reply_to) : undefined;
            return (
              <div key={message.id}>
                {showDay ? (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-background px-3 py-1 text-xs text-muted-foreground shadow-bubble">
                      {dayLabel(message.created_at)}
                    </span>
                  </div>
                ) : null}
                <MessageRow
                  message={message}
                  isMine={message.sender_id === userId}
                  isGroup={chat?.type === "group"}
                  sender={members.find((m) => m.user_id === message.sender_id)?.profiles ?? null}
                  others={others}
                  myUserId={userId ?? ""}
                  memberNames={memberNames}
                  reactions={(reactionsQuery.data ?? []).filter((r) => r.message_id === message.id)}
                  starred={starred.has(message.id)}
                  pinned={pinnedIds.has(message.id)}
                  highlighted={highlightId === message.id}
                  {...(term.trim() ? { searchTerm: term } : {})}
                  repliedTo={
                    replied
                      ? {
                          message: replied,
                          senderName:
                            members.find((m) => m.user_id === replied.sender_id)?.profiles
                              ?.display_name ?? "Member",
                        }
                      : null
                  }
                  onJumpToReply={jumpTo}
                  onReply={() =>
                    setReplyTo({
                      message,
                      senderName:
                        message.sender_id === userId
                          ? "You"
                          : (members.find((m) => m.user_id === message.sender_id)?.profiles
                              ?.display_name ?? "Member"),
                    })
                  }
                  onReact={async (emoji) => {
                    if (!userId) return;
                    const current =
                      (reactionsQuery.data ?? []).find(
                        (r) => r.message_id === message.id && r.user_id === userId,
                      )?.emoji ?? null;
                    try {
                      await toggleReaction(message.id, userId, emoji, current);
                      refetchAfterMutation([["reactions", chatId]]);
                    } catch (error) {
                      toast.error(friendlyError(error, "We couldn't add that reaction."));
                    }
                  }}
                  onStar={async () => {
                    if (!userId) return;
                    try {
                      await toggleStar(message.id, userId, starred.has(message.id));
                      refetchAfterMutation([["stars", userId]]);
                    } catch (error) {
                      toast.error(friendlyError(error, "We couldn't star that message."));
                    }
                  }}
                  onPin={async () => {
                    if (!userId) return;
                    try {
                      if (pinnedIds.has(message.id)) await unpinMessage(chatId, message.id);
                      else await pinMessage(chatId, message.id, userId);
                      refetchAfterMutation([["pins", chatId]]);
                    } catch (error) {
                      toast.error(friendlyError(error, "We couldn't pin that message."));
                    }
                  }}
                  onEdit={() => setEditing({ id: message.id, text: message.text ?? "" })}
                  onDeleteForMe={async () => {
                    if (!userId) return;
                    try {
                      await deleteForMe(message.id, userId);
                      refetchAfterMutation([["hidden", chatId, userId]]);
                    } catch (error) {
                      toast.error(friendlyError(error, "We couldn't delete that message."));
                    }
                  }}
                  onDeleteForEveryone={async () => {
                    try {
                      await deleteForEveryone(message.id);
                      refetchAfterMutation([["messages", chatId]]);
                    } catch (error) {
                      toast.error(friendlyError(error, "We couldn't delete that message."));
                    }
                  }}
                  onForward={() => setForwarding(message)}
                />
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {typingLabel ? (
        <p className="bg-thread px-4 pb-1 text-xs italic text-muted-foreground">{typingLabel}</p>
      ) : null}

      <Composer
        chatId={chatId}
        {...(userId ? { userId } : {})}
        onSend={send}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        onSaveEdit={async (text) => {
          if (!editing) return;
          try {
            await editMessage(editing.id, text);
            setEditing(null);
            refetchAfterMutation([["messages", chatId]]);
          } catch (error) {
            toast.error(friendlyError(error, "We couldn't save that edit."));
          }
        }}
        onTyping={notifyTyping}
        mentionCandidates={chat?.type === "group" ? mentionCandidates : []}
        disabled={iBlocked || blockedMe}
        disabledReason={
          iBlocked
            ? `You blocked ${otherUser?.display_name ?? "this person"}. Unblock them to send messages.`
            : "You can't reply to this conversation."
        }
      />

      {userId ? (
        <ChatPersonalizeDialog
          open={personaliseOpen}
          onOpenChange={setPersonaliseOpen}
          chatId={chatId}
          userId={userId}
          other={otherUser}
          wallpaper={me?.wallpaper ?? null}
          notificationSound={me?.notification_sound ?? null}
          onSaved={() => {
            refetchAfterMutation([
              ["chat", chatId],
              ["nicknames", userId],
              ["chat-list", userId],
            ]);
          }}
        />
      ) : null}

      <ProfileDialog
        userId={profileUserId}
        open={!!profileUserId}
        onOpenChange={(open) => !open && setProfileUserId(null)}
        online={iSharePresence && !!profileUserId && online.has(profileUserId)}
        viewerSharesPresence={iSharePresence}
      />

      {userId ? (
        <ForwardDialog
          open={!!forwarding}
          onOpenChange={(open) => !open && setForwarding(null)}
          userId={userId}
          onConfirm={async (chatIds) => {
            if (!forwarding) return;
            try {
              await forwardMessage(forwarding, chatIds, userId);
              toast.success(`Forwarded to ${chatIds.length} chat${chatIds.length === 1 ? "" : "s"}`);
              refetchAfterMutation([["messages", chatId], ["chat-list", userId]]);
            } catch (error) {
              toast.error(friendlyError(error, "We couldn't forward that message."));
            }
          }}
        />
      ) : null}
    </AppShell>
  );
}

function MessagesSkeleton() {
  return (
    <div className="space-y-3 py-2">
      {[70, 40, 55, 35, 60].map((width, i) => (
        <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
          <Skeleton className="h-10 rounded-2xl" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}
