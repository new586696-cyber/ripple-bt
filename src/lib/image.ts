/** Client-side image helpers: crop to a square and compress before upload. */

export type PixelCrop = { x: number; y: number; width: number; height: number };

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("We couldn't read that image."));
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("We couldn't process that image."))),
      "image/jpeg",
      quality,
    );
  });
}

/** Downscales so the long edge is at most `maxEdge` and re-encodes as JPEG. */
export async function compressImage(
  input: Blob,
  { maxEdge = 1024, quality = 0.8, fileName = "photo.jpg" } = {},
): Promise<File> {
  const url = URL.createObjectURL(input);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("We couldn't process that image.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, quality);
    return new File([blob], fileName.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Crops the given pixel region out of an image and compresses the result. */
export async function cropImage(
  input: Blob,
  crop: PixelCrop,
  { maxEdge = 1024, quality = 0.8, fileName = "avatar.jpg" } = {},
): Promise<File> {
  const url = URL.createObjectURL(input);
  try {
    const img = await loadImage(url);
    const size = Math.min(maxEdge, Math.round(Math.max(crop.width, crop.height)));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("We couldn't process that image.");
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, size, size);
    const blob = await canvasToBlob(canvas, quality);
    return new File([blob], fileName, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
