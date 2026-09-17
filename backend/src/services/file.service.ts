import { randomUUID } from "node:crypto";
import { open, rm } from "node:fs/promises";
import type { Types } from "mongoose";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ErrorCode, HttpStatus } from "../constants/http.constant";
import { WorkspaceRole } from "../constants/workspace.constant";
import {
  type FileKindValue,
  type PublicFile,
  StoredFile,
  type StoredFileDocument,
  toPublicFile,
} from "../models/file.model";
import { AppError } from "../utils/appError.util";
import { detectFileType, sanitizeFileName } from "../utils/fileType.util";
import { getStorage, isStorageEnabled, type PutObjectInput } from "../utils/storage.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import type { FileDetails } from "../validators/file.validator";
import { hasMinimumRole } from "../utils/workspaceRoles.util";
import * as EntitlementService from "./entitlement.service";

const MB = 1024 * 1024;
const HEADER_BYTES = 8192;
const UPLOAD_CONCURRENCY = 3;
const MAX_LISTED_FILES = 200;

interface PreparedUpload extends PutObjectInput {
  originalName: string;
  kind: FileKindValue;
  title: string | null;
  description: string | null;
}

const maxSizeMbFor = (kind: FileKindValue): number =>
  kind === "video" ? env.UPLOAD_MAX_VIDEO_SIZE_MB : env.UPLOAD_MAX_FILE_SIZE_MB;

const unsupportedType = (name: string) =>
  new AppError(`"${name}" is not a supported file type`, HttpStatus.UNSUPPORTED_MEDIA_TYPE, {
    code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    details: [
      {
        path: "file",
        message:
          "Upload an image (JPG, PNG, GIF, WebP), a video (MP4, MOV, WebM) or a document (PDF, Word, Excel, PowerPoint, TXT, CSV)",
      },
    ],
  });

const tooLarge = (name: string, kind: FileKindValue) =>
  new AppError(
    `"${name}" is too large. The maximum size for ${kind === "video" ? "videos" : "images and documents"} is ${maxSizeMbFor(kind)} MB.`,
    HttpStatus.PAYLOAD_TOO_LARGE,
    { code: ErrorCode.PAYLOAD_TOO_LARGE },
  );

/** workspaces/<workspaceId>/<yyyy>/<mm>/<uuid>.<ext> — unguessable and free of client input. */
const buildObjectKey = (workspaceId: Types.ObjectId, extension: string): string => {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `workspaces/${workspaceId.toString()}/${now.getUTCFullYear()}/${month}/${randomUUID()}.${extension}`;
};

/** Images and videos display inline; documents always download, so a crafted file can't render in a tab. */
const contentDispositionFor = (name: string, kind: FileKindValue): string =>
  `${kind === "document" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`;

