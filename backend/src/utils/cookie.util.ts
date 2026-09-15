import type { CookieOptions, Request, Response } from "express";
import { env, isProduction } from "../config/env";
import { REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE_PATH } from "../constants/auth.constant";
import { API_V1_PREFIX } from "../constants/http.constant";
import { platformSlug, type SocialPlatformValue } from "../constants/social.constant";

const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: env.COOKIE_SAME_SITE,
  path: REFRESH_TOKEN_COOKIE_PATH,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const setRefreshTokenCookie = (res: Response, token: string, expiresAt: Date): void => {
  res.cookie(REFRESH_TOKEN_COOKIE, token, { ...refreshCookieOptions(), expires: expiresAt });
};

export const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieOptions());
};

export const getRefreshTokenFromCookie = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

// ── Social OAuth browser binding ────────────────────────────

const socialOAuthCookieName = (platform: SocialPlatformValue) =>
  `flowpost_oauth_${platformSlug(platform)}`;

/**
 * Only sent to the social-accounts routes. SameSite=Lax (not Strict) because the
 * callback is a top-level navigation coming from the platform's site.
 */
const socialOAuthCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: env.COOKIE_SAME_SITE === "none" ? "none" : "lax",
  path: `${API_V1_PREFIX}/social-accounts`,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const setSocialOAuthCookie = (
  res: Response,
  platform: SocialPlatformValue,
  value: string,
  expiresAt: Date,
): void => {
  res.cookie(socialOAuthCookieName(platform), value, {
    ...socialOAuthCookieOptions(),
    expires: expiresAt,
  });
};

export const clearSocialOAuthCookie = (res: Response, platform: SocialPlatformValue): void => {
  res.clearCookie(socialOAuthCookieName(platform), socialOAuthCookieOptions());
};

export const getSocialOAuthCookie = (
  req: Request,
  platform: SocialPlatformValue,
): string | undefined => {
  const value: unknown = req.cookies?.[socialOAuthCookieName(platform)];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};
