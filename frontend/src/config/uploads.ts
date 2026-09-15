/**
 * Mirrors backend/src/utils/fileType.util.ts and the UPLOAD_* defaults. These only
 * give instant feedback — the API re-checks every file's actual contents.
 */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"] as const;
export const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm"] as const;
export const DOCUMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
] as const;

export const IMAGE_ACCEPT = IMAGE_EXTENSIONS.map((extension) => `.${extension}`).join(",");
export const ANY_FILE_ACCEPT = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...DOCUMENT_EXTENSIONS]
  .map((extension) => `.${extension}`)
  .join(",");

/** Images and documents (mirrors UPLOAD_MAX_FILE_SIZE_MB). */
export const MAX_UPLOAD_SIZE_MB = 10;
/** Videos (mirrors UPLOAD_MAX_VIDEO_SIZE_MB). */
export const MAX_VIDEO_SIZE_MB = 100;
export const MAX_FILES_PER_UPLOAD = 10;
