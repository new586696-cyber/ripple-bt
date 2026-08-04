import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewerItem = {
  url: string;
  kind: "image" | "video" | "pdf";
  name?: string | null;
  caption?: string | null;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Full-screen in-app viewer for photos, videos and PDFs. */
export function MediaViewer({
  item,
  onClose,
}: {
  item: ViewerItem | null;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const stateRef = useRef({ zoom, offset });
  stateRef.current = { zoom, offset };

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
  }, [item?.url, reset]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => clamp(z * 1.25, MIN_ZOOM, MAX_ZOOM));
      if (e.key === "-") setZoom((z) => clamp(z / 1.25, MIN_ZOOM, MAX_ZOOM));
      if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [item, onClose, reset]);

  const zoomAt = useCallback((px: number, py: number, next: number) => {
    const { zoom: z, offset: o } = stateRef.current;
    const target = clamp(next, MIN_ZOOM, MAX_ZOOM);
    const k = target / z;
    setZoom(target);
    setOffset(
      target === MIN_ZOOM
        ? { x: 0, y: 0 }
        : { x: px - (px - o.x) * k, y: py - (py - o.y) * k },
    );
  }, []);

  const isImage = item?.kind === "image";

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isImage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const rect = el.getBoundingClientRect();
      zoomAt(
        e.clientX - rect.left,
        e.clientY - rect.top,
        stateRef.current.zoom * Math.exp(-dy * 0.0018),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isImage, item?.url, zoomAt]);

  if (!item) return null;

  const centerZoom = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    zoomAt((rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2, stateRef.current.zoom * factor);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.name ?? "Media viewer"}
      className="fixed inset-0 z-50 flex flex-col bg-viewer-backdrop backdrop-blur-sm"
    >
      <header className="flex shrink-0 items-center gap-2 px-3 py-2 text-viewer-foreground">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {item.name ?? (item.kind === "image" ? "Photo" : item.kind === "video" ? "Video" : "Document")}
        </span>
        {isImage ? (
          <>
            <Button
              variant="viewer"
              size="icon"
              aria-label="Zoom out"
              onClick={() => centerZoom(1 / 1.4)}
            >
              <Minus className="size-4" />
            </Button>
            <Button variant="viewer" size="icon" aria-label="Zoom in" onClick={() => centerZoom(1.4)}>
              <Plus className="size-4" />
            </Button>
            <Button variant="viewer" size="icon" aria-label="Reset zoom" onClick={reset}>
              <RotateCcw className="size-4" />
            </Button>
          </>
        ) : null}
        <a href={item.url} download={item.name ?? undefined} target="_blank" rel="noreferrer">
          <Button variant="viewer" size="icon" aria-label="Download">
            <Download className="size-4" />
          </Button>
        </a>
        <Button variant="viewer" size="icon" aria-label="Close viewer" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </header>

      <div
        ref={containerRef}
        className={cn(
          "relative min-h-0 flex-1 select-none overflow-hidden",
          isImage && (zoom > 1 ? "cursor-grab" : "cursor-zoom-in"),
        )}
        onPointerDown={(e) => {
          if (!isImage || zoom === 1) return;
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={(e) => {
          if (!isImage) return;
          const rect = e.currentTarget.getBoundingClientRect();
          zoomAt(e.clientX - rect.left, e.clientY - rect.top, zoom > 1 ? 1 : 2.5);
        }}
      >
        {item.kind === "image" ? (
          <img
            src={item.url}
            alt={item.caption || item.name || "Shared photo"}
            draggable={false}
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              transition: drag.current ? "none" : "transform 120ms ease-out",
            }}
          />
        ) : item.kind === "video" ? (
          <video
            src={item.url}
            controls
            autoPlay
            playsInline
            className="absolute inset-0 m-auto max-h-full max-w-full"
          />
        ) : (
          <iframe
            src={item.url}
            title={item.name ?? "Document"}
            className="size-full border-0 bg-background"
          />
        )}
      </div>

      {item.caption ? (
        <p className="shrink-0 px-4 py-3 text-center text-sm text-viewer-foreground">
          {item.caption}
        </p>
      ) : null}
    </div>
  );
}
