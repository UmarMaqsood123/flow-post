import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

export const FILE_KINDS = ["image", "video", "document"] as const;

export const FILE_LIMITS = { title: 120, description: 500 } as const;
export type FileKindValue = (typeof FILE_KINDS)[number];

export interface IStoredFile {
  workspace: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  /** Object key in the bucket — generated server-side, never derived from the client's file name. */
  key: string;
  url: string;
  /** Sanitized original name, used for downloads. */
  originalName: string;
  /** The name people gave the media; the original file name stands in when unset. */
  title: string | null;
  description: string | null;
  /** Detected from the file's bytes, not the client-declared type. */
  mimeType: string;
  size: number;
  kind: FileKindValue;
  createdAt: Date;
  updatedAt: Date;
}

export type StoredFileDocument = HydratedDocument<IStoredFile>;

const StoredFileSchema = new Schema<IStoredFile>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    originalName: { type: String, required: true, maxlength: 255 },
    title: { type: String, default: null, trim: true, maxlength: FILE_LIMITS.title },
    description: { type: String, default: null, trim: true, maxlength: FILE_LIMITS.description },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    kind: { type: String, enum: FILE_KINDS, required: true },
  },
  { timestamps: true },
);

StoredFileSchema.index({ workspace: 1, createdAt: -1 });
StoredFileSchema.index({ workspace: 1, kind: 1, createdAt: -1 });

StoredFileSchema.plugin(workspaceScopedPlugin);

export const StoredFile: Model<IStoredFile> = mongoose.model<IStoredFile>("File", StoredFileSchema);

export interface PublicFile {
  id: string;
  url: string;
  /** The media's name: its title, or the file name when it has none. */
  name: string;
  /** The uploaded file's own name. */
  fileName: string;
  description: string | null;
  mimeType: string;
  size: number;
  kind: FileKindValue;
  uploadedBy: string;
  createdAt: Date;
}

export const toPublicFile = (file: StoredFileDocument): PublicFile => ({
  id: file._id.toString(),
  url: file.url,
  name: file.title ?? file.originalName,
  fileName: file.originalName,
  description: file.description ?? null,
  mimeType: file.mimeType,
  size: file.size,
  kind: file.kind,
  uploadedBy: file.uploadedBy.toString(),
  createdAt: file.createdAt,
});
