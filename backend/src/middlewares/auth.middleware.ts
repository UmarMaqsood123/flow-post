import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { CSRF_HEADER, CSRF_HEADER_VALUE, UserRole, UserStatus } from "../constants/auth.constant";
import { ErrorCode } from "../constants/http.constant";
import { User } from "../models/user.model";
import { AppError } from "../utils/appError.util";
import { verifyAccessToken } from "../utils/token.util";

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60_000;

export const suspendedError = () =>
  AppError.forbidden(
    "This account has been suspended. Contact support if you think this is a mistake.",
    ErrorCode.ACCOUNT_SUSPENDED,
  );

const extractBearerToken = (header: string | undefined): string | undefined => {
  if (!header) return undefined;
  const [scheme, token] = header.trim().split(/\s+/);
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
};

/**
 * Requires a valid access token and attaches the user to `req.user`.
 * The user is loaded on every request so deleted accounts and bumped
 * `tokenVersion` (logout-all, password change) take effect immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = extractBearerToken(req.get("authorization"));
  if (!token) throw AppError.unauthorized("Authentication required");

  const claims = verifyAccessToken(token);
  if (!isValidObjectId(claims.sub)) {
    throw AppError.unauthorized("Invalid access token", ErrorCode.INVALID_TOKEN);
  }

  const user = await User.findById(claims.sub);
  if (!user || user.tokenVersion !== claims.ver) {
    throw AppError.unauthorized("Your session is no longer valid", ErrorCode.SESSION_REVOKED);
  }

  if (user.status === UserStatus.SUSPENDED) throw suspendedError();

  // Feeds the "active users" count; written at most every few minutes per user.
  const now = Date.now();
  if (!user.lastActiveAt || now - user.lastActiveAt.getTime() > ACTIVITY_WRITE_INTERVAL_MS) {
    user.lastActiveAt = new Date(now);
    await User.updateOne({ _id: user._id }, { $set: { lastActiveAt: user.lastActiveAt } });
  }

  req.user = user;
  next();
};

/** Only SUPER_ADMIN, re-read from the database on every request by `authenticate`. */
export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) throw AppError.unauthorized();
  // Not found rather than forbidden, so the admin API doesn't advertise itself.
  if (req.user.role !== UserRole.SUPER_ADMIN) throw AppError.notFound("Not found");
  next();
};

/** Use after `authenticate` on routes that need a confirmed email address. */
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.user) throw AppError.unauthorized();
  if (!req.user.emailVerified) {
    throw AppError.forbidden(
      "Please verify your email address to continue",
      ErrorCode.EMAIL_NOT_VERIFIED,
    );
  }
  next();
};

/** CSRF defense for cookie-authenticated endpoints — see CSRF_HEADER. */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    throw AppError.forbidden("Missing or invalid CSRF header");
  }
  next();
};

/** Responses containing tokens or account data must never be cached. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};
