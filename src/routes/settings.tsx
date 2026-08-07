import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BellRing, Camera, Download, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRequireAuth } from "@/lib/use-require-auth";
import { friendlyError } from "@/lib/chat";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { uploadAvatar } from "@/lib/avatar";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";
import {
  notificationPreference,
  notificationsSupported,
  setNotificationsEnabled,
} from "@/lib/notifications";
import {
  disablePush,
  enablePush,
  needsHomeScreenInstall,
  pushSupported,
  registerServiceWorker,
} from "@/lib/push";
import { sendTestPush } from "@/lib/push.functions";
import {
  canPromptInstall,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from "@/lib/install";
import { IosInstallSteps } from "@/components/chat/InstallPrompt";
import {
  hapticsEnabled,
  playChime,
  setHapticsEnabled,
  setSoundsEnabled,
  soundsEnabled,
} from "@/lib/feedback";
import { AppShell, TopBar } from "@/components/chat/AppShell";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { PhotoSourceDialog } from "@/components/chat/PhotoSourceDialog";
import { ImageCropDialog } from "@/components/chat/ImageCropDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Your profile — Ripple" },
      {
        name: "description",
        content:
          "Update your Ripple photo, display name and status, and manage theme, privacy and notification settings.",
      },
      { property: "og:title", content: "Your profile — Ripple" },
      {
        property: "og:description",
        content: "Manage your Ripple profile, theme, privacy and notifications.",
      },
    ],
  }),
  component: SettingsPage,
});

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingsPage() {
  const { userId } = useRequireAuth();
  const { profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [theme, setThemeState] = useState<Theme>("system");
  const [notifOn, setNotifOn] = useState(false);
  const [notifDenied, setNotifDenied] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [sounds, setSounds] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [installHint, setInstallHint] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [canInstall, setCanInstall] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastSeen, setLastSeen] = useState(true);
  const [receipts, setReceipts] = useState(true);

  useEffect(() => {
    setThemeState(getStoredTheme());
    setNotifOn(notificationPreference());
    if (notificationsSupported()) setNotifDenied(Notification.permission === "denied");
    setSounds(soundsEnabled());
    setHaptics(hapticsEnabled());
    setInstallHint(needsHomeScreenInstall());
    setInstalled(isStandalone());
    setCanInstall(canPromptInstall());
    if (!pushSupported()) return;
    void (async () => {
      const registration = await registerServiceWorker();
      const sub = await registration?.pushManager.getSubscription();
      setPushOn(!!sub && Notification.permission === "granted");
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeInstall(() => setCanInstall(canPromptInstall()));
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name);
    setStatus(profile.status_message);
    setLastSeen(profile.show_last_seen);
    setReceipts(profile.show_read_receipts);
  }, [profile]);

  const patchProfile = async (patch: TablesUpdate<"profiles">, message: string) => {
    if (!userId) return;
    try {
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
      await refreshProfile();
      toast.success(message);
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't save that setting."));
    }
  };

  const save = async () => {
    if (!userId) return;
    if (!name.trim()) {
      toast.error("Your name can't be empty.");
      return;
    }
    setSaving(true);
    await patchProfile(
      {
        display_name: name.trim(),
        status_message: status.trim() || "Hey there! I'm using Ripple",
      },
      "Profile saved",
    );
    setSaving(false);
  };

  const uploadPhoto = async (file: File) => {
    if (!userId) return;
    setUploading(true);
    try {
      const path = await uploadAvatar(userId, file);
      const { error } = await supabase
        .from("profiles")
        .update({ photo_url: path })
        .eq("id", userId);
      if (error) throw error;
      await refreshProfile();
      setCropFile(null);
      toast.success("Photo updated");
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't upload that photo."));
    } finally {
      setUploading(false);
    }
  };

  const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

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
        title="Profile"
        subtitle={profile?.email ?? undefined}
      />

      <div className="flex-1 space-y-8 overflow-y-auto p-5">
        {!profile ? (
          <div className="space-y-4">
            <Skeleton className="mx-auto size-24 rounded-full" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                className="relative rounded-full"
                aria-label="Change profile photo"
                disabled={uploading}
                onClick={() => setPickerOpen(true)}
              >
                <UserAvatar name={name} src={profile.photo_url} className="size-24" />
                <span className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-bubble">
                  <Camera className="size-4" />
                </span>
              </button>
              <span className="text-xs text-muted-foreground">
                {uploading ? "Uploading…" : "Tap to change your photo"}
              </span>
            </div>

            <section className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">Display name</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">Status message</span>
                <Textarea
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  rows={2}
                  className="rounded-xl"
                />
              </label>
              <Button
                className="h-12 w-full rounded-xl"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-semibold text-muted-foreground">Appearance</h2>
              <div className="grid grid-cols-3 gap-2">
                {themeOptions.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setTheme(value);
                      setThemeState(value);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors",
                      theme === value
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="size-5" />
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-semibold text-muted-foreground">Notifications</h2>
              <div className="divide-y divide-border">
                <Row
                  label="Message notifications"
                  hint="Get alerted when a new message arrives while Ripple isn't in focus."
                >
                  <Switch
                    checked={notifOn}
                    disabled={!notificationsSupported()}
                    aria-label="Message notifications"
                    onCheckedChange={async (next) => {
                      const enabled = await setNotificationsEnabled(next);
                      setNotifOn(enabled);
                      if (next && !enabled) {
                        setNotifDenied(Notification.permission === "denied");
                        toast.error("Notifications are blocked", {
                          description:
                            "Allow notifications for this site in your browser settings, then try again.",
                        });
                      }
                    }}
                  />
                </Row>
                <Row
                  label="Push notifications"
                  hint="Delivered even when Ripple is closed, on this device."
                >
                  <Switch
                    checked={pushOn}
                    disabled={!pushSupported() || pushBusy}
                    aria-label="Push notifications"
                    onCheckedChange={async (next) => {
                      if (!userId) return;
                      setPushBusy(true);
                      try {
                        if (next) {
                          const ok = await enablePush(userId);
                          setPushOn(ok);
                          if (ok) toast.success("Push notifications on");
                          else
                            toast.error("We couldn't turn on push", {
                              description:
                                "Allow notifications for this site, then try again.",
                            });
                        } else {
                          await disablePush(userId);
                          setPushOn(false);
                          toast.success("Push notifications off");
                        }
                      } finally {
                        setPushBusy(false);
                      }
                    }}
                  />
                </Row>
              </div>
              {installHint && !installed ? (
                <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-foreground">
                    Add Ripple to your Home Screen first
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    On iPhone and iPad, notifications only arrive once Ripple is installed. In a
                    browser tab they will never be delivered.
                  </p>
                  <IosInstallSteps />
                </div>
              ) : null}
              {canInstall && !installed ? (
                <Button
                  variant="outline"
                  className="mt-2 h-10 w-full rounded-xl"
                  onClick={() => void promptInstall()}
                >
                  <Download className="size-4" /> Install Ripple
                </Button>
              ) : null}
              {pushOn ? (
                <Button
                  variant="outline"
                  className="mt-2 h-10 w-full rounded-xl"
                  disabled={testing}
                  onClick={async () => {
                    setTesting(true);
                    try {
                      const result = await sendTestPush();
                      if (result.sent > 0) {
                        toast.success("Test notification sent", {
                          description: "It should appear on this device in a moment.",
                        });
                      } else if (result.reason === "no-subscription") {
                        toast.error("This device isn't subscribed", {
                          description: "Switch push notifications off and on again.",
                        });
                      } else if (result.reason === "missing-keys") {
                        toast.error("Push isn't configured on the server yet.");
                      } else {
                        toast.error("The notification couldn't be delivered", {
                          description:
                            "Your subscription may have expired — toggle push off and on again.",
                        });
                      }
                    } catch {
                      toast.error("We couldn't send the test notification.");
                    } finally {
                      setTesting(false);
                    }
                  }}
                >
                  <BellRing className="size-4" />
                  {testing ? "Sending…" : "Send a test notification"}
                </Button>
              ) : null}
              {!pushSupported() ? (
                <p className="text-xs text-muted-foreground">
                  This browser doesn't support push notifications.
                </p>
              ) : null}
              {!notificationsSupported() ? (
                <p className="text-xs text-muted-foreground">
                  This browser doesn't support notifications.
                </p>
              ) : notifDenied ? (
                <p className="text-xs text-destructive">
                  Your browser is blocking notifications for Ripple. Enable them in the site
                  permissions for this page, then switch this back on.
                </p>
              ) : null}
            </section>


            <section>
              <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
                Sound &amp; haptics
              </h2>
              <div className="divide-y divide-border">
                <Row label="Sound effects" hint="Soft cues when you send and receive.">
                  <Switch
                    checked={sounds}
                    aria-label="Sound effects"
                    onCheckedChange={(next) => {
                      setSounds(next);
                      setSoundsEnabled(next);
                      if (next) playChime();
                    }}
                  />
                </Row>
                <Row label="Vibration" hint="Gentle haptics on supported devices.">
                  <Switch
                    checked={haptics}
                    aria-label="Vibration"
                    onCheckedChange={(next) => {
                      setHaptics(next);
                      setHapticsEnabled(next);
                      if (next) navigator.vibrate?.(12);
                    }}
                  />
                </Row>
              </div>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-semibold text-muted-foreground">Privacy</h2>
              <div className="divide-y divide-border">
                <Row
                  label="Show my last seen and online status"
                  hint="When off, others can't see when you're online."
                >
                  <Switch
                    checked={lastSeen}
                    aria-label="Show my last seen and online status"
                    onCheckedChange={(next) => {
                      setLastSeen(next);
                      void patchProfile({ show_last_seen: next }, "Privacy updated");
                    }}
                  />
                </Row>
                <Row
                  label="Show read receipts"
                  hint="When off, others won't see when you've read their messages."
                >
                  <Switch
                    checked={receipts}
                    aria-label="Show read receipts"
                    onCheckedChange={(next) => {
                      setReceipts(next);
                      void patchProfile({ show_read_receipts: next }, "Privacy updated");
                    }}
                  />
                </Row>
              </div>
            </section>

            <Button
              variant="ghost"
              className="w-full justify-start rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={async () => {
                await signOut();
                void navigate({ to: "/", replace: true });
              }}
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </>
        )}
      </div>

      <PhotoSourceDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPicked={(file) => setCropFile(file)}
        title="Profile photo"
      />
      <ImageCropDialog
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onCropped={(file) => uploadPhoto(file)}
      />
    </AppShell>
  );
}
