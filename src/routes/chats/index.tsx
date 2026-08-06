import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNicknames } from "@/lib/personalization";
import {
  Archive,
  BellOff,
  ChevronRight,
  MessageSquarePlus,
  Settings2,
  Star,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAuth } from "@/lib/use-require-auth";
import {
  APP_NAME,
  chatPhoto,
  chatTitle,
  fetchChatList,
  formatTime,
  type ChatListItem,
} from "@/lib/chat";
import { AppShell, TopBar } from "@/components/chat/AppShell";
import { StoriesTray } from "@/components/chat/StoriesTray";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chats/")({
  head: () => ({
    meta: [
      { title: "Your chats — Ripple" },
      {
        name: "description",
        content: "All your Ripple conversations in one place, ordered by the latest message.",
      },
      { property: "og:title", content: "Your chats — Ripple" },
      { property: "og:description", content: "All your Ripple conversations in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatListPage,
});

type Filter = "all" | "unread" | "groups";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "groups", label: "Groups" },
];

function ChatListPage() {
  const { userId, profile, ready } = useRequireAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const nicknames = useQuery({
    queryKey: ["nicknames", userId],
    enabled: !!userId,
    queryFn: () => fetchNicknames(userId as string),
  });

  const displayTitle = (item: ChatListItem) => {
    if (item.chat.type === "direct") {
      const other = item.members.find((m) => m.user_id !== userId);
      const nick = other ? nicknames.data?.[other.user_id] : undefined;
      if (nick) return nick;
    }
    return chatTitle(item, userId as string);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["chat-list", userId],
    queryFn: () => fetchChatList(userId as string),
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("chat-list-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["chat-list", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chats" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["chat-list", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_participants" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["chat-list", userId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const all = useMemo(() => (data ?? []) as ChatListItem[], [data]);
  const archived = useMemo(() => all.filter((i) => i.me.archived), [all]);
  const active = useMemo(() => all.filter((i) => !i.me.archived), [all]);

  const list = useMemo(() => {
    const base = showArchived ? archived : active;
    if (filter === "unread") return base.filter((i) => i.unread > 0);
    if (filter === "groups") return base.filter((i) => i.chat.type === "group");
    return base;
  }, [showArchived, archived, active, filter]);

  const unreadTotal = active.reduce((sum, i) => sum + i.unread, 0);

  return (
    <AppShell>
      <TopBar
        title={showArchived ? "Archived" : APP_NAME}
        subtitle={
          showArchived
            ? `${archived.length} archived chat${archived.length === 1 ? "" : "s"}`
            : profile?.display_name
              ? `Signed in as ${profile.display_name}`
              : undefined
        }
        right={
          <div className="flex items-center">
            <Link to="/starred" aria-label="Starred messages">
              <Button variant="ghost" size="icon">
                <Star className="size-5" />
              </Button>
            </Link>
            <Link to="/settings" aria-label="Profile and settings">
              <Button variant="ghost" size="icon">
                <Settings2 className="size-5" />
              </Button>
            </Link>
          </div>
        }
      />

      {userId && !showArchived ? (
        <StoriesTray
          userId={userId}
          myName={profile?.display_name ?? "You"}
          myPhoto={profile?.photo_url ?? null}
        />
      ) : null}

      <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
        {FILTERS.map((f) => {
          const activeChip = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={activeChip}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                activeChip
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              {f.label}
              {f.id === "unread" && unreadTotal > 0 ? ` · ${unreadTotal}` : ""}
            </button>
          );
        })}
        {showArchived ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto rounded-full"
            onClick={() => setShowArchived(false)}
          >
            Back to chats
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!showArchived && archived.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/60"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Archive className="size-5" />
            </span>
            <span className="flex-1 text-sm font-semibold text-foreground">Archived</span>
            <span className="text-xs text-muted-foreground">{archived.length}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ) : null}

        {!ready || isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <EmptyState
            title="We couldn't load your chats"
            body="Check your connection and try again."
          />
        ) : list.length === 0 ? (
          <EmptyState
            title={
              showArchived
                ? "Nothing archived"
                : filter === "unread"
                  ? "You're all caught up"
                  : filter === "groups"
                    ? "No group chats yet"
                    : "No chats yet"
            }
            body={
              showArchived
                ? "Chats you archive will be tucked away here."
                : filter === "all"
                  ? "Start a conversation and it will show up here."
                  : "Try a different filter."
            }
            action={!showArchived && filter === "all"}
          />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((item) => (
              <li key={item.chat.id}>
                <Link
                  to="/chats/$chatId"
                  params={{ chatId: item.chat.id }}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                >
                  <UserAvatar
                    name={displayTitle(item)}
                    src={chatPhoto(item, userId as string)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold text-foreground">
                        {displayTitle(item)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatTime(item.chat.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-muted-foreground">
                        {item.chat.last_message_text ?? "No messages yet"}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        {item.me.muted ? (
                          <BellOff className="size-3.5 text-muted-foreground" aria-label="Muted" />
                        ) : null}
                        {item.unread > 0 ? (
                          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                            {item.unread}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        to="/chats/new"
        aria-label="Start a new chat"
        className="fixed bottom-6 right-[max(1.5rem,calc(50vw-32rem+1.5rem))] flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-fab transition-transform hover:scale-105"
      >
        <MessageSquarePlus className="size-6" />
      </Link>
    </AppShell>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-border">
      {Array.from({ length: 7 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Users className="size-6" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
      {action ? (
        <Link to="/chats/new" className="mt-6">
          <Button className="rounded-xl">Start a chat</Button>
        </Link>
      ) : null}
    </div>
  );
}
