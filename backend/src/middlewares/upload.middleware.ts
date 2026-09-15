import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RequestHandler } from "express";
import multer from "multer";
import { env } from "../config/env";
import { AppError } from "../utils/appError.util";
import { isStorageEnabled } from "../utils/storage.util";

const MB = 1024 * 1024;

/** Uploads are written here first and always removed by the file service afterwards. */
export const UPLOAD_TEMP_DIR = path.join(tmpdir(), "flowpost-uploads");
mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });

/**
 * Files stream to temporary files on disk (not memory) so large videos don't
 * exhaust the server's RAM. Multer enforces the largest per-kind limit here;
 * the file service applies the exact limit once it knows the file's type.
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_TEMP_DIR,
    filename: (_req, _file, callback) => callback(null, randomUUID()),
  }),
  limits: {
    fileSize: Math.max(env.UPLOAD_MAX_FILE_SIZE_MB, env.UPLOAD_MAX_VIDEO_SIZE_MB) * MB,
    files: env.UPLOAD_MAX_FILES,
    fields: 5,
    parts: env.UPLOAD_MAX_FILES + 5,
  },
  // Browsers send UTF-8 file names; busboy would otherwise decode them as latin1.
  defParamCharset: "utf8",
});

/** Rejects uploads before anything is written when storage is disabled. */
export const requireStorage: RequestHandler = (_req, _res, next) => {
  if (!isStorageEnabled()) {
    throw AppError.serviceUnavailable("File uploads are not configured on this server");
  }
  next();
};

/** Multipart field `file`. */
export const uploadSingleFile = upload.single("file");

/** Multipart field `files` (repeatable). */
export const uploadMultipleFiles = upload.array("files", env.UPLOAD_MAX_FILES);
