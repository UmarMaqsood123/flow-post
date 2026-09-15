import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { RefreshTokenRevokeReason } from "../src/constants/auth.constant";
import { RefreshToken } from "../src/models/refreshToken.model";
import { User } from "../src/models/user.model";
import { mailOutbox } from "../src/utils/mailer.util";
import { hashToken } from "../src/utils/token.util";
import {
  createClient,
  extractTokenFromEmail,
  getRefreshCookie,
  getSetCookieHeader,
  postWithRefreshCookie,
  registerUser,
  uniqueEmail,
  VALID_PASSWORD,
  waitForEmail,
} from "./helpers/client";
import { useTestDatabase } from "./helpers/database";

useTestDatabase();

const SECRET_PATTERNS = [/passwordHash/, /\$argon2/, /TokenHash/, /tokenVersion/];

const expectNoSecrets = (body: unknown) => {
  const json = JSON.stringify(body);
  for (const pattern of SECRET_PATTERNS) expect(json).not.toMatch(pattern);
};

describe("POST /auth/register", () => {
  it("creates an account, starts a session and sends a verification email", async () => {
    const client = createClient();
    const { res, credentials } = await registerUser(client, { email: "  Ada@Example.COM " });

    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "user",
      emailVerified: false,
    });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.expiresIn).toBe(env.ACCESS_TOKEN_TTL_SECONDS);
    expect(res.headers["cache-control"]).toBe("no-store");
    expectNoSecrets(res.body);

    const cookie = getSetCookieHeader(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const stored = await User.findOne({ email: "ada@example.com" }).select("+passwordHash");
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.passwordHash).not.toContain(credentials.password);

    const email = await waitForEmail("ada@example.com", "Verify");
    expect(email.text).toContain("http://localhost:5173/verify-email?token=");
  });

  it("rejects a duplicate email regardless of case", async () => {
    const client = createClient();
    const { credentials } = await registerUser(client);

    const res = await client
      .post("/register", { ...credentials, email: credentials.email.toUpperCase() })
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("validates input and reports each invalid field", async () => {
    const res = await createClient()
      .post("/register", { name: " ", email: "not-an-email", password: "short" })
      .expect(422);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });

  it("enforces password complexity", async () => {
    const res = await createClient()
      .post("/register", { name: "Ada", email: uniqueEmail(), password: "lettersonly" })
      .expect(422);
    expect(res.body.error.details[0].message).toMatch(/number/);
  });
});

