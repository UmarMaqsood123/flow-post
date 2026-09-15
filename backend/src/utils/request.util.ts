import type { Request } from "express";
import type { UserDocument } from "../models/user.model";
import { AppError } from "./appError.util";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export const getRequestMeta = (req: Request): RequestMeta => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 512) ?? null,
});

/** Returns the user attached by `authenticate`, or throws if the route forgot the middleware. */
export const getAuthenticatedUser = (req: Request): UserDocument => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};
