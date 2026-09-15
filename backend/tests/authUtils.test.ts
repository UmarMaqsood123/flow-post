import { describe, expect, it } from "vitest";
import { AppError } from "../src/utils/appError.util";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../src/utils/password.util";
import {
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from "../src/utils/token.util";

describe("password.util", () => {
  it("hashes with argon2id and a unique salt per hash", async () => {
    const first = await hashPassword("S3cret-password");
    const second = await hashPassword("S3cret-password");

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(first).not.toBe(second);
    expect(passwordNeedsRehash(first)).toBe(false);
  });

  it("verifies correct and rejects incorrect passwords", async () => {
    const hash = await hashPassword("S3cret-password");
    expect(await verifyPassword(hash, "S3cret-password")).toBe(true);
    expect(await verifyPassword(hash, "s3cret-password")).toBe(false);
  });

  it("returns false instead of throwing for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });
});

describe("token.util", () => {
  it("generates unique, URL-safe opaque tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it("hashes tokens deterministically with SHA-256", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("round-trips access token claims", () => {
    const token = signAccessToken({ userId: "507f1f77bcf86cd799439011", tokenVersion: 3 });
    expect(verifyAccessToken(token)).toEqual({ sub: "507f1f77bcf86cd799439011", ver: 3 });
  });

  it("rejects a tampered access token", () => {
    const token = signAccessToken({ userId: "507f1f77bcf86cd799439011", tokenVersion: 0 });
    const [header, payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), ver: 99 }),
    ).toString("base64url");

    expect(() => verifyAccessToken(`${header}.${tamperedPayload}.${signature}`)).toThrow(AppError);
  });
});
