import type { Request, Response } from "express";
import { HttpStatus } from "../constants/http.constant";
import * as FileService from "../services/file.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type { FileParams, ListFilesQuery } from "../validators/file.validator";

export const UploadFile = async (req: Request, res: Response) => {
  const [file] = await FileService.uploadFiles(
    getWorkspaceContext(req),
    req.file ? [req.file] : undefined,
  );
  sendSuccess(res, { statusCode: HttpStatus.CREATED, message: "File uploaded", data: { file } });
};

export const UploadFiles = async (req: Request, res: Response) => {
  const files = await FileService.uploadFiles(
    getWorkspaceContext(req),
    Array.isArray(req.files) ? req.files : undefined,
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
