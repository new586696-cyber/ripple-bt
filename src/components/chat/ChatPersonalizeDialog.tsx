import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Profile } from "@/lib/chat";
import { friendlyError } from "@/lib/chat";
import {
  WALLPAPERS,
  fetchNicknames,
  fetchReceiptOverrides,
  setChatPersonalisation,
  setNickname,
  setReceiptOverride,
} from "@/lib/personalization";
import { NOTIFICATION_SOUNDS, haptic, playNotificationSound } from "@/lib/feedback";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Per-chat identity and personalisation: nickname, wallpaper, sound, receipts. */
export function ChatPersonalizeDialog({
  open,
  onOpenChange,
  chatId,
  userId,
  other,
  wallpaper,
  notificationSound,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  userId: string;
  other: Profile | null;
  wallpaper: string | null;
  notificationSound: string | null;
  onSaved: () => void;
}) {
  const [nickname, setNicknameValue] = useState("");
  const [saving, setSaving] = useState(false);

  const nicknames = useQuery({
    queryKey: ["nicknames", userId],
    enabled: open && !!userId,
    queryFn: () => fetchNicknames(userId),
  });

  const overrides = useQuery({
    queryKey: ["receipt-overrides", userId],
    enabled: open && !!userId && !!other,
    queryFn: () => fetchReceiptOverrides(userId),
  });

  useEffect(() => {
    if (!open || !other) return;
    setNicknameValue(nicknames.data?.[other.id] ?? "");
  }, [open, other, nicknames.data]);

  const receiptsOn = other ? (overrides.data?.[other.id] ?? true) : true;

  const applyWallpaper = async (key: string) => {
    try {
      await setChatPersonalisation(chatId, userId, { wallpaper: key === "none" ? null : key });
      haptic("tap");
      onSaved();
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't change the wallpaper."));
    }
  };

  const applySound = async (key: string) => {
    try {
      await setChatPersonalisation(chatId, userId, {
        notification_sound: key === "default" ? null : key,
      });
      playNotificationSound(key);
      onSaved();
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't change that sound."));
    }
  };

  const saveNickname = async () => {
    if (!other) return;
    setSaving(true);
    try {
      await setNickname(userId, other.id, nickname);
      await nicknames.refetch();
      onSaved();
      toast.success(nickname.trim() ? "Nickname saved" : "Nickname removed");
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't save that nickname."));
    } finally {
      setSaving(false);
    }
  };

  const currentWallpaper = wallpaper ?? "none";
  const currentSound = notificationSound ?? "default";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Personalise chat</DialogTitle>
          <DialogDescription>
            These choices are private to you — nobody else sees them.
          </DialogDescription>
        </DialogHeader>

        {other ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Nickname for {other.display_name}
            </h3>
            <div className="flex gap-2">
              <Input
                value={nickname}
                onChange={(e) => setNicknameValue(e.target.value)}
                placeholder={other.display_name}
                aria-label="Nickname"
                className="h-10 rounded-xl"
              />
              <Button
                className="h-10 rounded-xl"
                disabled={saving}
                onClick={() => void saveNickname()}
              >
                Save
              </Button>
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Wallpaper</h3>
          <div className="grid grid-cols-3 gap-2">
            {WALLPAPERS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => void applyWallpaper(w.key)}
                className={cn(
                  "h-16 rounded-xl border text-xs font-medium transition-colors",
                  currentWallpaper === w.key
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border",
                )}
                style={w.css ? { backgroundImage: w.css } : undefined}
              >
                <span className="rounded-md bg-background/70 px-1.5 py-0.5 text-foreground">
                  {w.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Notification sound</h3>
          <div className="flex flex-wrap gap-2">
            {NOTIFICATION_SOUNDS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => void applySound(s.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  currentSound === s.key
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {other ? (
          <section className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                Show {other.display_name}'s read receipts
              </h3>
              <p className="text-xs text-muted-foreground">
                Turn off to hide their blue ticks in this chat.
              </p>
            </div>
            <Switch
              checked={receiptsOn}
              aria-label="Read receipts in this chat"
              onCheckedChange={async (next) => {
                try {
                  await setReceiptOverride(userId, other.id, next ? null : false);
                  await overrides.refetch();
                  onSaved();
                } catch (error) {
                  toast.error(friendlyError(error, "We couldn't save that setting."));
                }
              }}
            />
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
