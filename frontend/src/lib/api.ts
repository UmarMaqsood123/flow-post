import axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import { env } from "@/config/env";
import type { ApiErrorResponse, ApiSuccessResponse } from "@/types/api";
import type { AuthSession } from "@/types/auth";
import { ApiError } from "./apiError";
import { clearAccessToken, getAccessToken, setAccessToken } from "./authToken";
import { queryClient } from "./queryClient";
import { queryKeys } from "./queryKeys";

export { ApiError } from "./apiError";

declare module "axios" {
  interface AxiosRequestConfig {
    /** Don't try to refresh the session on 401 (used by the auth endpoints themselves). */
    skipAuthRefresh?: boolean;
    _retried?: boolean;
  }
}

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
    // Required by the API's CSRF check on cookie-authenticated endpoints.
    "X-Requested-With": "XMLHttpRequest",
  },
});

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.headers.has("Authorization")) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

const toApiError = (error: AxiosError<ApiErrorResponse>): ApiError => {
  if (error.response) {
    const { status, data } = error.response;
    return new ApiError(
      data?.message ?? error.message,
      status,
      data?.error?.code ?? "UNKNOWN_ERROR",
      data?.error?.details,
      data?.error?.requestId,
    );
  }
  const code = error.code === "ECONNABORTED" ? "TIMEOUT" : "NETWORK_ERROR";
  return new ApiError("Unable to reach the server", 0, code);
};

/** Clears client-side auth state. Route guards react by redirecting to login. */
export const endSession = () => {
  clearAccessToken();
  queryClient.setQueryData(queryKeys.auth.session(), null);
};

const withCrossTabLock = <T>(task: () => Promise<T>): Promise<T> =>
  typeof navigator !== "undefined" && "locks" in navigator
    ? (navigator.locks.request("flowpost:auth-refresh", task) as Promise<T>)
    : task();

let refreshInFlight: Promise<AuthSession> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token.
 * Refresh tokens are single-use and the API revokes the session if one is
 * replayed, so calls are de-duplicated within a tab and serialized across tabs.
 */
export const refreshSession = (): Promise<AuthSession> => {
  refreshInFlight ??= withCrossTabLock(async () => {
    const response = await http.post<ApiSuccessResponse<AuthSession>>("/auth/refresh", undefined, {
      skipAuthRefresh: true,
    });
    setAccessToken(response.data.data.accessToken);
    return response.data.data;
  }).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const config = error.config;
    const canRefresh =
      error.response?.status === 401 &&
      config !== undefined &&
      !config.skipAuthRefresh &&
      !config._retried &&
      getAccessToken() !== null;

    if (canRefresh) {
      config._retried = true;
      try {
        const session = await refreshSession();
        config.headers.set("Authorization", `Bearer ${session.accessToken}`);
        return http(config);
      } catch (refreshError) {
        endSession();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(toApiError(error));
  },
);

/** Thin typed wrapper that returns the success envelope `{ success, message, data, meta }`. */
export const api = {
  get: async <T>(url: string, config?: AxiosRequestConfig) =>
    (await http.get<ApiSuccessResponse<T>>(url, config)).data,
  post: async <T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig) =>
    (await http.post<ApiSuccessResponse<T>>(url, body, config)).data,
  put: async <T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig) =>
    (await http.put<ApiSuccessResponse<T>>(url, body, config)).data,
  patch: async <T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig) =>
    (await http.patch<ApiSuccessResponse<T>>(url, body, config)).data,
  delete: async <T>(url: string, config?: AxiosRequestConfig) =>
    (await http.delete<ApiSuccessResponse<T>>(url, config)).data,
};
