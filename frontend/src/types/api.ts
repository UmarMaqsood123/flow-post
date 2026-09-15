/** Mirrors backend/src/utils/apiResponse.util.ts — keep the two in sync. */

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
  meta?: { pagination?: PaginationMeta } & Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: {
    code: string;
    details?: unknown;
    requestId?: string;
    stack?: string;
  };
}
