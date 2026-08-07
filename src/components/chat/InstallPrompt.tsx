import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import {
  IOS_INSTALL_STEPS,
  canPromptInstall,
  dismissInstall,
  installDismissed,
  isStandalone,
  needsIosInstructions,
  promptInstall,
  subscribeInstall,
} from "@/lib/install";
import { Button } from "@/components/ui/button";

/** Written steps for iOS Safari, where there is no install event to hook. */
export function IosInstallSteps({ className }: { className?: string }) {
  return (
    <ol className={className ?? "mt-2 space-y-1 text-xs text-muted-foreground"}>
      {IOS_INSTALL_STEPS.map((step, i) => (
        <li key={step} className="flex gap-2">
          <span className="font-semibold text-foreground">{i + 1}.</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** Dismissible "Install Ripple" banner. Shown once, then only from Settings. */
export function InstallPrompt() {
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => force((n) => n + 1);
    const unsubscribe = subscribeInstall(update);
    if (!isStandalone() && !installDismissed()) setOpen(true);
    return () => {
      unsubscribe();
    };
  }, []);

  const ios = needsIosInstructions();
  const native = canPromptInstall();
  if (!open || isStandalone() || (!native && !ios)) return null;

  const close = () => {
    dismissInstall();
    setOpen(false);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-border bg-card p-3 shadow-fab">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          {ios ? <Share className="size-5" /> : <Download className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Install Ripple</p>
          <p className="text-xs text-muted-foreground">
            {ios
              ? "Add Ripple to your Home Screen to get notifications and open it like an app."
              : "Add Ripple to your device for an app icon, faster launch and reliable notifications."}
          </p>
          {ios ? <IosInstallSteps /> : null}
          {native ? (
            <Button
              size="sm"
              className="mt-2 rounded-xl"
              onClick={async () => {
                await promptInstall();
                close();
              }}
            >
              Install
            </Button>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" aria-label="Dismiss install banner" onClick={close}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
