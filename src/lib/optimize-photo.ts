import {
  MAX_IMAGE_DIMENSION,
  MAX_ORIGINAL_PHOTO_BYTES,
  MAX_PHOTO_BASE64_CHARS
} from "@/src/lib/photo-limits";

export {
  MAX_IMAGE_DIMENSION,
  MAX_ORIGINAL_PHOTO_BYTES,
  MAX_PHOTO_BASE64_CHARS,
  MAX_PHOTOS_PER_REVIEW
} from "@/src/lib/photo-limits";

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode image"));
    };
    image.src = url;
  });
}

/** Compress/resize a phone photo into a JPEG data URL under the size cap. */
export async function optimizePhotoForUpload(file: File): Promise<string> {
  if (file.size > MAX_ORIGINAL_PHOTO_BYTES) {
    throw new Error("Photo file is too large");
  }

  const image = await loadImageFromFile(file);
  const maxEdge = Math.max(image.naturalWidth, image.naturalHeight) || 1;
  let scale = Math.min(1, MAX_IMAGE_DIMENSION / maxEdge);
  const qualities = [0.78, 0.68, 0.58, 0.48, 0.4];

  for (let sizeStep = 0; sizeStep < 5; sizeStep++) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to process image");
    ctx.drawImage(image, 0, 0, width, height);

    for (const quality of qualities) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= MAX_PHOTO_BASE64_CHARS) {
        return dataUrl;
      }
    }
    scale *= 0.75;
  }

  throw new Error("Photo is still too large after optimization");
}
