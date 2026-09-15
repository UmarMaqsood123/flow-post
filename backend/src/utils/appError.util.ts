import { ErrorCode, type ErrorCodeValue, HttpStatus } from "../constants/http.constant";

interface AppErrorOptions {
  code?: ErrorCodeValue;
  details?: unknown;
  /** Operational errors are expected (bad input, not found). Others are bugs. */
  isOperational?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCodeValue;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    options: AppErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options.code ?? ErrorCode.INTERNAL_ERROR;
    this.details = options.details;
    this.isOperational = options.isOperational ?? statusCode < 500;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(
    message = "Bad request",
    details?: unknown,
    code: ErrorCodeValue = ErrorCode.BAD_REQUEST,
  ) {
    return new AppError(message, HttpStatus.BAD_REQUEST, { code, details });
  }

  static validation(message = "Validation failed", details?: unknown) {
    return new AppError(message, HttpStatus.UNPROCESSABLE_ENTITY, {
      code: ErrorCode.VALIDATION_ERROR,
      details,
    });
  }

  static unauthorized(
    message = "Authentication required",
    code: ErrorCodeValue = ErrorCode.UNAUTHORIZED,
  ) {
    return new AppError(message, HttpStatus.UNAUTHORIZED, { code });
  }

  static forbidden(
    message = "You do not have permission to perform this action",
    code: ErrorCodeValue = ErrorCode.FORBIDDEN,
  ) {
    return new AppError(message, HttpStatus.FORBIDDEN, { code });
  }

  static notFound(message = "Resource not found") {
    return new AppError(message, HttpStatus.NOT_FOUND, { code: ErrorCode.NOT_FOUND });
  }

  static conflict(message = "Resource already exists", details?: unknown) {
    return new AppError(message, HttpStatus.CONFLICT, { code: ErrorCode.CONFLICT, details });
  }

  static tooManyRequests(message = "Too many requests, please try again later") {
    return new AppError(message, HttpStatus.TOO_MANY_REQUESTS, { code: ErrorCode.RATE_LIMITED });
  }

  static serviceUnavailable(message = "Service unavailable", details?: unknown) {
    return new AppError(message, HttpStatus.SERVICE_UNAVAILABLE, {
      code: ErrorCode.SERVICE_UNAVAILABLE,
      details,
      isOperational: true,
    });
  }

  static internal(message = "Internal server error", cause?: unknown) {
    return new AppError(message, HttpStatus.INTERNAL_SERVER_ERROR, {
      code: ErrorCode.INTERNAL_ERROR,
      isOperational: false,
      cause,
    });
  }
}
