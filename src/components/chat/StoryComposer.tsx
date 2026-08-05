import { useState } from "react";
import { Image as ImageIcon, Loader2, Type as TypeIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PhotoSourceDialog } from "@/components/chat/PhotoSourceDialog";
import { compressImage } from "@/lib/image";
import { STORY_BACKGROUNDS, postMediaStory, postTextStory } from "@/lib/stories";
import { haptic, playChime } from "@/lib/feedback";
import { friendlyError } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Composer for 24-hour text or photo/video stories. */
export function StoryComposer({
  open,
  onOpenChange,
  userId,
  onPosted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onPosted: () => void;
}) {
  const [mode, setMode] = useState<"text" | "media">("text");
  const [text, setText] = useState("");
  const [background, setBackground] = useState<string>(STORY_BACKGROUNDS[0].key);
  const [media, setMedia] = useState<{ file: File; preview: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const preset = STORY_BACKGROUNDS.find((b) => b.key === background) ?? STORY_BACKGROUNDS[0];

  const reset = () => {
    if (media) URL.revokeObjectURL(media.preview);
    setMedia(null);
    setText("");
    setMode("text");
    setBackground(STORY_BACKGROUNDS[0].key);
  };

  const post = async () => {
    setBusy(true);
    try {
      if (mode === "media" && media) {
        await postMediaStory(userId, media.file, text);
      } else if (text.trim()) {
        await postTextStory(userId, text.trim(), background);
      } else {
        setBusy(false);
        return;
      }
      haptic("success");
      playChime();
      toast.success("Story shared — it disappears in 24 hours");
      reset();
      onPosted();
      onOpenChange(false);
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't share that story."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to your story</DialogTitle>
          <DialogDescription>Everyone you chat with can see it for 24 hours.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          {(
            [
              { id: "text" as const, label: "Text", icon: TypeIcon },
              { id: "media" as const, label: "Photo or video", icon: ImageIcon },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={mode === tab.id}
              onClick={() => {
                setMode(tab.id);
                if (tab.id === "media" && !media) setPickerOpen(true);
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors press-scale",
                mode === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "text" ? (
          <>
            <div
              className="flex min-h-44 items-center justify-center rounded-2xl px-6 py-8 text-center"
              style={{ backgroundImage: `linear-gradient(160deg, ${preset.from}, ${preset.to})` }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 240))}
                placeholder="Say something…"
                aria-label="Story text"
                rows={3}
                className="w-full resize-none bg-transparent text-center text-xl font-semibold text-white outline-none placeholder:text-white/60"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {STORY_BACKGROUNDS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  aria-label={`${b.key} background`}
                  aria-pressed={background === b.key}
                  onClick={() => setBackground(b.key)}
                  className={cn(
                    "size-8 rounded-full ring-offset-2 ring-offset-background transition-transform press-scale",
                    background === b.key && "ring-2 ring-primary",
                  )}
                  style={{ backgroundImage: `linear-gradient(160deg, ${b.from}, ${b.to})` }}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {media ? (
              <div className="relative overflow-hidden rounded-2xl bg-muted">
                {media.file.type.startsWith("video/") ? (
                  <video src={media.preview} controls className="max-h-64 w-full" />
                ) : (
                  <img src={media.preview} alt="Story preview" className="max-h-64 w-full object-contain" />
                )}
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Remove media"
                  className="absolute right-2 top-2 rounded-full"
                  onClick={() => {
                    URL.revokeObjectURL(media.preview);
                    setMedia(null);
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="h-32 w-full rounded-2xl"
                onClick={() => setPickerOpen(true)}
              >
                Choose a photo or video
              </Button>
            )}
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 200))}
              placeholder="Add a caption…"
              aria-label="Story caption"
              className="h-11 w-full rounded-xl border border-input bg-muted px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}

        <Button
          className="w-full rounded-xl"
          disabled={busy || (mode === "media" ? !media : !text.trim())}
          onClick={() => void post()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Share story
        </Button>
      </DialogContent>

      <PhotoSourceDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Add to your story"
        captureLabel="Take a photo"
        onPicked={async (file) => {
          const prepared = file.type.startsWith("video/")
            ? file
            : await compressImage(file, { fileName: file.name || "story.jpg" }).catch(() => file);
          setMode("media");
          setMedia({ file: prepared, preview: URL.createObjectURL(prepared) });
        }}
      />
    </Dialog>
  );
}
