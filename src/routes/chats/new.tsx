import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAuth } from "@/lib/use-require-auth";
import {
  createGroupChat,
  friendlyError,
  getOrCreateDirectChat,
  type Profile,
} from "@/lib/chat";
import { AppShell, TopBar } from "@/components/chat/AppShell";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/chats/new")({
  head: () => ({
    meta: [
      { title: "New chat — Ripple" },
      {
        name: "description",
        content: "Find people by name or email to start a direct chat, or create a group on Ripple.",
      },
      { property: "og:title", content: "New chat — Ripple" },
      { property: "og:description", content: "Start a direct chat or create a group on Ripple." },
    ],
  }),
  component: NewChatPage,
});

function NewChatPage() {
  const { userId, ready } = useRequireAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [groupMode, setGroupMode] = useState(false);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: people, isLoading } = useQuery({
    queryKey: ["people", term, userId],
    enabled: !!userId,
    queryFn: async () => {
      let query = supabase.from("profiles").select("*").neq("id", userId as string).limit(30);
      if (term.trim()) {
        const t = `%${term.trim()}%`;
        query = query.or(`display_name.ilike.${t},email.ilike.${t}`);
      }
      const { data, error } = await query.order("display_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const startDirect = async (other: Profile) => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const chatId = await getOrCreateDirectChat(userId, other.id);
      void navigate({ to: "/chats/$chatId", params: { chatId } });
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't open that chat."));
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (!userId || selected.length === 0) return;
    if (!groupName.trim()) {
      toast.error("Give your group a name first.");
      return;
    }
    setBusy(true);
    try {
      const chatId = await createGroupChat(
        userId,
        groupName.trim(),
        selected.map((p) => p.id),
      );
      void navigate({ to: "/chats/$chatId", params: { chatId } });
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't create that group."));
      setBusy(false);
    }
  };

  const toggle = (person: Profile) =>
    setSelected((prev) =>
      prev.some((p) => p.id === person.id)
        ? prev.filter((p) => p.id !== person.id)
        : [...prev, person],
    );

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
        title={groupMode ? "New group" : "New chat"}
        subtitle={groupMode ? "Pick members, then name your group" : "Search by name or email"}
        right={
          <Button
            variant={groupMode ? "secondary" : "ghost"}
            size="icon"
            aria-label="Toggle group mode"
            onClick={() => {
              setGroupMode((g) => !g);
              setSelected([]);
            }}
          >
            <Users className="size-5" />
          </Button>
        }
      />

      <div className="space-y-3 border-b border-border px-4 py-3">
        {groupMode ? (
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name"
            className="h-11 rounded-xl"
          />
        ) : null}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search people"
            aria-label="Search people"
            className="h-11 rounded-xl pl-9"
          />
        </div>
        {groupMode && selected.length > 0 ? (
          <p className="line-clamp-2 break-words text-xs text-muted-foreground">
            {selected.length} selected: {selected.map((p) => p.display_name).join(", ")}
          </p>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!ready || isLoading ? (
          <div className="space-y-4 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-full" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            ))}
          </div>
        ) : (people ?? []).length === 0 ? (
          <div className="px-8 py-20 text-center">
            <h2 className="text-base font-semibold text-foreground">No people found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Others appear here once they sign in to Ripple.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(people as Profile[]).map((person) => {
              const isSelected = selected.some((p) => p.id === person.id);
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => (groupMode ? toggle(person) : void startDirect(person))}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
                  >
                    <UserAvatar name={person.display_name} src={person.photo_url} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {person.display_name}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {person.status_message}
                      </span>
                    </span>
                    {groupMode && isSelected ? (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-4" />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {groupMode ? (
        <div className="sticky bottom-0 border-t border-border bg-background p-4">
          <Button
            className="h-12 w-full rounded-xl"
            disabled={busy || selected.length === 0}
            onClick={() => void createGroup()}
          >
            Create group
          </Button>
        </div>
      ) : null}
    </AppShell>
  );
}
