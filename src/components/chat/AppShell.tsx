import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Mobile-first centred column that stays comfortable on desktop. */
export function AppShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-dvh bg-app-canvas">
      <div
        className={cn(
          "mx-auto flex min-h-dvh w-full max-w-2xl flex-col bg-background shadow-panel sm:min-h-dvh",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function TopBar({
  left,
  title,
  subtitle,
  right,
}: {
  left?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
      {left ? <div className="shrink-0">{left}</div> : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight text-foreground">{title}</h1>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="flex shrink-0 items-center">{right}</div> : null}
    </header>
  );
}
