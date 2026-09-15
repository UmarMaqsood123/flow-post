/** Mirrors `PublicFile` in backend/src/models/file.model.ts. */
export type FileKind = "image" | "video" | "document";

export interface UploadedFile {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  kind: FileKind;
  uploadedBy: string;
  createdAt: string;
}
