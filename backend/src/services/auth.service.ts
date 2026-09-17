import type { Types } from "mongoose";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { RefreshTokenRevokeReason, UserStatus } from "../constants/auth.constant";
import { ErrorCode, HttpStatus } from "../constants/http.constant";
import { RefreshToken } from "../models/refreshToken.model";
import { type PublicUser, toPublicUser, User, type UserDocument } from "../models/user.model";
import { AppError } from "../utils/appError.util";
import {
  hashPassword,
  passwordNeedsRehash,
  verifyAgainstDummyHash,
  verifyPassword,
} from "../utils/password.util";
import type { RequestMeta } from "../utils/request.util";
import { generateOpaqueToken, hashToken, signAccessToken } from "../utils/token.util";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "../validators/auth.validator";
import * as EmailService from "./email.service";
import * as TokenService from "./token.service";
import { suspendedError } from "../middlewares/auth.middleware";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  refreshToken: TokenService.IssuedRefreshToken;
}

const invalidCredentials = () =>
  AppError.unauthorized("Invalid email or password", ErrorCode.INVALID_CREDENTIALS);

const invalidLink = (message: string) =>
  new AppError(message, HttpStatus.BAD_REQUEST, { code: ErrorCode.INVALID_TOKEN });

const buildAccessToken = (user: UserDocument) => ({
  accessToken: signAccessToken({ userId: user.id, tokenVersion: user.tokenVersion }),
  expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
});

const createSession = async (user: UserDocument, meta: RequestMeta): Promise<AuthSession> => ({
  user: toPublicUser(user),
  ...buildAccessToken(user),
  refreshToken: await TokenService.issueRefreshToken(user._id, meta),
});

/** Sets a new single-use verification token on the (unsaved) document and returns the raw token. */
const assignEmailVerificationToken = (user: UserDocument): string => {
  const token = generateOpaqueToken(32);
  user.emailVerificationTokenHash = hashToken(token);
  user.emailVerificationExpiresAt = new Date(
    Date.now() + env.EMAIL_VERIFICATION_TTL_HOURS * HOUR_MS,
  );
  return token;
};

export const registerUser = async (
  input: RegisterInput,
  meta: RequestMeta,
): Promise<AuthSession> => {
  if (await User.exists({ email: input.email })) {
    throw AppError.conflict("An account with this email already exists");
  }

  const user = new User({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    lastLoginAt: new Date(),
  });
  const verificationToken = assignEmailVerificationToken(user);
  // A concurrent signup with the same email hits the unique index → 409 via the error handler.
  await user.save();

  EmailService.dispatchEmail(
    () => EmailService.sendVerificationEmail(user, verificationToken),
    "email-verification",
  );
  logger.info({ userId: user.id }, "User registered");

  return createSession(user, meta);
};

export const loginUser = async (input: LoginInput, meta: RequestMeta): Promise<AuthSession> => {
  const user = await User.findOne({ email: input.email }).select("+passwordHash");

  if (!user) {
    await verifyAgainstDummyHash(input.password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    logger.info({ userId: user.id, ip: meta.ip }, "Failed login attempt");
    throw invalidCredentials();
  }

  // Checked after the password, so suspension isn't revealed to someone guessing.
  if (user.status === UserStatus.SUSPENDED) throw suspendedError();

  // Transparently upgrade hashes created with older parameters.
  if (passwordNeedsRehash(user.passwordHash)) {
    user.passwordHash = await hashPassword(input.password);
  }
  user.lastLoginAt = new Date();
  await user.save();

  return createSession(user, meta);
};

export const refreshSession = async (
  rawToken: string | undefined,
  meta: RequestMeta,
): Promise<AuthSession> => {
  if (!rawToken) {
    throw AppError.unauthorized("No active session", ErrorCode.INVALID_TOKEN);
  }

  // The session version before rotating. If "log out everywhere" or a password
  // change lands between claiming the old token and issuing the new one, the new
  // token escapes that revocation; comparing versions afterwards catches it.
  const presented = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) })
    .select("user")
    .lean();
  const versionBefore = presented
    ? (await User.findById(presented.user).select("tokenVersion").lean())?.tokenVersion
    : undefined;

  const { userId, refreshToken } = await TokenService.rotateRefreshToken(rawToken, meta);
  const user = await User.findById(userId);
  if (!user) {
    await TokenService.revokeAllUserRefreshTokens(userId, RefreshTokenRevokeReason.USER_NOT_FOUND);
    throw AppError.unauthorized("No active session", ErrorCode.INVALID_TOKEN);
  }
  if (user.status === UserStatus.SUSPENDED) {
    await TokenService.revokeAllUserRefreshTokens(userId, RefreshTokenRevokeReason.SUSPENDED);
    throw suspendedError();
  }
  if (versionBefore !== undefined && user.tokenVersion !== versionBefore) {
    await RefreshToken.updateOne(
      { _id: refreshToken.id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: RefreshTokenRevokeReason.LOGOUT_ALL } },
    );
    throw AppError.unauthorized("Your session is no longer valid", ErrorCode.SESSION_REVOKED);
  }

  return { user: toPublicUser(user), ...buildAccessToken(user), refreshToken };
};

