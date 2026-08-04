import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { chatPhoto, chatTitle, fetchChatList } from "@/lib/chat";

export function ForwardDialog({
  open,
  onOpenChange,
  userId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onConfirm: (chatIds: string[]) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["chat-list", userId],
    queryFn: () => fetchChatList(userId),
    enabled: open,
  });

  const items = (data ?? []).filter((item) =>
    chatTitle(item, userId).toLowerCase().includes(term.toLowerCase()),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelected([]);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[80vh] gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Forward message</DialogTitle>
          <DialogDescription>Pick one or more chats to send this to.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-10 rounded-xl pl-9"
          />
        </div>

        <ul className="max-h-72 overflow-y-auto">
          {isLoading ? (
            <li className="py-6 text-center text-sm text-muted-foreground">Loading chats…</li>
          ) : items.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted-foreground">No chats found.</li>
          ) : (
            items.map((item) => {
              const id = item.chat.id;
              const checked = selected.includes(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((prev) =>
                        prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted"
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    <UserAvatar
                      name={chatTitle(item, userId)}
                      src={chatPhoto(item, userId)}
                      className="size-9"
                    />
                    <span className="truncate text-sm font-medium">{chatTitle(item, userId)}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <DialogFooter>
          <Button
            className="w-full rounded-xl"
            disabled={selected.length === 0 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(selected);
                setSelected([]);
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Sending…" : `Send to ${selected.length || ""} chat${selected.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
