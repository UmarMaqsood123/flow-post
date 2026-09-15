export type FileKind = "image" | "video" | "document";

export interface AllowedFileType {
  mimeType: string;
  extension: string;
  kind: FileKind;
}

/** Everything uploads accept. SVG is deliberately excluded (it can carry scripts). */
export const ALLOWED_FILE_TYPES: AllowedFileType[] = [
  { mimeType: "image/jpeg", extension: "jpg", kind: "image" },
  { mimeType: "image/png", extension: "png", kind: "image" },
  { mimeType: "image/gif", extension: "gif", kind: "image" },
  { mimeType: "image/webp", extension: "webp", kind: "image" },
  { mimeType: "video/mp4", extension: "mp4", kind: "video" },
  { mimeType: "video/mp4", extension: "m4v", kind: "video" },
  { mimeType: "video/quicktime", extension: "mov", kind: "video" },
  { mimeType: "video/webm", extension: "webm", kind: "video" },
  { mimeType: "application/pdf", extension: "pdf", kind: "document" },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
    kind: "document",
  },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    kind: "document",
  },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extension: "pptx",
    kind: "document",
  },
  { mimeType: "application/msword", extension: "doc", kind: "document" },
  { mimeType: "application/vnd.ms-excel", extension: "xls", kind: "document" },
  { mimeType: "application/vnd.ms-powerpoint", extension: "ppt", kind: "document" },
  { mimeType: "text/plain", extension: "txt", kind: "document" },
  { mimeType: "text/csv", extension: "csv", kind: "document" },
];

const byExtension = (extension: string): AllowedFileType | null =>
  ALLOWED_FILE_TYPES.find((type) => type.extension === extension) ?? null;

const extensionOf = (name: string): string =>
  /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean =>
  buffer.length >= offset + bytes.length &&
  bytes.every((byte, index) => buffer[offset + index] === byte);

const asciiAt = (buffer: Buffer, start: number, end: number): string =>
  buffer.length >= end ? buffer.subarray(start, end).toString("latin1") : "";

/** ISO base-media brands that are audio-only (M4A/M4B/M4P, Flash audio). */
const AUDIO_ONLY_BRANDS = new Set(["M4A ", "M4B ", "M4P ", "F4A ", "F4B "]);

/** Top-level atoms that can start a QuickTime file written without an `ftyp` box. */
const QUICKTIME_LEADING_ATOMS = new Set(["moov", "mdat", "wide", "free", "skip", "pnot"]);

/** Plain text: no NUL bytes and valid UTF-8 in the first 8 KB. */
const isLikelyText = (buffer: Buffer): boolean => {
  const sample = buffer.subarray(0, 8192);
  if (sample.length === 0 || sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample, { stream: true });
    return true;
  } catch {
    return false;
  }
};

/**
 * Identifies a file from its leading bytes (magic numbers) — never from the
 * client's file name or declared MIME type, which are trivially spoofed. The
 * extension only disambiguates formats that share a container (ZIP, OLE2,
 * ISO base media, Matroska, text). Returns null for anything outside the allowlist.
 *
 * Pass at least the first 8 KB of the file.
 */
export const detectFileType = (buffer: Buffer, originalName: string): AllowedFileType | null => {
  const extension = extensionOf(originalName);

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return byExtension("jpg");
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return byExtension("png");
  }
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return byExtension("gif");
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return byExtension("webp");
  }

  // MP4 / M4V / MOV: ISO base media file with an `ftyp` box.
  if (asciiAt(buffer, 4, 8) === "ftyp") {
    const brand = asciiAt(buffer, 8, 12);
    if (AUDIO_ONLY_BRANDS.has(brand)) return null;
    if (brand === "qt  ") return extension === "mov" ? byExtension("mov") : null;
    return ["mp4", "m4v", "mov"].includes(extension) ? byExtension(extension) : null;
  }
  // Older QuickTime files may start directly with a movie atom.
  if (extension === "mov" && QUICKTIME_LEADING_ATOMS.has(asciiAt(buffer, 4, 8))) {
    return byExtension("mov");
  }
  // WebM: Matroska EBML header whose DocType is "webm".
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    const isWebm = buffer.subarray(0, 64).includes(Buffer.from("webm"));
    return extension === "webm" && isWebm ? byExtension("webm") : null;
  }

  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return byExtension("pdf");

  // Office Open XML files are ZIP archives.
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    return ["docx", "xlsx", "pptx"].includes(extension) ? byExtension(extension) : null;
  }
  // Legacy Office files share the OLE2 compound-document signature.
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return ["doc", "xls", "ppt"].includes(extension) ? byExtension(extension) : null;
  }
  if ((extension === "txt" || extension === "csv") && isLikelyText(buffer)) {
    return byExtension(extension);
  }
  return null;
};

const MAX_FILE_NAME_LENGTH = 200;

/** Characters reserved in file names on common operating systems. */
const RESERVED_FILE_NAME_CHARACTERS = new Set(['"', "<", ">", "|", ":", "*", "?"]);

/** Control characters (U+0000–U+001F, U+007F) and reserved characters. */
const isUnsafeFileNameCharacter = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f || RESERVED_FILE_NAME_CHARACTERS.has(character);
};

/** Display-safe file name: no directories, control or reserved characters, max 200 characters. */
export const sanitizeFileName = (name: string, fallback = "file"): string => {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = Array.from(base)
    .filter((character) => !isUnsafeFileNameCharacter(character))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const truncated = Array.from(cleaned).slice(0, MAX_FILE_NAME_LENGTH).join("").trimEnd();
  return truncated || fallback;
};
