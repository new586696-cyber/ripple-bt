import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cropImage, type PixelCrop } from "@/lib/image";
import { toast } from "sonner";

/** Square crop step shown before an avatar is uploaded. */
export function ImageCropDialog({
  file,
  onCancel,
  onCropped,
}: {
  file: File | null;
  onCancel: () => void;
  onCropped: (result: File) => void | Promise<void>;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_: unknown, pixels: PixelCrop) => setArea(pixels), []);

  const confirm = async () => {
    if (!file || !area) return;
    setBusy(true);
    try {
      const result = await cropImage(file, area);
      await onCropped(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't crop that image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted">
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : null}
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.05}
            onValueChange={(v) => setZoom(v[0] ?? 1)}
            aria-label="Zoom"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1 rounded-xl" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-xl"
            disabled={busy || !area}
            onClick={() => void confirm()}
          >
            {busy ? "Saving…" : "Use photo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
