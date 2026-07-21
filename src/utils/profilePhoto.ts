const PROFILE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareProfilePhoto(file: File) {
  if (!PROFILE_MIME_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP profile photo.");
  if (file.size > 8 * 1024 * 1024) throw new Error("The original photo must be 8 MB or smaller.");

  const bitmap = await createImageBitmap(file);
  if (bitmap.width < 128 || bitmap.height < 128) {
    bitmap.close();
    throw new Error("The photo must be at least 128 × 128 pixels.");
  }

  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("The photo could not be prepared.")),
      "image/webp",
      0.84,
    );
  });
  if (blob.size > 3 * 1024 * 1024) throw new Error("The prepared photo is still larger than 3 MB. Choose a smaller photo.");
  return new File([blob], "profile.webp", { type: "image/webp" });
}

export async function prepareSiteImage(file: File) {
  if (!PROFILE_MIME_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP website image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("The original website image must be 12 MB or smaller.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width < 64 || bitmap.height < 64) {
    bitmap.close();
    throw new Error("The website image must be at least 64 by 64 pixels.");
  }
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error("The website image could not be prepared.")),
    "image/webp", 0.82,
  ));
  if (blob.size > 5 * 1024 * 1024) throw new Error("The optimized website image is still larger than 5 MB.");
  return new File([blob], "website-image.webp", { type: "image/webp" });
}
