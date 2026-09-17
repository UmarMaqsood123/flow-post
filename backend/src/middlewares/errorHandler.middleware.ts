import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { ZodError } from "zod";
import { env, isProduction } from "../config/env";
import { ErrorCode, HttpStatus } from "../constants/http.constant";
import { sendError } from "../utils/apiResponse.util";
import { AppError } from "../utils/appError.util";

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue?: Record<string, unknown>;
}

interface BodyParserError extends Error {
  type: string;
  status?: number;
}

const isDuplicateKeyError = (error: unknown): error is MongoDuplicateKeyError =>
  error instanceof Error && (error as MongoDuplicateKeyError).code === 11000;

const isBodyParserError = (error: unknown): error is BodyParserError =>
  error instanceof Error && typeof (error as BodyParserError).type === "string";

/** Maps known library errors onto AppError so every response has one shape. */
const normalizeError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new AppError(
        `File is too large. The maximum size is ${env.UPLOAD_MAX_FILE_SIZE_MB} MB for images and documents and ${env.UPLOAD_MAX_VIDEO_SIZE_MB} MB for videos.`,
        HttpStatus.PAYLOAD_TOO_LARGE,
        { code: ErrorCode.PAYLOAD_TOO_LARGE },
      );
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return AppError.badRequest(`You can upload up to ${env.UPLOAD_MAX_FILES} files at once`);
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return AppError.badRequest(`Unexpected file field "${error.field ?? "unknown"}"`);
    }
    return AppError.badRequest(error.message);
  }

  if (error instanceof ZodError) {
    return AppError.validation(
      "Validation failed",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return AppError.validation(
      "Validation failed",
      Object.values(error.errors).map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }

  if (error instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for ${error.path}`);
  }

  if (isDuplicateKeyError(error)) {
    const fields = Object.keys(error.keyValue ?? {});
    return AppError.conflict(
      fields.length ? `Duplicate value for ${fields.join(", ")}` : "Duplicate value",
      fields.length ? { fields } : undefined,
    );
  }

  if (isBodyParserError(error)) {
    if (error.type === "entity.parse.failed") {
      return new AppError("Malformed JSON in request body", HttpStatus.BAD_REQUEST, {
        code: ErrorCode.INVALID_JSON,
      });
    }
    if (error.type === "entity.too.large") {
      return new AppError("Request body is too large", HttpStatus.PAYLOAD_TOO_LARGE, {
        code: ErrorCode.PAYLOAD_TOO_LARGE,
      });
    }
    // Other client-side body problems (unsupported charset or encoding, aborted
    // uploads) keep their 4xx status instead of being reported as server errors.
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return AppError.badRequest("The request body couldn't be read");
    }
  }

  return AppError.internal("Internal server error", error);
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // If streaming already started, let Express close the connection.
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = normalizeError(error);
  const originalError = appError.cause ?? error;

  if (appError.isOperational) {
    req.log.warn({ err: appError, code: appError.code }, appError.message);
  } else {
    req.log.error({ err: originalError }, "Unhandled error");
  }

  // Never leak internals of unexpected errors in production.
  let message = appError.message;
  if (!appError.isOperational) {
    message =
      !isProduction && originalError instanceof Error
        ? originalError.message
        : "Internal server error";
  }
  const stack =
    !isProduction && !appError.isOperational && originalError instanceof Error
      ? originalError.stack
      : undefined;

  sendError(res, {
    statusCode: appError.statusCode,
    message,
    code: appError.code,
    details: appError.details,
    requestId: String(req.id),
    stack,
  });
};