describe("POST /auth/login", () => {
  it("logs in with valid credentials (email is case-insensitive)", async () => {
    const client = createClient();
    const { credentials } = await registerUser(client);

    const res = await createClient()
      .post("/login", { email: credentials.email.toUpperCase(), password: VALID_PASSWORD })
      .expect(200);

    expect(res.body.data.user.email).toBe(credentials.email);
    expect(getRefreshCookie(res)).toBeDefined();
    expectNoSecrets(res.body);
  });

  it("returns an identical error for a wrong password and an unknown email", async () => {
    const client = createClient();
    const { credentials } = await registerUser(client);

    const wrongPassword = await client
      .post("/login", { email: credentials.email, password: "WrongPassword1" })
      .expect(401);
    const unknownEmail = await client
      .post("/login", { email: uniqueEmail(), password: "WrongPassword1" })
      .expect(401);

    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    expect(wrongPassword.body.error.code).toBe(unknownEmail.body.error.code);
  });

  it("rate-limits failed attempts per account, even across IP addresses", async () => {
    const { credentials } = await registerUser(createClient());

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await createClient()
        .post("/login", { email: credentials.email, password: "WrongPassword1" })
        .expect(401);
    }

    const blocked = await createClient()
      .post("/login", { email: credentials.email, password: VALID_PASSWORD })
      .expect(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("GET /auth/me (authentication middleware)", () => {
  it("returns the current user for a valid access token", async () => {
    const client = createClient();
    const { accessToken, credentials } = await registerUser(client);

    const res = await client.get("/me", accessToken).expect(200);
    expect(res.body.data.user.email).toBe(credentials.email);
    expectNoSecrets(res.body);
  });

  it("rejects missing, malformed and forged tokens", async () => {
    const client = createClient();
    const { res: registered } = await registerUser(client);
    const userId: string = registered.body.data.user.id;

    expect((await client.get("/me").expect(401)).body.error.code).toBe("UNAUTHORIZED");
    expect((await client.get("/me", "not.a.jwt").expect(401)).body.error.code).toBe(
      "INVALID_TOKEN",
    );

    const forged = jwt.sign({ ver: 0, typ: "access" }, "a-different-secret-that-is-long-enough!!", {
      subject: userId,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    expect((await client.get("/me", forged).expect(401)).body.error.code).toBe("INVALID_TOKEN");

    const noneAlg = jwt.sign({ ver: 0, typ: "access", sub: userId }, "", { algorithm: "none" });
    expect((await client.get("/me", noneAlg).expect(401)).body.error.code).toBe("INVALID_TOKEN");
  });

  it("rejects expired tokens with TOKEN_EXPIRED", async () => {
    const client = createClient();
    const { res: registered } = await registerUser(client);

    const expired = jwt.sign(
      { ver: 0, typ: "access", exp: Math.floor(Date.now() / 1000) - 60 },
      env.JWT_ACCESS_SECRET,
      { subject: registered.body.data.user.id, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
    );

    const res = await client.get("/me", expired).expect(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });
});

describe("POST /auth/refresh (rotation)", () => {
  it("rotates the refresh token and issues a working access token", async () => {
    const client = createClient();
    const { res: registered } = await registerUser(client);
    const firstRefresh = getRefreshCookie(registered);

    const res = await client.post("/refresh").expect(200);
    const secondRefresh = getRefreshCookie(res);

    expect(secondRefresh).toBeDefined();
    expect(secondRefresh).not.toBe(firstRefresh);
    await client.get("/me", res.body.data.accessToken).expect(200);

    const oldRecord = await RefreshToken.findOne({ tokenHash: hashToken(firstRefresh!) });
    expect(oldRecord?.revokedReason).toBe(RefreshTokenRevokeReason.ROTATED);
    expect(oldRecord?.replacedBy).not.toBeNull();
  });

  it("treats reuse after the grace period as theft and revokes the whole token family", async () => {
    const client = createClient();
    const { res: registered } = await registerUser(client);
    const stolenToken = getRefreshCookie(registered)!;

    // Legitimate client rotates.
    const rotated = await client.post("/refresh").expect(200);
    const currentToken = getRefreshCookie(rotated)!;

    // Move that rotation outside the reuse grace window.
    await RefreshToken.updateOne(
      { tokenHash: hashToken(stolenToken) },
      {
        $set: {
          revokedAt: new Date(Date.now() - (env.REFRESH_TOKEN_REUSE_GRACE_SECONDS + 5) * 1000),
        },
      },
    );

    // Attacker replays the old token.
    const replay = await postWithRefreshCookie("/refresh", stolenToken).expect(401);
    expect(replay.body.error.code).toBe("SESSION_REVOKED");

    // The legitimate client's newer token is now revoked too.
    const afterReuse = await postWithRefreshCookie("/refresh", currentToken).expect(401);
    expect(afterReuse.body.error.code).toBe("SESSION_REVOKED");
  });

  it("accepts a just-rotated token within the grace period and keeps only the newest token", async () => {
    const client = createClient();
    const { res: registered } = await registerUser(client);
    const firstToken = getRefreshCookie(registered)!;

    // A rotation whose response the client never received (e.g. page reload mid-request).
    const lost = await postWithRefreshCookie("/refresh", firstToken).expect(200);
    const lostToken = getRefreshCookie(lost)!;

    // The client retries with the token it still has — the session survives.
    const retry = await postWithRefreshCookie("/refresh", firstToken).expect(200);
    const newestToken = getRefreshCookie(retry)!;
    expect(newestToken).not.toBe(lostToken);
    await client.get("/me", retry.body.data.accessToken).expect(200);

    // The undelivered successor is retired; the newest token keeps working.
    const lostRecord = await RefreshToken.findOne({ tokenHash: hashToken(lostToken) });
    expect(lostRecord?.revokedReason).toBe(RefreshTokenRevokeReason.ROTATED);
    await postWithRefreshCookie("/refresh", newestToken).expect(200);
  });

  it("never revives a logged-out session during the grace period", async () => {
    const client = createClient();
    const { res: registered } = await registerUser(client);
    const firstToken = getRefreshCookie(registered)!;

    const rotated = await postWithRefreshCookie("/refresh", firstToken).expect(200);
    await postWithRefreshCookie("/logout", getRefreshCookie(rotated)!).expect(200);

    const replay = await postWithRefreshCookie("/refresh", firstToken).expect(401);
    expect(replay.body.error.code).toBe("SESSION_REVOKED");
  });

  it("logout revokes tokens issued during the grace period", async () => {
    const client = createClient();
    const { res: registered } = await registerUser(client);
    const firstToken = getRefreshCookie(registered)!;

    const lost = await postWithRefreshCookie("/refresh", firstToken).expect(200);
    const retry = await postWithRefreshCookie("/refresh", firstToken).expect(200);
    const newestToken = getRefreshCookie(retry)!;

    await postWithRefreshCookie("/logout", newestToken).expect(200);

    const record = await RefreshToken.findOne({ tokenHash: hashToken(newestToken) });
    expect(await RefreshToken.countDocuments({ family: record?.family, revokedAt: null })).toBe(0);
    await postWithRefreshCookie("/refresh", newestToken).expect(401);
    await postWithRefreshCookie("/refresh", getRefreshCookie(lost)!).expect(401);
  });

  it("requires the CSRF header", async () => {
    const client = createClient();
    await registerUser(client);

    const res = await client.agent
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", client.ip)
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 401 without a refresh cookie", async () => {
    const res = await createClient().post("/refresh").expect(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("rejects an expired refresh token", async () => {
    const client = createClient();
    const { res: registered } = await registerUser(client);
    const token = getRefreshCookie(registered)!;

    await RefreshToken.updateOne(
      { tokenHash: hashToken(token) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    await postWithRefreshCookie("/refresh", token).expect(401);
  });
});

describe("POST /auth/logout and /auth/logout-all", () => {
  it("revokes the refresh token and clears the cookie", async () => {
    const client = createClient();
    const { res: registered } = await registerUser(client);
    const token = getRefreshCookie(registered)!;

    const res = await client.post("/logout").expect(200);
    expect(getSetCookieHeader(res)).toMatch(/Expires=Thu, 01 Jan 1970/);

    const refresh = await postWithRefreshCookie("/refresh", token).expect(401);
    expect(refresh.body.error.code).toBe("INVALID_TOKEN");
  });

  it("succeeds even without a session (idempotent)", async () => {
    await createClient().post("/logout").expect(200);
  });

  it("logout-all invalidates access tokens and refresh tokens on every device", async () => {
    const laptop = createClient();
    const { credentials, accessToken: laptopAccess } = await registerUser(laptop);

    const phone = createClient();
    const phoneLogin = await phone
      .post("/login", { email: credentials.email, password: VALID_PASSWORD })
      .expect(200);

    await laptop.post("/logout-all", {}, laptopAccess).expect(200);

    const me = await phone.get("/me", phoneLogin.body.data.accessToken).expect(401);
    expect(me.body.error.code).toBe("SESSION_REVOKED");
    await phone.post("/refresh").expect(401);
    await laptop.post("/refresh").expect(401);
  });
});

describe("Email verification", () => {
  it("verifies the email with the emailed token; the token is single-use", async () => {
    const client = createClient();
    const { credentials, accessToken } = await registerUser(client);
    const token = extractTokenFromEmail(await waitForEmail(credentials.email, "Verify"));

    const res = await createClient().post("/verify-email", { token }).expect(200);
    expect(res.body.data.user.emailVerified).toBe(true);
    expectNoSecrets(res.body);

    const me = await client.get("/me", accessToken).expect(200);
    expect(me.body.data.user.emailVerified).toBe(true);
    expect(me.body.data.user.emailVerifiedAt).toEqual(expect.any(String));

    const reuse = await createClient().post("/verify-email", { token }).expect(400);
    expect(reuse.body.error.code).toBe("INVALID_TOKEN");
  });

  it("rejects an expired verification token", async () => {
    const client = createClient();
    const { credentials } = await registerUser(client);
    const token = extractTokenFromEmail(await waitForEmail(credentials.email, "Verify"));

    await User.updateOne(
      { email: credentials.email },
      { $set: { emailVerificationExpiresAt: new Date(Date.now() - 1000) } },
    );

    await createClient().post("/verify-email", { token }).expect(400);
  });

  it("resending issues a new link and invalidates the previous one", async () => {
    const client = createClient();
    const { credentials, accessToken } = await registerUser(client);
    const firstToken = extractTokenFromEmail(await waitForEmail(credentials.email, "Verify"));
    mailOutbox.length = 0;

    await client.post("/resend-verification", {}, accessToken).expect(200);
    const secondToken = extractTokenFromEmail(await waitForEmail(credentials.email, "Verify"));
    expect(secondToken).not.toBe(firstToken);

    await createClient().post("/verify-email", { token: firstToken }).expect(400);
    await createClient().post("/verify-email", { token: secondToken }).expect(200);

    const again = await client.post("/resend-verification", {}, accessToken).expect(409);
    expect(again.body.error.code).toBe("CONFLICT");
  });

  it("stores only a hash of the verification token", async () => {
    const client = createClient();
    const { credentials } = await registerUser(client);
    const token = extractTokenFromEmail(await waitForEmail(credentials.email, "Verify"));

    const stored = await User.findOne({ email: credentials.email }).select(
      "+emailVerificationTokenHash",
    );
    expect(stored?.emailVerificationTokenHash).toBe(hashToken(token));
    expect(stored?.emailVerificationTokenHash).not.toBe(token);
  });
});

describe("Forgot and reset password", () => {
  it("responds identically for unknown emails and sends nothing", async () => {
    const { credentials } = await registerUser(createClient());
    mailOutbox.length = 0;

    const known = await createClient()
      .post("/forgot-password", { email: credentials.email })
      .expect(200);
    const unknown = await createClient()
      .post("/forgot-password", { email: uniqueEmail() })
      .expect(200);

    expect(unknown.body).toEqual(known.body);
    await waitForEmail(credentials.email, "Reset");
    expect(mailOutbox).toHaveLength(1);
  });

  it("completes the full reset flow and revokes every existing session", async () => {
    const client = createClient();
    const { credentials, accessToken, res: registered } = await registerUser(client);
    const oldRefresh = getRefreshCookie(registered)!;

    await createClient().post("/forgot-password", { email: credentials.email }).expect(200);
    const token = extractTokenFromEmail(await waitForEmail(credentials.email, "Reset"));
    expect((await waitForEmail(credentials.email, "Reset")).text).toContain(
      "http://localhost:5173/reset-password?token=",
    );

    const newPassword = "BrandNewPassw0rd";
    await createClient().post("/reset-password", { token, password: newPassword }).expect(200);

    // Old credentials and sessions no longer work.
    await createClient()
      .post("/login", { email: credentials.email, password: VALID_PASSWORD })
      .expect(401);
    expect((await client.get("/me", accessToken).expect(401)).body.error.code).toBe(
      "SESSION_REVOKED",
    );
    await postWithRefreshCookie("/refresh", oldRefresh).expect(401);

    // New password works, token is single-use, and the user is notified.
    await createClient()
      .post("/login", { email: credentials.email, password: newPassword })
      .expect(200);
    const reuse = await createClient()
      .post("/reset-password", { token, password: "AnotherPassw0rd" })
      .expect(400);
    expect(reuse.body.error.code).toBe("INVALID_TOKEN");
    await waitForEmail(credentials.email, "password was changed");
  });

  it("rejects invalid and expired reset tokens", async () => {
    const { credentials } = await registerUser(createClient());
    await createClient().post("/forgot-password", { email: credentials.email }).expect(200);
    const token = extractTokenFromEmail(await waitForEmail(credentials.email, "Reset"));

    await createClient()
      .post("/reset-password", { token: "x".repeat(43), password: "BrandNewPassw0rd" })
      .expect(400);

    await User.updateOne(
      { email: credentials.email },
      { $set: { passwordResetExpiresAt: new Date(Date.now() - 1000) } },
    );
    await createClient()
      .post("/reset-password", { token, password: "BrandNewPassw0rd" })
      .expect(400);
  });

  it("validates the new password against the policy", async () => {
    const res = await createClient()
      .post("/reset-password", { token: "x".repeat(43), password: "weak" })
      .expect(422);
    expect(res.body.error.details[0].path).toBe("password");
  });
});

describe("POST /auth/change-password", () => {
  it("requires authentication", async () => {
    await createClient()
      .post("/change-password", { currentPassword: VALID_PASSWORD, newPassword: "NewPassw0rd1" })
      .expect(401);
  });

  it("rejects an incorrect current password with 400 (not 401)", async () => {
    const client = createClient();
    const { accessToken } = await registerUser(client);

    const res = await client
      .post(
        "/change-password",
        { currentPassword: "WrongPassword1", newPassword: "NewPassw0rd1" },
        accessToken,
      )
      .expect(400);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.error.details[0].path).toBe("currentPassword");
  });

  it("rejects reusing the current password", async () => {
    const client = createClient();
    const { accessToken } = await registerUser(client);

    await client
      .post(
        "/change-password",
        { currentPassword: VALID_PASSWORD, newPassword: VALID_PASSWORD },
        accessToken,
      )
      .expect(422);
  });

  it("changes the password, keeps this device signed in and signs out others", async () => {
    const laptop = createClient();
    const { credentials, accessToken: oldLaptopAccess } = await registerUser(laptop);

    const phone = createClient();
    const phoneLogin = await phone
      .post("/login", { email: credentials.email, password: VALID_PASSWORD })
      .expect(200);

    const newPassword = "ChangedPassw0rd";
    const res = await laptop
      .post("/change-password", { currentPassword: VALID_PASSWORD, newPassword }, oldLaptopAccess)
      .expect(200);
    expectNoSecrets(res.body);

    // This device got a fresh session.
    await laptop.get("/me", res.body.data.accessToken).expect(200);
    await laptop.post("/refresh").expect(200);

    // Old tokens and other devices are revoked.
    await laptop.get("/me", oldLaptopAccess).expect(401);
    await phone.get("/me", phoneLogin.body.data.accessToken).expect(401);
    await phone.post("/refresh").expect(401);

    await createClient()
      .post("/login", { email: credentials.email, password: VALID_PASSWORD })
      .expect(401);
    await createClient()
      .post("/login", { email: credentials.email, password: newPassword })
      .expect(200);
  });
});
