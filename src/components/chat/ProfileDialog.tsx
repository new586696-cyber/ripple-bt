import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/chat";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";

function lastSeenLabel(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "Online";
  const d = new Date(value);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `Last seen today at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : `Last seen ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

/** Read-only view of another person's profile. */
export function ProfileDialog({
  userId,
  open,
  onOpenChange,
  online = false,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  online?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["profile", userId],
    enabled: open && !!userId,
    queryFn: async () => {
      const { data: row } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId as string)
        .maybeSingle();
      return (row ?? null) as Profile | null;
    },
  });

  const showPresence = data?.show_last_seen !== false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="sr-only">Profile</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <Skeleton className="size-24 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 pb-2 text-center">
            <UserAvatar name={data.display_name} src={data.photo_url} className="size-24" />
            <h2 className="w-full break-words text-lg font-semibold text-foreground">
              {data.display_name}
            </h2>
            {showPresence ? (
              <p className="text-xs text-muted-foreground">
                {online ? "Online" : lastSeenLabel(data.last_seen)}
              </p>
            ) : null}
            <p className="w-full break-words text-sm text-muted-foreground">
              {data.status_message}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
