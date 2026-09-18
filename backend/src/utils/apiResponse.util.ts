import type { Response } from "express";
import { type ErrorCodeValue, HttpStatus } from "../constants/http.constant";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: {
    code: ErrorCodeValue;
    details?: unknown;
    requestId?: string;
    stack?: string;
  };
}

interface SuccessOptions<T> {
  data: T;
  message?: string;
  statusCode?: number;
  meta?: Record<string, unknown>;
}

export const sendSuccess = <T>(
  res: Response,
  { data, message = "Success", statusCode = HttpStatus.OK, meta }: SuccessOptions<T>,
): Response<ApiSuccessResponse<T>> => {
  const body: ApiSuccessResponse<T> = { success: true, message, data, ...(meta ? { meta } : {}) };
  return res.status(statusCode).json(body);
};

export const sendCreated = <T>(res: Response, data: T, message = "Created") =>
  sendSuccess(res, { data, message, statusCode: HttpStatus.CREATED });

export const sendNoContent = (res: Response): Response => res.status(HttpStatus.NO_CONTENT).end();

interface PaginatedOptions<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  message?: string;
}

export const buildPaginationMeta = (page: number, limit: number, total: number): PaginationMeta => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

export const sendPaginated = <T>(
  res: Response,
  { items, page, limit, total, message = "Success" }: PaginatedOptions<T>,
) =>
  sendSuccess(res, {
    data: items,
    message,
    meta: { pagination: buildPaginationMeta(page, limit, total) },
  });

interface ErrorOptions {
  statusCode: number;
  message: string;
  code: ErrorCodeValue;
  details?: unknown;
  requestId?: string;
  stack?: string;
}

export const sendError = (
  res: Response,
  { statusCode, message, code, details, requestId, stack }: ErrorOptions,
): Response<ApiErrorResponse> => {
  const body: ApiErrorResponse = {
    success: false,
    message,
    error: {
      code,
      ...(details !== undefined ? { details } : {}),
      ...(requestId ? { requestId } : {}),
      ...(stack ? { stack } : {}),
    },
  };
  return res.status(statusCode).json(body);
};
