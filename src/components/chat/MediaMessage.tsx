import { useEffect, useRef, useState } from "react";
import { Download, File as FileIcon, Pause, Play } from "lucide-react";
import { formatBytes, signedMediaUrl, type Message } from "@/lib/chat";
import { formatClock, readWaveform } from "@/lib/audio";
import { claimVoicePlayback, releaseVoicePlayback } from "@/lib/voice-player";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function useMediaUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!path) return;
    setFailed(false);
    signedMediaUrl(path)
      .then((u) => active && setUrl(u))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [path]);
  return { url, failed };
}

export function ImageMessage({ message }: { message: Message }) {
  const { url, failed } = useMediaUrl(message.media_url);
  if (failed)
    return <p className="text-xs text-muted-foreground">This photo couldn't be loaded.</p>;
  if (!url) return <Skeleton className="h-48 w-56 rounded-xl" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img
        src={url}
        alt={message.text || "Shared photo"}
        loading="lazy"
        className="max-h-72 w-full max-w-xs rounded-xl object-cover"
      />
    </a>
  );
}

const SPEEDS = [1, 1.5, 2];

export function VoiceMessage({ message }: { message: Message }) {
  const { url, failed } = useMediaUrl(message.media_url);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(1);
  const meta = (message.media_meta ?? {}) as { durationSeconds?: number };
  const total = meta.durationSeconds ?? 0;
  const bars = readWaveform(message.media_meta);

  useEffect(() => {
    if (!url) return;
    const el = new Audio(url);
    audioRef.current = el;
    const onTime = () => setElapsed(el.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setElapsed(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
      el.pause();
      audioRef.current = null;
    };
  }, [url]);

  const pause = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  useEffect(() => () => releaseVoicePlayback(pause), []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      pause();
      releaseVoicePlayback(pause);
      return;
    }
    claimVoicePlayback(pause);
    el.playbackRate = speed;
    void el.play();
    setPlaying(true);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seekTo = (ratio: number) => {
    const el = audioRef.current;
    if (!el) return;
    const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : total;
    if (!duration) return;
    el.currentTime = Math.max(0, Math.min(duration, duration * ratio));
    setElapsed(el.currentTime);
  };

  if (failed)
    return <p className="text-xs text-muted-foreground">This voice note couldn't be loaded.</p>;

  const duration =
    audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0
      ? audioRef.current.duration
      : total;
  const progress = duration ? Math.min(1, elapsed / duration) : 0;

  return (
    <div className="flex min-w-52 items-center gap-2.5">
      <button
        type="button"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        disabled={!url}
        onClick={toggle}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Seek voice message"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") seekTo(Math.min(1, progress + 0.05));
          if (e.key === "ArrowLeft") seekTo(Math.max(0, progress - 0.05));
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seekTo((e.clientX - rect.left) / rect.width);
        }}
        className="flex h-8 flex-1 cursor-pointer items-center gap-[2px]"
      >
        {bars.map((peak, i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full bg-current transition-opacity",
              i / bars.length <= progress ? "opacity-100" : "opacity-35",
            )}
            style={{ height: `${Math.max(4, peak * 26)}px` }}
          />
        ))}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-xs tabular-nums opacity-70">
          {formatClock(playing || elapsed > 0 ? elapsed : duration)}
        </span>
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label={`Playback speed ${speed}x`}
          className="rounded-full bg-current/15 px-1.5 text-[10px] font-semibold tabular-nums opacity-80"
        >
          {speed}x
        </button>
      </div>
    </div>
  );
}

export function FileMessage({ message }: { message: Message }) {
  const { url, failed } = useMediaUrl(message.media_url);
  const meta = (message.media_meta ?? {}) as { fileName?: string; sizeBytes?: number };
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-52 items-center gap-3 rounded-xl bg-background/50 p-2"
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <FileIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{meta.fileName ?? "Attachment"}</span>
        <span className="block text-xs opacity-70">
          {failed ? "Unavailable" : formatBytes(meta.sizeBytes)}
        </span>
      </span>
      <Download className="size-4 opacity-60" />
    </a>
  );
}
