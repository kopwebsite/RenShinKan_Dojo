const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_SIZE = 15 * 1024 * 1024;
const FULL_MAX_WIDTH = 2200;
const THUMB_MAX_WIDTH = 640;

export type PreparedGalleryImage = {
  full: File;
  thumbnail: File;
  width: number;
  height: number;
  sha256: string;
};

export type UploadedGalleryAsset = {
  id: string;
  url: string;
  size: number;
  sha256: string;
};

export function validateGallerySource(file: File) {
  if (!ACCEPTED_TYPES.has(file.type)) return "Choose a JPEG, PNG, or WebP image.";
  if (file.size <= 0) return "The image file is empty.";
  if (file.size > MAX_SOURCE_SIZE) return "Images must be 15 MB or smaller before optimization.";
  return null;
}

async function orientedBitmap(file: File) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return createImageBitmap(file);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The image could not be decoded."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("WebP conversion failed.")), "image/webp", quality);
  });
}

async function variant(
  image: ImageBitmap | HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  quality: number,
) {
  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare images.");
  context.drawImage(image, 0, 0, width, height);
  return { blob: await canvasBlob(canvas, quality), width, height };
}

function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "gallery-photo";
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function prepareGalleryImage(file: File): Promise<PreparedGalleryImage> {
  const error = validateGallerySource(file);
  if (error) throw new Error(error);
  const image = await orientedBitmap(file);
  try {
    const sourceWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const sourceHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    if (sourceWidth < 80 || sourceHeight < 80 || sourceWidth > 14_000 || sourceHeight > 14_000) {
      throw new Error("Images must be between 80 and 14,000 pixels on each side.");
    }
    const [full, thumbnail] = await Promise.all([
      variant(image, sourceWidth, sourceHeight, FULL_MAX_WIDTH, .84),
      variant(image, sourceWidth, sourceHeight, THUMB_MAX_WIDTH, .78),
    ]);
    if (full.blob.size > 5 * 1024 * 1024) {
      throw new Error("The optimized image is still larger than 5 MB. Choose a smaller source image.");
    }
    const base = safeBaseName(file.name);
    return {
      full: new File([full.blob], `${base}.webp`, { type: "image/webp", lastModified: Date.now() }),
      thumbnail: new File([thumbnail.blob], `${base}-thumbnail.webp`, { type: "image/webp", lastModified: Date.now() }),
      width: full.width,
      height: full.height,
      sha256: await sha256(full.blob),
    };
  } finally {
    if ("close" in image && typeof image.close === "function") image.close();
  }
}

export function uploadGalleryAsset(file: File, onProgress: (progress: number) => void) {
  return new Promise<UploadedGalleryAsset>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/admin/gallery-media");
    request.withCredentials = true;
    request.setRequestHeader("X-Request-ID", crypto.randomUUID());
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      let body: { asset?: UploadedGalleryAsset; error?: string } = {};
      try {
        body = JSON.parse(request.responseText) as typeof body;
      } catch {
        // The human-readable fallback below is used.
      }
      if (request.status >= 200 && request.status < 300 && body.asset) {
        onProgress(100);
        resolve(body.asset);
      } else {
        reject(new Error(body.error || `Upload failed (${request.status || "network error"}).`));
      }
    });
    request.addEventListener("error", () => reject(new Error("The image upload was interrupted.")));
    request.addEventListener("abort", () => reject(new Error("The image upload was cancelled.")));
    const form = new FormData();
    form.append("files", file, file.name);
    request.send(form);
  });
}
