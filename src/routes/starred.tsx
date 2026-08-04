import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Star, StarOff } from "lucide-react";
import { useRequireAuth } from "@/lib/use-require-auth";
import { formatTime, friendlyError } from "@/lib/chat";
import { fetchStarredMessages, messageSnippet, toggleStar } from "@/lib/messaging";
import { AppShell, TopBar } from "@/components/chat/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/starred")({
  head: () => ({
    meta: [
      { title: "Starred messages — Ripple" },
      {
        name: "description",
        content: "Every message you've starred across your Ripple conversations, newest first.",
      },
      { property: "og:title", content: "Starred messages — Ripple" },
      { property: "og:description", content: "Your saved Ripple messages in one list." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StarredPage,
});

function StarredPage() {
  const { userId, ready } = useRequireAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["starred", userId],
    enabled: !!userId,
    queryFn: () => fetchStarredMessages(userId as string),
  });

  const entries = data ?? [];

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
        title="Starred messages"
        subtitle={entries.length ? `${entries.length} saved` : undefined}
      />

      <div className="flex-1 overflow-y-auto">
        {!ready || isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="px-8 py-24 text-center text-sm text-muted-foreground">
            We couldn't load your starred messages. Check your connection and try again.
          </p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-24 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Star className="size-6" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">No starred messages</h2>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Star a message from its menu and it will be saved here for quick access.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map(({ message, chat }) => (
              <li key={message.id} className="flex items-start gap-3 px-4 py-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    void navigate({
                      to: "/chats/$chatId",
                      params: { chatId: message.chat_id },
                      hash: `message-${message.id}`,
                    })
                  }
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {chat?.type === "group" ? (chat.group_name ?? "Group chat") : "Direct message"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatTime(message.created_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">
                    {messageSnippet(message)}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove star"
                  onClick={async () => {
                    if (!userId) return;
                    try {
                      await toggleStar(message.id, userId, true);
                      void queryClient.invalidateQueries({ queryKey: ["starred", userId] });
                      void queryClient.invalidateQueries({ queryKey: ["stars", userId] });
                    } catch (error) {
                      toast.error(friendlyError(error, "We couldn't unstar that message."));
                    }
                  }}
                >
                  <StarOff className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
