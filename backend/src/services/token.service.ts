import { randomUUID } from "node:crypto";
import type { Types } from "mongoose";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  RefreshTokenRevokeReason,
  type RefreshTokenRevokeReasonValue,
} from "../constants/auth.constant";
import { ErrorCode } from "../constants/http.constant";
import { RefreshToken } from "../models/refreshToken.model";
import { AppError } from "../utils/appError.util";
import type { RequestMeta } from "../utils/request.util";
import { generateOpaqueToken, hashToken } from "../utils/token.util";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reasons that end a session for good. The reuse grace period never applies to these. */
const SESSION_ENDING_REASONS: RefreshTokenRevokeReasonValue[] = [
  RefreshTokenRevokeReason.LOGOUT,
  RefreshTokenRevokeReason.LOGOUT_ALL,
  RefreshTokenRevokeReason.PASSWORD_CHANGE,
  RefreshTokenRevokeReason.PASSWORD_RESET,
  RefreshTokenRevokeReason.REUSE_DETECTED,
  RefreshTokenRevokeReason.USER_NOT_FOUND,
];

export interface IssuedRefreshToken {
  id: Types.ObjectId;
  token: string;
  expiresAt: Date;
}

export const issueRefreshToken = async (
  userId: Types.ObjectId,
  meta: RequestMeta,
  family: string = randomUUID(),
): Promise<IssuedRefreshToken> => {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);

  const record = await RefreshToken.create({
    user: userId,
    tokenHash: hashToken(token),
    family,
    expiresAt,
    createdByIp: meta.ip,
    userAgent: meta.userAgent,
  });

  return { id: record._id, token, expiresAt };
};

export const revokeTokenFamily = async (
  family: string,
  reason: RefreshTokenRevokeReasonValue,
): Promise<void> => {
  await RefreshToken.updateMany(
    { family, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
};

export const revokeRefreshToken = async (
  rawToken: string,
  reason: RefreshTokenRevokeReasonValue,
): Promise<void> => {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
};

/**
 * Revokes every token from the same login as `rawToken` (used by logout), so
 * tokens issued during the reuse grace period can't outlive the session.
 */
export const revokeFamilyByToken = async (
  rawToken: string,
  reason: RefreshTokenRevokeReasonValue,
): Promise<void> => {
  const record = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) })
    .select("family")
    .lean();
  if (record) await revokeTokenFamily(record.family, reason);
};

export const revokeAllUserRefreshTokens = async (
  userId: Types.ObjectId,
  reason: RefreshTokenRevokeReasonValue,
): Promise<void> => {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
};

const isWithinReuseGracePeriod = (revokedAt: Date | null, now: Date): boolean =>
  env.REFRESH_TOKEN_REUSE_GRACE_SECONDS > 0 &&
  revokedAt !== null &&
  now.getTime() - revokedAt.getTime() <= env.REFRESH_TOKEN_REUSE_GRACE_SECONDS * 1000;

/**
 * Exchanges a refresh token for a new one (rotation). Each token is single-use:
 * presenting an already-rotated token means it was stolen or replayed, so the
 * entire token family is revoked and every device on that login must sign in again.
 *
 * Exception — reuse grace period: a token rotated only seconds ago is accepted
 * once more, because a legitimate client can lose the rotation response (page
 * reload mid-request, parallel tabs). This only applies while the session is
 * still alive; logged-out, reset or compromised sessions are never revived.
 */
export const rotateRefreshToken = async (
  rawToken: string,
  meta: RequestMeta,
): Promise<{ userId: Types.ObjectId; refreshToken: IssuedRefreshToken }> => {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Atomic claim: concurrent requests with the same token cannot both succeed.
  const current = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now, revokedReason: RefreshTokenRevokeReason.ROTATED } },
  );

  if (current) {
    const refreshToken = await issueRefreshToken(current.user, meta, current.family);
    await RefreshToken.updateOne({ _id: current._id }, { $set: { replacedBy: refreshToken.id } });
    return { userId: current.user, refreshToken };
  }

  const existing = await RefreshToken.findOne({ tokenHash }).lean();

  if (
    existing?.revokedReason === RefreshTokenRevokeReason.ROTATED &&
    existing.expiresAt > now &&
    isWithinReuseGracePeriod(existing.revokedAt, now)
  ) {
    const sessionEnded = await RefreshToken.exists({
      family: existing.family,
      revokedReason: { $in: SESSION_ENDING_REASONS },
    });

    if (!sessionEnded) {
      const refreshToken = await issueRefreshToken(existing.user, meta, existing.family);
      // The client never received (or has already replaced) the successor issued moments
      // ago — retire it so only the newest token in this family stays usable.
      if (existing.replacedBy) {
        await RefreshToken.updateOne(
          { _id: existing.replacedBy, revokedAt: null },
          {
            $set: {
              revokedAt: now,
              revokedReason: RefreshTokenRevokeReason.ROTATED,
              replacedBy: refreshToken.id,
            },
          },
        );
      }
      logger.info(
        { userId: existing.user.toString(), family: existing.family },
        "Refresh token reused within grace period — issued a new token",
      );
      return { userId: existing.user, refreshToken };
    }
  }

  if (
    existing?.revokedReason === RefreshTokenRevokeReason.ROTATED ||
    existing?.revokedReason === RefreshTokenRevokeReason.REUSE_DETECTED
  ) {
    await revokeTokenFamily(existing.family, RefreshTokenRevokeReason.REUSE_DETECTED);
    logger.warn(
      { userId: existing.user.toString(), family: existing.family, ip: meta.ip },
      "Refresh token reuse detected — token family revoked",
    );
    throw AppError.unauthorized(
      "Your session was revoked for security reasons. Please log in again.",
      ErrorCode.SESSION_REVOKED,
    );
  }

  throw AppError.unauthorized(
    "Your session has expired. Please log in again.",
    ErrorCode.INVALID_TOKEN,
  );
};
