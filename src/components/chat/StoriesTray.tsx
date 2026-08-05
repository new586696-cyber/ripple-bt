import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { StoryComposer } from "@/components/chat/StoryComposer";
import { StoryViewer } from "@/components/chat/StoryViewer";
import { fetchStoryFeed } from "@/lib/stories";
import { haptic } from "@/lib/feedback";
import { cn } from "@/lib/utils";

/** Horizontal tray of 24-hour stories shown above the chat list. */
export function StoriesTray({ userId, myName, myPhoto }: {
  userId: string;
  myName: string;
  myPhoto: string | null;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const feed = useQuery({
    queryKey: ["stories", userId],
    queryFn: () => fetchStoryFeed(userId),
    staleTime: 60_000,
  });

  const groups = feed.data ?? [];
  const mine = groups.find((g) => g.user.id === userId);
  const others = groups.filter((g) => g.user.id !== userId);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto border-b border-border bg-background px-3 py-3">
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            if (mine) setViewerIndex(groups.indexOf(mine));
            else setComposerOpen(true);
          }}
          className="flex w-16 shrink-0 flex-col items-center gap-1.5 press-scale"
        >
          <span className="relative">
            <UserAvatar name={myName} src={myPhoto} className="size-14" />
            <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
              <Plus className="size-3" />
            </span>
          </span>
          <span className="w-full truncate text-center text-[11px] text-muted-foreground">
            Your story
          </span>
        </button>

        {others.map((group) => (
          <button
            key={group.user.id}
            type="button"
            onClick={() => {
              haptic("tap");
              setViewerIndex(groups.indexOf(group));
            }}
            className="flex w-16 shrink-0 flex-col items-center gap-1.5 press-scale"
          >
            <span
              className={cn(
                "rounded-full p-[2px]",
                group.allViewed
                  ? "bg-border"
                  : "bg-[conic-gradient(from_180deg,var(--color-primary),var(--color-accent),var(--color-primary))]",
              )}
            >
              <UserAvatar
                name={group.user.display_name}
                src={group.user.photo_url}
                className="size-14 border-2 border-background"
              />
            </span>
            <span className="w-full truncate text-center text-[11px] text-muted-foreground">
              {group.user.display_name}
            </span>
          </button>
        ))}

        {mine ? (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="flex w-16 shrink-0 flex-col items-center gap-1.5 press-scale"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Plus className="size-5" />
            </span>
            <span className="w-full truncate text-center text-[11px] text-muted-foreground">
              Add
            </span>
          </button>
        ) : null}
      </div>

      <StoryComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        userId={userId}
        onPosted={() => void feed.refetch()}
      />

      {viewerIndex !== null ? (
        <StoryViewer
          groups={groups}
          startIndex={viewerIndex}
          meId={userId}
          onClose={() => {
            setViewerIndex(null);
            void feed.refetch();
          }}
          onChanged={() => void feed.refetch()}
        />
      ) : null}
    </>
  );
}
