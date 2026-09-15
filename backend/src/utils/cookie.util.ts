import type { CookieOptions, Request, Response } from "express";
import { env, isProduction } from "../config/env";
import { REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE_PATH } from "../constants/auth.constant";

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
