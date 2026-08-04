import { useRef, useState, type ReactNode } from "react";
import {
  Check,
  CheckCheck,
  Clock,
  CornerUpLeft,
  Copy,
  Forward,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Smile,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { formatTime, type Message, type ParticipantWithProfile, type Profile } from "@/lib/chat";
import { messageSnippet, QUICK_EMOJI, MORE_EMOJI, type Reaction } from "@/lib/messaging";
import {
  attachmentKind,
  FileMessage,
  ImageMessage,
  PdfMessage,
  VideoMessage,
  VoiceMessage,
} from "@/components/chat/MediaMessage";
import { UserAvatar } from "@/components/chat/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RowMessage = Message & { pending?: boolean; failed?: boolean };

export type MessageRowProps = {
  message: RowMessage;
  isMine: boolean;
  isGroup?: boolean;
  sender: Profile | null;
  others: ParticipantWithProfile[];
  repliedTo?: { message: Message; senderName: string } | null;
  reactions: Reaction[];
  myUserId: string;
  starred: boolean;
  pinned: boolean;
  highlighted?: boolean;
  searchTerm?: string;
  memberNames: string[];
  onReply: () => void;
  onReact: (emoji: string) => void;
  onStar: () => void;
  onPin: () => void;
  onEdit: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onForward: () => void;
  onJumpToReply?: (id: string) => void;
};

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export function MessageRow(props: MessageRowProps) {
  const {
    message,
    isMine,
    isGroup,
    sender,
    others,
    repliedTo,
    reactions,
    myUserId,
    starred,
    pinned,
    highlighted,
    searchTerm,
    memberNames,
    onReply,
    onReact,
    onStar,
    onPin,
    onEdit,
    onDeleteForMe,
    onDeleteForEveryone,
    onForward,
    onJumpToReply,
  } = props;

  const [swipe, setSwipe] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const startX = useRef<number | null>(null);

  const deleted = !!message.deleted_at;
  // People who hide their read receipts never turn anyone's ticks blue.
  const receiptOthers = others.filter((o) => o.profiles?.show_read_receipts !== false);
  const seenBy = receiptOthers.filter(
    (o) => new Date(o.last_read_at).getTime() >= new Date(message.created_at).getTime(),
  );
  const grouped = groupReactions(reactions);
  const mine = reactions.find((r) => r.user_id === myUserId)?.emoji ?? null;
  const canEdit =
    isMine &&
    !deleted &&
    message.type === "text" &&
    Date.now() - new Date(message.created_at).getTime() < EDIT_WINDOW_MS;

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        "group flex w-full items-end gap-2 rounded-2xl py-0.5 transition-colors",
        isMine ? "justify-end" : "justify-start",
        highlighted && "bg-primary/10",
      )}
      onTouchStart={(e) => {
        startX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchMove={(e) => {
        if (startX.current === null || deleted) return;
        const dx = (e.touches[0]?.clientX ?? 0) - startX.current;
        setSwipe(Math.max(0, Math.min(72, dx)));
      }}
      onTouchEnd={() => {
        if (swipe > 48) onReply();
        setSwipe(0);
        startX.current = null;
      }}
      style={swipe ? { transform: `translateX(${swipe}px)` } : undefined}
    >
      {!isMine && isGroup ? (
        <UserAvatar name={sender?.display_name} src={sender?.photo_url} className="size-7" />
      ) : null}

      {isMine ? (
        <RowActions
          {...props}
          deleted={deleted}
          canEdit={canEdit}
          pinned={pinned}
          starred={starred}
          mine={mine}
          pickerOpen={pickerOpen}
          setPickerOpen={setPickerOpen}
        />
      ) : null}

      <div
        className={cn(
          "relative max-w-[78%] rounded-2xl px-3 py-2 shadow-bubble",
          isMine
            ? "rounded-br-md bg-bubble-own text-bubble-own-foreground"
            : "rounded-bl-md bg-bubble-other text-bubble-other-foreground",
          message.failed && "opacity-60 ring-1 ring-destructive",
        )}
      >
        {!isMine && isGroup && !deleted ? (
          <p className="mb-1 truncate text-xs font-semibold text-primary">
            {sender?.display_name ?? "Member"}
          </p>
        ) : null}

        {message.forwarded && !deleted ? (
          <p className="mb-1 flex items-center gap-1 text-[11px] italic opacity-70">
            <Forward className="size-3" /> Forwarded
          </p>
        ) : null}

        {repliedTo && !deleted ? (
          <button
            type="button"
            onClick={() => onJumpToReply?.(repliedTo.message.id)}
            className="mb-1.5 block w-full rounded-lg border-l-[3px] border-primary bg-background/40 px-2 py-1 text-left"
          >
            <span className="block text-[11px] font-semibold text-primary">
              {repliedTo.senderName}
            </span>
            <span className="block truncate text-[11px] opacity-80">
              {messageSnippet(repliedTo.message)}
            </span>
          </button>
        ) : null}

        {deleted ? (
          <p className="flex items-center gap-1.5 text-sm italic opacity-70">
            <Trash2 className="size-3.5" /> This message was deleted
          </p>
        ) : (
          <>
            {message.type === "image" ? <ImageMessage message={message} /> : null}
            {message.type === "voice" ? <VoiceMessage message={message} /> : null}
            {message.type === "file" ? (
              attachmentKind(message) === "video" ? (
                <VideoMessage message={message} />
              ) : attachmentKind(message) === "image" ? (
                <ImageMessage message={message} />
              ) : attachmentKind(message) === "pdf" ? (
                <PdfMessage message={message} />
              ) : (
                <FileMessage message={message} />
              )
            ) : null}

            {message.text ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {renderText(message.text, memberNames, searchTerm)}
              </p>
            ) : null}

            <LinkPreviewCard preview={message.link_preview} />
          </>
        )}

        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] opacity-70">
          {starred ? <Star className="size-3 fill-current" /> : null}
          {pinned ? <Pin className="size-3" /> : null}
          {message.edited_at && !deleted ? <span>edited</span> : null}
          <span>{formatTime(message.created_at)}</span>
          {isMine ? (
            message.failed ? (
              <TriangleAlert className="size-3.5 text-destructive" />
            ) : message.pending ? (
              <Clock className="size-3.5" />
            ) : seenBy.length === receiptOthers.length && receiptOthers.length > 0 ? (
              <CheckCheck className="size-3.5 text-primary" />
            ) : (
              <Check className="size-3.5" />
            )
          ) : null}
        </div>

        {isMine && isGroup && !message.pending && seenBy.length > 0 ? (
          <p className="break-words text-right text-[11px] opacity-60">
            Seen by {seenBy.map((s) => s.profiles?.display_name ?? "member").join(", ")}
          </p>
        ) : null}

        {grouped.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {grouped.map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(emoji)}
                aria-label={`${emoji} ${users.length}`}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]",
                  users.includes(myUserId)
                    ? "border-primary bg-primary/15"
                    : "border-border bg-background/60",
                )}
              >
                <span>{emoji}</span>
                <span className="tabular-nums">{users.length}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!isMine ? (
        <RowActions
          {...props}
          deleted={deleted}
          canEdit={canEdit}
          pinned={pinned}
          starred={starred}
          mine={mine}
          pickerOpen={pickerOpen}
          setPickerOpen={setPickerOpen}
        />
      ) : null}
    </div>
  );
}

