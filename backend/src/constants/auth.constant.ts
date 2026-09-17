import { API_V1_PREFIX } from "./http.constant";

export const REFRESH_TOKEN_COOKIE = "flowpost_rt";
/** Scope the refresh cookie to auth routes so it is never sent with regular API calls. */
export const REFRESH_TOKEN_COOKIE_PATH = `${API_V1_PREFIX}/auth`;

/**
 * Cookie-authenticated endpoints (refresh, logout) require this header. Browsers
 * cannot send custom headers cross-origin without a CORS preflight, which our
 * origin allowlist rejects — this blocks CSRF even with SameSite=None cookies.
 */
export const CSRF_HEADER = "X-Requested-With";
export const CSRF_HEADER_VALUE = "XMLHttpRequest";

/**
 * System-wide role, separate from workspace roles. SUPER_ADMIN can open the
 * admin panel. It can't be granted through the API, only with the
 * `admin:grant` script, so a compromised session can't create new admins.
 */
export const UserRole = {
  USER: "user",
  SUPER_ADMIN: "super_admin",
} as const;
export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: "active",
  /** Blocked by a super admin: can't sign in, and every session is ended. */
  SUSPENDED: "suspended",
} as const;
export type UserStatusValue = (typeof UserStatus)[keyof typeof UserStatus];

export const RefreshTokenRevokeReason = {
  ROTATED: "rotated",
  LOGOUT: "logout",
  LOGOUT_ALL: "logout_all",
  PASSWORD_CHANGE: "password_change",
  PASSWORD_RESET: "password_reset",
  REUSE_DETECTED: "reuse_detected",
  USER_NOT_FOUND: "user_not_found",
  SUSPENDED: "suspended",
} as const;
export type RefreshTokenRevokeReasonValue =
  (typeof RefreshTokenRevokeReason)[keyof typeof RefreshTokenRevokeReason];
