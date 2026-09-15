import type { Request } from "express";
import { ipKeyGenerator, type Options, rateLimit } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { AppError } from "../utils/appError.util";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

type LimiterOptions = Partial<Omit<Options, "handler" | "store" | "message">> & {
  /** Unique name — used as the Redis key prefix and RateLimit-Policy identifier. */
  name: string;
  message?: string;
};

/** Redis-backed when RATE_LIMIT_STORE=redis so limits hold across API instances. */
const createStore = (name: string) =>
  env.RATE_LIMIT_STORE === "redis"
    ? {
        store: new RedisStore({
          prefix: `flowpost:rl:${name}:`,
          sendCommand: (command: string, ...args: string[]) =>
            redis.call(command, ...args) as Promise<RedisReply>,
        }),
      }
    : {};

export const createRateLimiter = ({ name, message, ...overrides }: LimiterOptions) =>
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    identifier: name,
    ...createStore(name),
    handler: (_req, _res, next) => {
      next(AppError.tooManyRequests(message));
    },
    ...overrides,
  });

const ipKey = (req: Request) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;

/** Keys on the submitted email (after validation normalized it), falling back to IP. */
const emailKey = (req: Request) => {
  const email: unknown = req.body?.email;
  return typeof email === "string" && email ? `email:${email}` : ipKey(req);
};

/** Keys on the authenticated user, falling back to IP. */
const userKey = (req: Request) => (req.user ? `user:${req.user.id}` : ipKey(req));

/** Default limiter for all /api/v1 routes. */
export const apiRateLimiter = createRateLimiter({ name: "api", keyGenerator: ipKey });

/** Stricter limits for credential and token endpoints. */
export const authRateLimiters = {
  register: createRateLimiter({
    name: "auth-register",
    windowMs: HOUR_MS,
    limit: 10,
    keyGenerator: ipKey,
    message: "Too many sign-up attempts. Please try again later.",
  }),
  loginByIp: createRateLimiter({
    name: "auth-login-ip",
    windowMs: 15 * MINUTE_MS,
    limit: 30,
    keyGenerator: ipKey,
    message: "Too many login attempts. Please try again later.",
  }),
  /** Brute-force protection per account, independent of the attacker's IP. */
  loginByEmail: createRateLimiter({
    name: "auth-login-email",
    windowMs: 15 * MINUTE_MS,
    limit: 5,
    keyGenerator: emailKey,
    skipSuccessfulRequests: true,
    message: "Too many failed login attempts. Please try again in 15 minutes.",
  }),
  refresh: createRateLimiter({
    name: "auth-refresh",
    windowMs: 15 * MINUTE_MS,
    limit: 100,
    keyGenerator: ipKey,
  }),
  forgotPasswordByIp: createRateLimiter({
    name: "auth-forgot-ip",
    windowMs: HOUR_MS,
    limit: 10,
    keyGenerator: ipKey,
    message: "Too many password reset requests. Please try again later.",
  }),
  forgotPasswordByEmail: createRateLimiter({
    name: "auth-forgot-email",
    windowMs: HOUR_MS,
    limit: 3,
    keyGenerator: emailKey,
    message: "Too many password reset requests. Please try again later.",
  }),
  resetPassword: createRateLimiter({
    name: "auth-reset",
    windowMs: HOUR_MS,
    limit: 10,
    keyGenerator: ipKey,
  }),
  verifyEmail: createRateLimiter({
    name: "auth-verify-email",
    windowMs: HOUR_MS,
    limit: 20,
    keyGenerator: ipKey,
  }),
  resendVerification: createRateLimiter({
    name: "auth-resend-verification",
    windowMs: HOUR_MS,
    limit: 3,
    keyGenerator: userKey,
    message: "Too many verification emails requested. Please try again later.",
  }),
  changePassword: createRateLimiter({
    name: "auth-change-password",
    windowMs: 15 * MINUTE_MS,
    limit: 5,
    keyGenerator: userKey,
  }),
};

export const workspaceRateLimiters = {
  createWorkspace: createRateLimiter({
    name: "workspace-create",
    windowMs: HOUR_MS,
    limit: 20,
    keyGenerator: userKey,
    message: "You've created too many workspaces recently. Please try again later.",
  }),
  inviteMember: createRateLimiter({
    name: "workspace-invite",
    windowMs: HOUR_MS,
    limit: 50,
    keyGenerator: userKey,
    message: "Too many invitations sent. Please try again later.",
  }),
  /** Preview/accept take a secret token — limit guessing. */
  invitationToken: createRateLimiter({
    name: "workspace-invitation-token",
    windowMs: 15 * MINUTE_MS,
    limit: 30,
    keyGenerator: ipKey,
  }),
  uploadFile: createRateLimiter({
    name: "workspace-upload",
    windowMs: HOUR_MS,
    limit: 100,
    keyGenerator: userKey,
    message: "Too many uploads. Please try again later.",
  }),
};
