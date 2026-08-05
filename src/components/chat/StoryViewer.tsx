import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Trash2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { formatTime } from "@/lib/chat";
import {
  backgroundStyle,
  deleteStory,
  fetchStoryViewers,
  markStoryViewed,
  storyMediaUrl,
  type StoryGroup,
} from "@/lib/stories";
import { haptic } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const IMAGE_MS = 5000;

/** Full-screen story player with auto-advancing progress bars. */
export function StoryViewer({
  groups,
  startIndex,
  meId,
  onClose,
  onChanged,
}: {
  groups: StoryGroup[];
  startIndex: number;
  meId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [groupIndex, setGroupIndex] = useState(startIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];
  const isMine = group?.user.id === meId;

  const mediaQuery = useQuery({
    queryKey: ["story-media", story?.media_url],
    enabled: !!story?.media_url,
    queryFn: () => storyMediaUrl(story?.media_url as string),
    staleTime: 50 * 60 * 1000,
  });

  const viewersQuery = useQuery({
    queryKey: ["story-viewers", story?.id],
    enabled: showViewers && !!story?.id,
    queryFn: () => fetchStoryViewers(story?.id as string),
  });

  useEffect(() => {
    if (story && !isMine) void markStoryViewed(story.id, meId);
  }, [story, isMine, meId]);

  const advance = useMemo(
    () => () => {
      setProgress(0);
      setShowViewers(false);
      const stories = groups[groupIndex]?.stories ?? [];
      if (storyIndex + 1 < stories.length) {
        setStoryIndex(storyIndex + 1);
      } else if (groupIndex + 1 < groups.length) {
        setGroupIndex(groupIndex + 1);
        setStoryIndex(0);
      } else {
        onClose();
      }
    },
    [groups, groupIndex, storyIndex, onClose],
  );

  const rewind = () => {
    setProgress(0);
    setShowViewers(false);
    if (storyIndex > 0) setStoryIndex(storyIndex - 1);
    else if (groupIndex > 0) {
      const prev = groupIndex - 1;
      setGroupIndex(prev);
      setStoryIndex(Math.max(0, (groups[prev]?.stories.length ?? 1) - 1));
    }
  };

  // Drive the progress bar for images and text cards; video uses its own length.
  useEffect(() => {
    if (!story || paused || showViewers) return;
    if (story.type === "video") return;
    const started = Date.now();
    const id = setInterval(() => {
      const pct = Math.min(1, (Date.now() - started) / IMAGE_MS);
      setProgress(pct);
      if (pct >= 1) advance();
    }, 50);
    return () => clearInterval(id);
  }, [story, paused, showViewers, advance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft") rewind();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  });

  if (!group || !story) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${group.user.display_name}'s story`}
      className="fixed inset-0 z-50 flex flex-col bg-viewer-backdrop"
    >
      <div className="flex gap-1 px-3 pt-3">
        {group.stories.map((s, i) => (
          <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
            <span
              className="block h-full bg-white transition-[width] duration-100 ease-linear"
              style={{
                width: i < storyIndex ? "100%" : i === storyIndex ? `${progress * 100}%` : "0%",
              }}
            />
          </span>
        ))}
      </div>

      <header className="flex items-center gap-2 px-3 py-3 text-viewer-foreground">
        <UserAvatar name={group.user.display_name} src={group.user.photo_url} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {isMine ? "Your story" : group.user.display_name}
          </p>
          <p className="text-xs opacity-70">{formatTime(story.created_at)}</p>
        </div>
        {isMine ? (
          <Button
            variant="viewer"
            size="icon"
            aria-label="Delete story"
            onClick={async () => {
              try {
                await deleteStory(story.id);
                haptic("warn");
                toast.success("Story deleted");
                onChanged();
                onClose();
              } catch {
                toast.error("We couldn't delete that story.");
              }
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
        <Button variant="viewer" size="icon" aria-label="Close story" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </header>

      <div
        className="relative min-h-0 flex-1 select-none"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {story.type === "text" ? (
          <div
            className="flex size-full items-center justify-center px-10 text-center"
            style={backgroundStyle(story.background)}
          >
            <p className="text-2xl font-semibold leading-snug text-white">{story.text_content}</p>
          </div>
        ) : story.type === "video" ? (
          <video
            ref={videoRef}
            src={mediaQuery.data ?? undefined}
            autoPlay
            playsInline
            controls={false}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration) setProgress(el.currentTime / el.duration);
            }}
            onEnded={advance}
            className="absolute inset-0 m-auto max-h-full max-w-full"
          />
        ) : (
          <img
            src={mediaQuery.data ?? undefined}
            alt={story.text_content ?? "Story"}
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
          />
        )}

        {story.type !== "text" && story.text_content ? (
          <p className="absolute inset-x-0 bottom-6 px-6 text-center text-base font-medium text-white drop-shadow">
            {story.text_content}
          </p>
        ) : null}

        <button
          type="button"
          aria-label="Previous story"
          onClick={rewind}
          className="absolute inset-y-0 left-0 w-1/3 cursor-default"
        />
        <button
          type="button"
          aria-label="Next story"
          onClick={advance}
          className="absolute inset-y-0 right-0 w-1/3 cursor-default"
        />
      </div>

      {isMine ? (
        <div className="shrink-0 px-4 py-3">
          <Button
            variant="viewer"
            className="w-full rounded-xl"
            onClick={() => setShowViewers((v) => !v)}
          >
            <Eye className="size-4" />
            {showViewers ? "Hide viewers" : "Seen by"}
          </Button>
          {showViewers ? (
            <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto">
              {(viewersQuery.data ?? []).length === 0 ? (
                <li className="py-4 text-center text-sm text-viewer-foreground opacity-70">
                  No views yet
                </li>
              ) : (
                viewersQuery.data?.map((v) => (
                  <li key={v.profile.id} className="flex items-center gap-2">
                    <UserAvatar
                      name={v.profile.display_name}
                      src={v.profile.photo_url}
                      className="size-7"
                    />
                    <span className="flex-1 truncate text-sm text-viewer-foreground">
                      {v.profile.display_name}
                    </span>
                    <span className="text-xs text-viewer-foreground opacity-60">
                      {formatTime(v.viewedAt)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="pointer-events-none flex items-center justify-between px-3 pb-3 text-viewer-foreground opacity-40">
        <ChevronLeft className={cn("size-5", groupIndex === 0 && storyIndex === 0 && "invisible")} />
        <ChevronRight className="size-5" />
      </div>
    </div>
  );
}
