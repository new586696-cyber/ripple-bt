import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Image as ImageIcon, Mic, Paperclip, Send, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration, type Message, type Profile } from "@/lib/chat";
import { extractWaveform } from "@/lib/audio";
import { messageSnippet } from "@/lib/messaging";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { PhotoSourceDialog, type PhotoSource } from "@/components/chat/PhotoSourceDialog";
import { compressImage } from "@/lib/image";
import { toast } from "sonner";

export type OutgoingMessage =
  | { kind: "text"; text: string; mentions: string[] }
  | { kind: "image"; file: File; caption: string }
  | { kind: "file"; file: File }
  | { kind: "voice"; blob: Blob; durationSeconds: number; waveform: number[] };

export type ReplyTarget = { message: Message; senderName: string };
export type EditTarget = { id: string; text: string };

export function Composer({
  onSend,
  replyTo,
  onCancelReply,
  editing,
  onCancelEdit,
  onSaveEdit,
  onTyping,
  mentionCandidates = [],
  disabled = false,
  disabledReason,
}: {
  onSend: (msg: OutgoingMessage) => void | Promise<void>;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  editing?: EditTarget | null;
  onCancelEdit?: () => void;
  onSaveEdit?: (text: string) => void | Promise<void>;
  onTyping?: () => void;
  mentionCandidates?: Profile[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [text, setText] = useState("");
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (editing) {
      setText(editing.text);
      textarea.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionCandidates
      .filter((p) => p.display_name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [mentionQuery, mentionCandidates]);

  const handleChange = (value: string) => {
    setText(value);
    onTyping?.();
    const caret = textarea.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/(?:^|\s)@([\w ]{0,20})$/);
    setMentionQuery(mentionCandidates.length > 0 && match ? (match[1] ?? "") : null);
  };

  const applyMention = (profile: Profile) => {
    const caret = textarea.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w ]{0,20})$/, `@${profile.display_name} `);
    setText(before + text.slice(caret));
    setMentionQuery(null);
    textarea.current?.focus();
  };

  const collectMentions = (value: string) =>
    mentionCandidates.filter((p) => value.includes(`@${p.display_name}`)).map((p) => p.id);

  const prepareImage = async (file: File) => {
    try {
      return await compressImage(file, { fileName: file.name || "photo.jpg" });
    } catch {
      return file;
    }
  };

  /** Library picks land in the preview tray; camera captures send straight away. */
  const acceptPhoto = async (file: File, source: PhotoSource) => {
    const prepared = await prepareImage(file);
    if (source === "camera") {
      await onSend({ kind: "image", file: prepared, caption: "" });
      return;
    }
    setPendingImage({ file: prepared, preview: URL.createObjectURL(prepared) });
  };

  const submit = async () => {
    if (disabled) return;
    if (editing) {
      const value = text.trim();
      if (!value) return;
      setText("");
      await onSaveEdit?.(value);
      return;
    }
    if (pendingImage) {
      const payload = { kind: "image" as const, file: pendingImage.file, caption: text.trim() };
      URL.revokeObjectURL(pendingImage.preview);
      setPendingImage(null);
      setText("");
      await onSend(payload);
      return;
    }
    const value = text.trim();
    if (!value) return;
    setText("");
    setMentionQuery(null);
    await onSend({ kind: "text", text: value, mentions: collectMentions(value) });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      cancelled.current = false;
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = seconds;
        if (timer.current) clearInterval(timer.current);
        setRecording(false);
        setSeconds(0);
        if (cancelled.current || chunks.current.length === 0) return;
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        void extractWaveform(blob).then((waveform) =>
          onSend({ kind: "voice", blob, durationSeconds: duration, waveform }),
        );
      };
      mr.start();
      recorder.current = mr;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Microphone unavailable", {
        description: "Allow microphone access to record a voice message.",
      });
    }
  };

  if (disabled) {
    return (
      <div className="sticky bottom-0 border-t border-border bg-background px-4 py-4 text-center text-sm text-muted-foreground">
        {disabledReason ?? "You can't send messages in this chat."}
      </div>
    );
  }

  if (recording) {
    return (
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-background px-4 py-3">
        <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
        <span className="flex-1 text-sm text-muted-foreground">
          Recording… {formatDuration(seconds)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Discard recording"
          onClick={() => {
            cancelled.current = true;
            recorder.current?.stop();
          }}
        >
          <Trash2 className="size-5" />
        </Button>
        <Button
          type="button"
          size="icon"
          aria-label="Send voice message"
          onClick={() => recorder.current?.stop()}
        >
          <Square className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 border-t border-border bg-background px-3 py-2.5">
      {editing ? (
        <div className="mb-2 flex items-center gap-3 rounded-xl border-l-4 border-primary bg-muted px-3 py-2">
          <span className="flex-1 text-xs text-muted-foreground">Editing message</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancel editing"
            onClick={() => {
              setText("");
              onCancelEdit?.();
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : replyTo ? (
        <div className="mb-2 flex items-center gap-3 rounded-xl border-l-4 border-primary bg-muted px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-primary">
              {replyTo.senderName}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {messageSnippet(replyTo.message)}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancel reply"
            onClick={onCancelReply}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {pendingImage ? (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-muted p-2">
          <img
            src={pendingImage.preview}
            alt="Selected"
            className="size-14 rounded-lg object-cover"
          />
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {pendingImage.file.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove photo"
            onClick={() => {
              URL.revokeObjectURL(pendingImage.preview);
              setPendingImage(null);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {mentionMatches.length > 0 ? (
        <ul className="mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-bubble">
          {mentionMatches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => applyMention(p)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <UserAvatar name={p.display_name} src={p.photo_url} className="size-7" />
                {p.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!editing ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Attach a file"
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip className="size-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Send a photo"
              onClick={() => setPhotoPickerOpen(true)}
            >
              <ImageIcon className="size-5" />
            </Button>
          </>
        ) : null}

        <textarea
          ref={textarea}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (editing) onCancelEdit?.();
              if (replyTo) onCancelReply?.();
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder={
            editing ? "Edit your message…" : pendingImage ? "Add a caption…" : "Message"
          }
          aria-label="Message"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-input bg-muted px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />

        {editing ? (
          <Button type="submit" size="icon" aria-label="Save edit" className="rounded-full">
            <Check className="size-4" />
          </Button>
        ) : text.trim() || pendingImage ? (
          <Button type="submit" size="icon" aria-label="Send message" className="rounded-full">
            <Send className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            aria-label="Record voice message"
            className="rounded-full"
            onClick={() => void startRecording()}
          >
            <Mic className="size-4" />
          </Button>
        )}
      </form>

      <PhotoSourceDialog
        open={photoPickerOpen}
        onOpenChange={setPhotoPickerOpen}
        title="Send a photo"
        onPicked={(file) => void acceptPhoto(file)}
      />
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          void onSend({ kind: "file", file });
        }}
      />
    </div>
  );
}