/** Ends this login: revokes every refresh token in its family, not just the one presented. */
export const logoutUser = async (rawToken: string | undefined): Promise<void> => {
  if (rawToken) {
    await TokenService.revokeFamilyByToken(rawToken, RefreshTokenRevokeReason.LOGOUT);
  }
};

/** Signs the user out everywhere: revokes refresh tokens and invalidates access tokens. */
export const logoutAllSessions = async (userId: Types.ObjectId): Promise<void> => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await TokenService.revokeAllUserRefreshTokens(userId, RefreshTokenRevokeReason.LOGOUT_ALL);
};

export const verifyEmail = async (token: string): Promise<PublicUser> => {
  const now = new Date();
  const user = await User.findOneAndUpdate(
    { emailVerificationTokenHash: hashToken(token), emailVerificationExpiresAt: { $gt: now } },
    {
      $set: {
        emailVerified: true,
        emailVerifiedAt: now,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    },
    { returnDocument: "after" },
  );

  if (!user) throw invalidLink("This verification link is invalid or has expired");

  logger.info({ userId: user.id }, "Email verified");
  return toPublicUser(user);
};

export const resendVerificationEmail = async (user: UserDocument): Promise<void> => {
  if (user.emailVerified) {
    throw AppError.conflict("Your email address is already verified");
  }
  // Issuing a new token replaces (and so invalidates) any previous link.
  const token = assignEmailVerificationToken(user);
  await user.save();
  EmailService.dispatchEmail(
    () => EmailService.sendVerificationEmail(user, token),
    "email-verification",
  );
};

/** Always resolves the same way whether or not the account exists (no user enumeration). */
export const requestPasswordReset = async (email: string): Promise<void> => {
  const user = await User.findOne({ email });
  if (!user) return;

  const token = generateOpaqueToken(32);
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * MINUTE_MS);
  await user.save();

  EmailService.dispatchEmail(
    () => EmailService.sendPasswordResetEmail(user, token),
    "password-reset",
  );
  logger.info({ userId: user.id }, "Password reset requested");
};

export const resetPassword = async ({ token, password }: ResetPasswordInput): Promise<void> => {
  const now = new Date();
  // Check the link first: hashing a password is deliberately expensive, and
  // invalid links shouldn't cost that. The atomic update below still decides.
  const valid = await User.exists({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpiresAt: { $gt: now },
  });
  if (!valid) throw invalidLink("This password reset link is invalid or has expired");
  const passwordHash = await hashPassword(password);

  // Atomically consume the token so it can only ever be used once.
  const user = await User.findOneAndUpdate(
    { passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: { $gt: now } },
    {
      $set: {
        passwordHash,
        passwordChangedAt: now,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
      $inc: { tokenVersion: 1 },
    },
    { returnDocument: "after" },
  );

  if (!user) throw invalidLink("This password reset link is invalid or has expired");

  await TokenService.revokeAllUserRefreshTokens(user._id, RefreshTokenRevokeReason.PASSWORD_RESET);
  EmailService.dispatchEmail(() => EmailService.sendPasswordChangedEmail(user), "password-changed");
  logger.info({ userId: user.id }, "Password reset completed");
};

/** Changes the password, signs out all other sessions and returns a fresh session for this device. */
export const changePassword = async (
  authUser: UserDocument,
  { currentPassword, newPassword }: ChangePasswordInput,
  meta: RequestMeta,
): Promise<AuthSession> => {
  const user = await User.findById(authUser._id).select("+passwordHash");
  if (!user) throw AppError.unauthorized();

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    // 400 (not 401) so clients don't mistake this for an expired session.
    throw AppError.badRequest(
      "Current password is incorrect",
      [{ path: "currentPassword", message: "Current password is incorrect" }],
      ErrorCode.INVALID_CREDENTIALS,
    );
  }

  // Atomic increment, so a concurrent "log out everywhere" isn't lost. Any
  // outstanding reset link stops working too.
  const updated = await User.findOneAndUpdate(
    { _id: user._id },
    {
      $set: {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
      $inc: { tokenVersion: 1 },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw AppError.unauthorized();

  await TokenService.revokeAllUserRefreshTokens(user._id, RefreshTokenRevokeReason.PASSWORD_CHANGE);
  EmailService.dispatchEmail(
    () => EmailService.sendPasswordChangedEmail(updated),
    "password-changed",
  );
  logger.info({ userId: user.id }, "Password changed");

  return createSession(updated, meta);
};
