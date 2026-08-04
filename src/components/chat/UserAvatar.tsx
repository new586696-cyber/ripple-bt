import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/chat";
import { avatarUrl, isStoragePath } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  src,
  className,
}: {
  name?: string | null | undefined;
  src?: string | null | undefined;
  className?: string | undefined;
}) {
  const [resolved, setResolved] = useState<string | null>(
    src && !isStoragePath(src) ? src : null,
  );

  useEffect(() => {
    let active = true;
    if (!src) {
      setResolved(null);
      return;
    }
    if (!isStoragePath(src)) {
      setResolved(src);
      return;
    }
    setResolved(null);
    void avatarUrl(src)
      .then((url) => active && setResolved(url))
      .catch(() => active && setResolved(null));
    return () => {
      active = false;
    };
  }, [src]);

  return (
    <Avatar className={cn("size-11 shrink-0 border border-border/60", className)}>
      {resolved ? <AvatarImage src={resolved} alt={name ?? "Avatar"} /> : null}
      <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
