import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ErrorCode } from "../constants/http.constant";
import { AppError } from "./appError.util";

const ACCESS_TOKEN_TYPE = "access";

export interface AccessTokenClaims {
  /** User id */
  sub: string;
  /** User's tokenVersion at issue time — bumping it invalidates outstanding tokens. */
  ver: number;
}

/** Cryptographically random, URL-safe opaque token (refresh, verification, reset). */
export const generateOpaqueToken = (byteLength = 48): string =>
  randomBytes(byteLength).toString("base64url");

/**
 * SHA-256 of a high-entropy token. Only hashes are persisted, so a database leak
 * does not expose usable tokens. (Slow hashing is unnecessary for random tokens.)
 */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const signAccessToken = ({
  userId,
  tokenVersion,
}: {
  userId: string;
  tokenVersion: number;
}) =>
  jwt.sign({ ver: tokenVersion, typ: ACCESS_TOKEN_TYPE }, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    subject: userId,
    jwtid: randomUUID(),
  });

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized("Access token has expired", ErrorCode.TOKEN_EXPIRED);
    }
    throw AppError.unauthorized("Invalid access token", ErrorCode.INVALID_TOKEN);
  }

  if (
    typeof decoded === "string" ||
    decoded.typ !== ACCESS_TOKEN_TYPE ||
    typeof decoded.sub !== "string" ||
    typeof decoded.ver !== "number"
  ) {
    throw AppError.unauthorized("Invalid access token", ErrorCode.INVALID_TOKEN);
  }

  return { sub: decoded.sub, ver: decoded.ver };
};