function RowActions({
  message,
  isMine,
  deleted,
  canEdit,
  pinned,
  starred,
  mine,
  pickerOpen,
  setPickerOpen,
  onReply,
  onReact,
  onStar,
  onPin,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onForward,
}: MessageRowProps & {
  deleted: boolean;
  canEdit: boolean;
  mine: string | null;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
}) {
  if (message.pending || message.failed) return null;

  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 data-[open=true]:opacity-100">
      {!deleted ? (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Add a reaction">
              <Smile className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto max-w-64 p-2" align={isMine ? "end" : "start"}>
            <div className="flex flex-wrap gap-1">
              {[...QUICK_EMOJI, ...MORE_EMOJI].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React ${emoji}`}
                  onClick={() => {
                    onReact(emoji);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    "rounded-lg px-1.5 py-1 text-lg hover:bg-muted",
                    mine === emoji && "bg-primary/15",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Message options">
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isMine ? "end" : "start"} className="w-48">
          {!deleted ? (
            <>
              <DropdownMenuItem onClick={onReply}>
                <CornerUpLeft className="size-4" /> Reply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onForward}>
                <Forward className="size-4" /> Forward
              </DropdownMenuItem>
              {message.text ? (
                <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(message.text ?? "")}>
                  <Copy className="size-4" /> Copy text
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={onStar}>
                <Star className={cn("size-4", starred && "fill-current")} />
                {starred ? "Unstar" : "Star"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPin}>
                {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                {pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              {canEdit ? (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="size-4" /> Edit
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onClick={onDeleteForMe}>
            <Trash2 className="size-4" /> Delete for me
          </DropdownMenuItem>
          {isMine && !deleted ? (
            <DropdownMenuItem className="text-destructive" onClick={onDeleteForEveryone}>
              <Trash2 className="size-4" /> Delete for everyone
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function groupReactions(reactions: Reaction[]) {
  const map = new Map<string, string[]>();
  reactions.forEach((r) => {
    map.set(r.emoji, [...(map.get(r.emoji) ?? []), r.user_id]);
  });
  return [...map.entries()];
}

function LinkPreviewCard({ preview }: { preview: unknown }) {
  const data = preview as
    | { url?: string; title?: string; description?: string; image?: string }
    | null;
  if (!data?.url || !data.title) return null;
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-1.5 block overflow-hidden rounded-xl border border-border/60 bg-background/50"
    >
      {data.image ? (
        <img src={data.image} alt="" loading="lazy" className="h-28 w-full object-cover" />
      ) : null}
      <span className="block px-2.5 py-2">
        <span className="block truncate text-xs font-semibold">{data.title}</span>
        {data.description ? (
          <span className="mt-0.5 line-clamp-2 block text-[11px] opacity-70">
            {data.description}
          </span>
        ) : null}
        <span className="mt-0.5 block truncate text-[11px] text-primary">
          {safeHost(data.url)}
        </span>
      </span>
    </a>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Renders text with @mentions bolded, links clickable and search hits highlighted. */
function renderText(text: string, memberNames: string[], searchTerm?: string): ReactNode {
  const patterns: string[] = ["https?:\\/\\/[^\\s]+"];
  memberNames
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach((n) => patterns.push(`@${escapeRegExp(n)}`));
  if (searchTerm && searchTerm.trim().length > 1) patterns.push(escapeRegExp(searchTerm.trim()));

  const regex = new RegExp(`(${patterns.join("|")})`, "gi");
  const parts = text.split(regex).filter((p) => p !== undefined && p !== "");

  return parts.map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2"
        >
          {part}
        </a>
      );
    }
    if (part.startsWith("@") && memberNames.some((n) => `@${n}`.toLowerCase() === part.toLowerCase())) {
      return (
        <span key={i} className="font-semibold text-primary">
          {part}
        </span>
      );
    }
    if (searchTerm && part.toLowerCase() === searchTerm.trim().toLowerCase()) {
      return (
        <mark key={i} className="rounded bg-primary/30 text-inherit">
          {part}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