/** Reads the first bytes of an uploaded temp file for type detection. */
const readHeader = async (filePath: string): Promise<Buffer> => {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

/** Validates every file before anything is stored, so a batch is all-or-nothing. */
const prepareUploads = async (
  workspaceId: Types.ObjectId,
  files: Express.Multer.File[],
  details: FileDetails[],
): Promise<PreparedUpload[]> => {
  const prepared: PreparedUpload[] = [];

  for (const [index, file] of files.entries()) {
    const originalName = sanitizeFileName(file.originalname);
    if (file.size === 0) {
      throw AppError.badRequest(`"${originalName}" is empty`, [
        { path: "file", message: "The file is empty" },
      ]);
    }

    const type = detectFileType(await readHeader(file.path), originalName);
    if (!type) throw unsupportedType(originalName);
    if (file.size > maxSizeMbFor(type.kind) * MB) throw tooLarge(originalName, type.kind);

    prepared.push({
      key: buildObjectKey(workspaceId, type.extension),
      filePath: file.path,
      size: file.size,
      contentType: type.mimeType,
      contentDisposition: contentDispositionFor(originalName, type.kind),
      originalName,
      kind: type.kind,
      title: details[index]?.name ?? null,
      description: details[index]?.description ?? null,
    });
  }

  return prepared;
};

const removeTempFiles = async (files: Express.Multer.File[]) => {
  await Promise.allSettled(files.map((file) => rm(file.path, { force: true })));
};

/** Removes uploaded temp files that were rejected before reaching `uploadFiles`. */
export const discardUploads = (files: Express.Multer.File[]) => removeTempFiles(files);

/**
 * Stores files with an optional name and description each. `details` lines up
 * with `files` by index; a file with no entry just keeps its own file name.
 */
export const uploadFiles = async (
  { workspace, user }: WorkspaceContext,
  files: Express.Multer.File[] | undefined,
  details: FileDetails[] = [],
): Promise<PublicFile[]> => {
  if (!files || files.length === 0) {
    throw AppError.badRequest("No file was uploaded", [
      { path: "file", message: "Choose a file to upload" },
    ]);
  }

  try {
    if (details.length > files.length) {
      throw AppError.badRequest("There are more names than files", [
        { path: "metadata", message: "Send one entry per file, in the same order" },
      ]);
    }
    await EntitlementService.assertStorageAvailable(
      workspace,
      files.reduce((total, file) => total + file.size, 0),
    );
    const prepared = await prepareUploads(workspace._id, files, details);
    const storage = getStorage();
    const storedKeys: string[] = [];
    let failure: unknown = null;

    // Upload with bounded concurrency; stop taking new work after the first failure.
    let nextIndex = 0;
    const worker = async () => {
      while (failure === null && nextIndex < prepared.length) {
        const item = prepared[nextIndex++]!;
        try {
          await storage.putObject(item);
          storedKeys.push(item.key);
        } catch (error) {
          failure ??= error;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, prepared.length) }, () => worker()),
    );

    const rollback = async () => {
      await Promise.allSettled(storedKeys.map((key) => storage.deleteObject(key)));
    };

    if (failure !== null) {
      await rollback();
      if (failure instanceof AppError) throw failure;
      logger.error({ err: failure, workspaceId: workspace.id }, "Upload to object storage failed");
      throw AppError.serviceUnavailable("We couldn't store your file. Please try again.");
    }

    try {
      const records = (await StoredFile.insertMany(
        prepared.map((item) => ({
          workspace: workspace._id,
          uploadedBy: user._id,
          key: item.key,
          url: storage.getPublicUrl(item.key),
          originalName: item.originalName,
          title: item.title,
          description: item.description,
          mimeType: item.contentType,
          size: item.size,
          kind: item.kind,
        })),
      )) as unknown as StoredFileDocument[];

      logger.info(
        { workspaceId: workspace.id, userId: user.id, count: records.length },
        "Files uploaded",
      );
      return records.map(toPublicFile);
    } catch (error) {
      await rollback();
      throw error;
    }
  } finally {
    // Temp files are removed whether the upload succeeded, was rejected or failed.
    await removeTempFiles(files);
  }
};

export const listFiles = async (
  workspaceId: Types.ObjectId,
  kind?: FileKindValue,
): Promise<PublicFile[]> => {
  const files = await StoredFile.find({ workspace: workspaceId, ...(kind ? { kind } : {}) })
    .sort({ createdAt: -1 })
    .limit(MAX_LISTED_FILES);
  return files.map(toPublicFile);
};

/** Uploaders can delete their own files; admins and owners can delete any file. */
export const deleteFile = async (
  { workspace, member, user }: WorkspaceContext,
  fileId: string,
): Promise<void> => {
  const file = await StoredFile.findOne({ _id: fileId, workspace: workspace._id });
  if (!file) throw AppError.notFound("File not found");

  const isUploader = file.uploadedBy.equals(user._id);
  if (!isUploader && !hasMinimumRole(member.role, WorkspaceRole.ADMIN)) {
    throw AppError.forbidden("Only admins and owners can delete files uploaded by someone else");
  }

  await StoredFile.deleteOne({ _id: file._id, workspace: workspace._id });
  try {
    await getStorage().deleteObject(file.key);
  } catch (error) {
    // The record is gone either way; an orphaned object is logged for cleanup.
    logger.error({ err: error, key: file.key }, "Failed to delete object from storage");
  }

  logger.info({ workspaceId: workspace.id, userId: user.id, fileId }, "File deleted");
};

/** Removes every file record and stored object for a workspace (permanent workspace deletion). */
export const deleteAllWorkspaceFiles = async (workspaceId: Types.ObjectId): Promise<void> => {
  const files = await StoredFile.find({ workspace: workspaceId }).select("key").lean();
  await StoredFile.deleteMany({ workspace: workspaceId });
  if (files.length === 0 || !isStorageEnabled()) return;

  const storage = getStorage();
  const results = await Promise.allSettled(files.map((file) => storage.deleteObject(file.key)));
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed > 0) {
    logger.error(
      { workspaceId: workspaceId.toString(), failed },
      "Some stored objects could not be deleted",
    );
  }
};
