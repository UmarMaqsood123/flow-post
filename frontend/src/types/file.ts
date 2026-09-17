/** Mirrors `PublicFile` in backend/src/models/file.model.ts. */
export type FileKind = "image" | "video" | "document";

export interface UploadedFile {
  id: string;
  url: string;
  /** The media's name, or its file name when none was given. */
  name: string;
  /** The uploaded file's own name. */
  fileName: string;
  description: string | null;
  mimeType: string;
  size: number;
  kind: FileKind;
  uploadedBy: string;
  createdAt: string;
}

/** A name and optional description for one file being uploaded. */
export interface MediaDetails {
  name: string;
  description?: string;
}
