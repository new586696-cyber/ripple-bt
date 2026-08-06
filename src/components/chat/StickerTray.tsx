import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/chat";
import {
  createSticker,
  deleteSticker,
  fetchStickers,
  markStickerUsed,
  recentStickerIds,
  stickerUrl,
  type Sticker,
} from "@/lib/personalization";
import { compressImage } from "@/lib/image";
import { haptic, playPop } from "@/lib/feedback";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function StickerButton({
  sticker,
  onPick,
  onDelete,
}: {
  sticker: Sticker;
  onPick: (url: string) => void;
  onDelete: () => void;
}) {
  const url = useQuery({
    queryKey: ["sticker-url", sticker.path],
    queryFn: () => stickerUrl(sticker.path),
    staleTime: 30 * 60_000,
  });

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!url.data}
        onClick={() => url.data && onPick(url.data)}
        className="press-scale flex aspect-square w-full items-center justify-center rounded-xl bg-muted p-1"
      >
        {url.data ? (
          <img src={url.data} alt="Sticker" className="max-h-full max-w-full object-contain" />
        ) : null}
      </button>
      <button
        type="button"
        aria-label="Delete sticker"
        onClick={onDelete}
        className="absolute -right-1 -top-1 rounded-full bg-background p-1 text-muted-foreground shadow-bubble"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

/** Personal sticker tray: upload your own, tap one to send it. */
export function StickerTray({
  open,
  onOpenChange,
  userId,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSend: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const stickers = useQuery({
    queryKey: ["stickers", userId],
    enabled: open,
    queryFn: () => fetchStickers(userId),
  });

  const recents = recentStickerIds();
  const list = [...(stickers.data ?? [])].sort(
    (a, b) => recents.indexOf(b.id) - recents.indexOf(a.id),
  );

  const add = async (file: File) => {
    setBusy(true);
    try {
      const prepared = await compressImage(file, { fileName: "sticker.png" }).catch(() => file);
      await createSticker(userId, prepared);
      await stickers.refetch();
      toast.success("Sticker added");
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't save that sticker."));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (sticker: Sticker, url: string) => {
    try {
      const blob = await (await fetch(url)).blob();
      markStickerUsed(sticker.id);
      haptic("tap");
      playPop();
      onSend(new File([blob], "sticker.png", { type: blob.type || "image/png" }));
      onOpenChange(false);
    } catch {
      toast.error("We couldn't send that sticker.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stickers</DialogTitle>
          <DialogDescription>Your personal tray — tap one to send it.</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-72 grid-cols-4 gap-3 overflow-y-auto p-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground"
          >
            <Plus className="size-5" />
            {busy ? "Saving…" : "Add"}
          </button>
          {list.map((sticker) => (
            <StickerButton
              key={sticker.id}
              sticker={sticker}
              onPick={(url) => void pick(sticker, url)}
              onDelete={async () => {
                try {
                  await deleteSticker(sticker);
                  await stickers.refetch();
                } catch (error) {
                  toast.error(friendlyError(error, "We couldn't delete that sticker."));
                }
              }}
            />
          ))}
        </div>

        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add a transparent PNG or any image to build your tray.
          </p>
        ) : null}

        <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
          Close
        </Button>

        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void add(file);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
