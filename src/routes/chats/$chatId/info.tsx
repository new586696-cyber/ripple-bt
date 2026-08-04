import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LogOut, Pencil, Search, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAuth } from "@/lib/use-require-auth";
import { friendlyError, type Chat, type ParticipantWithProfile, type Profile } from "@/lib/chat";
import { AppShell, TopBar } from "@/components/chat/AppShell";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { ProfileDialog } from "@/components/chat/ProfileDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/chats/$chatId/info")({
  head: () => ({
    meta: [
      { title: "Group info — Ripple" },
      {
        name: "description",
        content: "See who is in the group, manage members as an admin, or leave the conversation.",
      },
      { property: "og:title", content: "Group info — Ripple" },
      { property: "og:description", content: "Manage your Ripple group and its members." },
    ],
  }),
  component: GroupInfoPage,
});

function GroupInfoPage() {
  const { chatId } = Route.useParams();
  const { userId } = useRequireAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState("");
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["chat", chatId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: chat }, { data: members }] = await Promise.all([
        supabase.from("chats").select("*").eq("id", chatId).maybeSingle(),
        supabase.from("chat_participants").select("*, profiles(*)").eq("chat_id", chatId),
      ]);
      return { chat: chat as Chat | null, members: (members ?? []) as ParticipantWithProfile[] };
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["people", term, userId],
    enabled: adding && !!userId,
    queryFn: async () => {
      let query = supabase.from("profiles").select("*").limit(20);
      if (term.trim()) {
        const t = `%${term.trim()}%`;
        query = query.or(`display_name.ilike.${t},email.ilike.${t}`);
      }
      const { data: rows } = await query.order("display_name");
      return (rows ?? []) as Profile[];
    },
  });

  const chat = data?.chat ?? null;
  const members = data?.members ?? [];
  const me = members.find((m) => m.user_id === userId);
  const isAdmin = !!me?.is_admin;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["chat", chatId] });

  const saveDetails = async () => {
    try {
      const { error } = await supabase
        .from("chats")
        .update({
          group_name: name.trim() || chat?.group_name || "Group",
          group_photo_url: photo.trim() || null,
        })
        .eq("id", chatId);
      if (error) throw error;
      setEditing(false);
      await refresh();
      toast.success("Group updated");
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't update this group."));
    }
  };

  const addMember = async (person: Profile) => {
    try {
      const { error } = await supabase
        .from("chat_participants")
        .insert({ chat_id: chatId, user_id: person.id });
      if (error) throw error;
      await refresh();
      toast.success(`${person.display_name} was added`);
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't add that person."));
    }
  };

  const removeMember = async (member: ParticipantWithProfile) => {
    try {
      const { error } = await supabase
        .from("chat_participants")
        .delete()
        .eq("chat_id", chatId)
        .eq("user_id", member.user_id);
      if (error) throw error;
      await refresh();
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't remove that person."));
    }
  };

  const leaveGroup = async () => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from("chat_participants")
        .delete()
        .eq("chat_id", chatId)
        .eq("user_id", userId);
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ["chat-list", userId] });
      void navigate({ to: "/chats", replace: true });
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't remove you from this group."));
    }
  };

  const memberIds = new Set(members.map((m) => m.user_id));

  return (
    <AppShell>
      <TopBar
        left={
          <Link to="/chats/$chatId" params={{ chatId }} aria-label="Back to conversation">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-5" />
            </Button>
          </Link>
        }
        title="Group info"
        subtitle={isAdmin ? "You are an admin" : undefined}
      />

      <div className="flex-1 overflow-y-auto pb-10">
        {isLoading ? (
          <div className="space-y-4 p-6">
            <Skeleton className="mx-auto size-24 rounded-3xl" />
            <Skeleton className="mx-auto h-4 w-40" />
          </div>
        ) : (
          <>
            <section className="flex flex-col items-center gap-3 border-b border-border px-6 py-8">
              <UserAvatar
                name={chat?.group_name}
                src={chat?.group_photo_url}
                className="size-24 rounded-3xl"
              />
              {editing ? (
                <div className="w-full space-y-2">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Group name"
                    className="h-11 rounded-xl"
                  />
                  <Input
                    value={photo}
                    onChange={(e) => setPhoto(e.target.value)}
                    placeholder="Group photo URL (optional)"
                    className="h-11 rounded-xl"
                  />
                  <div className="flex gap-2">
                    <Button className="flex-1 rounded-xl" onClick={() => void saveDetails()}>
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1 rounded-xl"
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="w-full break-words text-center text-xl font-semibold text-foreground">
                    {chat?.group_name ?? "Group"}
                  </h2>
                  <p className="text-sm text-muted-foreground">{members.length} members</p>
                  {isAdmin ? (
                    <Button
                      variant="secondary"
                      className="rounded-xl"
                      onClick={() => {
                        setName(chat?.group_name ?? "");
                        setPhoto(chat?.group_photo_url ?? "");
                        setEditing(true);
                      }}
                    >
                      <Pencil className="size-4" /> Edit group
                    </Button>
                  ) : null}
                </>
              )}
            </section>

            <section className="px-4 py-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">Members</h3>
                {isAdmin ? (
                  <Button variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
                    <UserPlus className="size-4" /> Add
                  </Button>
                ) : null}
              </div>

              {adding ? (
                <div className="mb-4 rounded-2xl border border-border p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={term}
                      onChange={(e) => setTerm(e.target.value)}
                      placeholder="Search people to add"
                      aria-label="Search people to add"
                      className="h-10 rounded-xl pl-9"
                    />
                  </div>
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                    {(candidates ?? [])
                      .filter((p) => !memberIds.has(p.id))
                      .map((person) => (
                        <li key={person.id}>
                          <button
                            type="button"
                            onClick={() => void addMember(person)}
                            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted"
                          >
                            <UserAvatar
                              name={person.display_name}
                              src={person.photo_url}
                              className="size-9"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm">{person.display_name}</span>
                            <UserPlus className="size-4 shrink-0 text-muted-foreground" />
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

              <ul className="divide-y divide-border">
                {members.map((member) => (
                  <li key={member.user_id} className="flex items-center gap-3 py-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => setProfileUserId(member.user_id)}
                    >
                      <UserAvatar
                        name={member.profiles?.display_name}
                        src={member.profiles?.photo_url}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {member.profiles?.display_name ?? "Member"}
                          {member.user_id === userId ? " (you)" : ""}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {member.profiles?.status_message}
                        </span>
                      </span>
                    </button>
                    {member.is_admin ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                        <ShieldCheck className="size-3" /> Admin
                      </span>
                    ) : null}
                    {isAdmin && member.user_id !== userId ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={`Remove ${member.profiles?.display_name ?? "member"}`}
                        onClick={() => void removeMember(member)}
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section className="px-4">
              <Button
                variant="ghost"
                className="w-full justify-start rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void leaveGroup()}
              >
                <LogOut className="size-4" /> Leave group
              </Button>
            </section>
          </>
        )}
      </div>

      <ProfileDialog
        userId={profileUserId}
        open={!!profileUserId}
        onOpenChange={(open) => !open && setProfileUserId(null)}
      />
    </AppShell>
  );
}
