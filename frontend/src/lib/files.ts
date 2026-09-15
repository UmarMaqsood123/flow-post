import {
  DOCUMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MAX_UPLOAD_SIZE_MB,
  MAX_VIDEO_SIZE_MB,
  VIDEO_EXTENSIONS,
} from "@/config/uploads";

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
};

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** Quick client-side check for instant feedback. Returns an error message or null. */
export const validateClientFile = (
  file: File,
  { imagesOnly = false }: { imagesOnly?: boolean } = {},
): string | null => {
  const extension = extensionOf(file.name);
  const isImage = (IMAGE_EXTENSIONS as readonly string[]).includes(extension);
  const isDocument = (DOCUMENT_EXTENSIONS as readonly string[]).includes(extension);
  const isVideo = (VIDEO_EXTENSIONS as readonly string[]).includes(extension);

  if (imagesOnly && !isImage) return "Choose a JPG, PNG, GIF or WebP image.";
  if (!isImage && !isVideo && !isDocument) {
    return "This file type isn't supported. Upload an image, a video (MP4, MOV, WebM), a PDF, an Office document, TXT or CSV.";
  }
  if (file.size === 0) return "This file is empty.";
  const maxSizeMb = isVideo ? MAX_VIDEO_SIZE_MB : MAX_UPLOAD_SIZE_MB;
  if (file.size > maxSizeMb * 1024 * 1024) {
    return isVideo
      ? `Videos must be ${MAX_VIDEO_SIZE_MB} MB or smaller.`
      : `Images and documents must be ${MAX_UPLOAD_SIZE_MB} MB or smaller.`;
  }
  return null;
};
