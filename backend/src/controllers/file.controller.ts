import type { Request, Response } from "express";
import { HttpStatus } from "../constants/http.constant";
import * as FileService from "../services/file.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type { ZodType } from "zod";
import { AppError } from "../utils/appError.util";
import {
  batchFileDetailsSchema,
  type FileParams,
  fileDetailsSchema,
  type ListFilesQuery,
} from "../validators/file.validator";

/**
 * Text fields arrive with the multipart body, so they're validated here, after
 * multer has parsed it, rather than by the validate middleware that runs first.
 */
const parseBody = async <T>(
  schema: ZodType<T>,
  value: unknown,
  files: Express.Multer.File[],
): Promise<T> => {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  // Multer has already written the files to disk; don't leave them behind.
  await FileService.discardUploads(files);
  throw AppError.validation(
    "Check the name and description",
    parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
};

export const UploadFile = async (req: Request, res: Response) => {
  const details = await parseBody(fileDetailsSchema, req.body ?? {}, req.file ? [req.file] : []);
  const [file] = await FileService.uploadFiles(
    getWorkspaceContext(req),
    req.file ? [req.file] : undefined,
    [details],
  );
  sendSuccess(res, { statusCode: HttpStatus.CREATED, message: "File uploaded", data: { file } });
};

export const UploadFiles = async (req: Request, res: Response) => {
  const details = await parseBody(
    batchFileDetailsSchema,
    (req.body as { metadata?: unknown } | undefined)?.metadata,
    Array.isArray(req.files) ? req.files : [],
  );
  const files = await FileService.uploadFiles(
    getWorkspaceContext(req),
    Array.isArray(req.files) ? req.files : undefined,
    details,
  );
  sendSuccess(res, {
    statusCode: HttpStatus.CREATED,
    message: `${files.length} ${files.length === 1 ? "file" : "files"} uploaded`,
    data: { files },
  });
};

export const ListFiles = async (req: Request, res: Response) => {
  const { kind } = req.query as ListFilesQuery;
  const files = await FileService.listFiles(getWorkspaceContext(req).workspace._id, kind);
  sendSuccess(res, { message: "Files", data: { files } });
};

export const DeleteFile = async (req: Request, res: Response) => {
  const { fileId } = req.params as FileParams;
  await FileService.deleteFile(getWorkspaceContext(req), fileId);
  sendSuccess(res, { message: "File deleted", data: null });
};
