import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function cameraSupported() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window !== "undefined" &&
    (window.isSecureContext ?? true)
  );
}

/** Live camera modal with a shutter button. */
function CameraDialog({
  open,
  onOpenChange,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        setReady(true);
      })
      .catch(() => {
        toast.error("Camera unavailable", {
          description: "Allow camera access, or choose a photo from your library instead.",
        });
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onOpenChange]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
        onOpenChange(false);
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
        </DialogHeader>
        <div className="overflow-hidden rounded-2xl bg-muted">
          <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" className="rounded-xl" onClick={() => onOpenChange(false)}>
            <X className="size-4" /> Cancel
          </Button>
          <Button className="rounded-xl" disabled={!ready} onClick={shoot}>
            <Camera className="size-4" /> Capture
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type PhotoSource = "camera" | "library";

/**
 * Chooser offering "Take photo" (live camera, falling back to the device camera
 * input on mobile) and "Choose from library". Callers can treat camera captures
 * differently — Ripple sends them straight away.
 */
export function PhotoSourceDialog({
  open,
  onOpenChange,
  onPicked,
  title = "Add a photo",
  captureLabel = "Take photo",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (file: File, source: PhotoSource) => void;
  title?: string;
  captureLabel?: string;
}) {
  const libraryInput = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleFile = (file: File | undefined, source: PhotoSource) => {
    if (!file) return;
    onOpenChange(false);
    onPicked(file, source);
  };

  return (
    <>
      <Dialog open={open && !cameraOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              variant="secondary"
              className="h-12 w-full justify-start rounded-xl"
              onClick={() => {
                if (cameraSupported()) setCameraOpen(true);
                else captureInput.current?.click();
              }}
            >
              <Camera className="size-5" /> Take photo
            </Button>
            <Button
              variant="secondary"
              className="h-12 w-full justify-start rounded-xl"
              onClick={() => libraryInput.current?.click()}
            >
              <ImageIcon className="size-5" /> Choose from library
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CameraDialog
        open={cameraOpen}
        onOpenChange={(next) => {
          setCameraOpen(next);
          if (!next) onOpenChange(false);
        }}
        onCapture={(file) => onPicked(file)}
      />

      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          handleFile(file);
        }}
      />
      <input
        ref={captureInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          handleFile(file);
        }}
      />
    </>
  );
}
