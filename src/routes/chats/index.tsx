import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Settings2, Users } from "lucide-react";
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
import { UserAvatar } from "@/components/chat/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

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
    ],
  }),
  component: ChatListPage,
});

function ChatListPage() {
  const { userId, profile, ready } = useRequireAuth();
  const queryClient = useQueryClient();

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

  return (
    <AppShell>
      <TopBar
        title={APP_NAME}
        subtitle={profile?.display_name ? `Signed in as ${profile.display_name}` : undefined}
        right={
          <Link to="/settings" aria-label="Profile and settings">
            <Button variant="ghost" size="icon">
              <Settings2 className="size-5" />
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {!ready || isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <EmptyState
            title="We couldn't load your chats"
            body="Check your connection and try again."
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            title="No chats yet"
            body="Start a conversation and it will show up here."
            action
          />
        ) : (
          <ul className="divide-y divide-border">
            {(data as ChatListItem[]).map((item) => (
              <li key={item.chat.id}>
                <Link
                  to="/chats/$chatId"
                  params={{ chatId: item.chat.id }}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                >
                  <UserAvatar
                    name={chatTitle(item, userId as string)}
                    src={chatPhoto(item, userId as string)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold text-foreground">
                        {chatTitle(item, userId as string)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatTime(item.chat.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-muted-foreground">
                        {item.chat.last_message_text ?? "No messages yet"}
                      </span>
                      {item.unread > 0 ? (
                        <span className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                          {item.unread}
                        </span>
                      ) : null}
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
