import request from "supertest";
import { createApp } from "../../src/app";
import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  REFRESH_TOKEN_COOKIE,
} from "../../src/constants/auth.constant";
import { type MailMessage, mailOutbox } from "../../src/utils/mailer.util";

export const app = createApp();
export const AUTH = "/api/v1/auth";
export const VALID_PASSWORD = "CorrectHorse9Battery";

let clientCounter = 0;
let emailCounter = 0;

export const uniqueEmail = () => `user${++emailCounter}.${Date.now()}@example.com`;

/**
 * A cookie-persisting client with its own IP address, so per-IP rate limits
 * don't leak between tests. Sends the CSRF header by default.
 */
export const createClient = () => {
  clientCounter += 1;
  const ip = `10.${(clientCounter >> 16) & 255}.${(clientCounter >> 8) & 255}.${clientCounter & 255}`;
  const agent = request.agent(app);

  const withDefaults = <T extends request.Test>(test: T, token?: string): T => {
    test.set("X-Forwarded-For", ip).set(CSRF_HEADER, CSRF_HEADER_VALUE);
    if (token) test.set("Authorization", `Bearer ${token}`);
    return test;
  };

  return {
    ip,
    agent,
    post: (path: string, body: object = {}, token?: string) =>
      withDefaults(agent.post(`${AUTH}${path}`), token).send(body),
    get: (path: string, token?: string) => withDefaults(agent.get(`${AUTH}${path}`), token),
  };
};

export type TestClient = ReturnType<typeof createClient>;

export const registerUser = async (
  client: TestClient,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
) => {
  const credentials = {
    name: "Ada Lovelace",
    email: uniqueEmail(),
    password: VALID_PASSWORD,
    ...overrides,
  };
  const res = await client.post("/register", credentials).expect(201);
  return { credentials, res, accessToken: res.body.data.accessToken as string };
};

/** Returns the raw refresh-token value from a response's Set-Cookie header. */
export const getRefreshCookie = (res: request.Response): string | undefined => {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith(`${REFRESH_TOKEN_COOKIE}=`));
  const value = cookie?.split(";")[0]?.slice(REFRESH_TOKEN_COOKIE.length + 1);
  return value || undefined;
};

export const getSetCookieHeader = (res: request.Response): string => {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  return header?.find((value) => value.startsWith(`${REFRESH_TOKEN_COOKIE}=`)) ?? "";
};

/** Emails are dispatched without blocking the response, so poll briefly. */
export const waitForEmail = async (to: string, subjectIncludes: string): Promise<MailMessage> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const message = mailOutbox.find((m) => m.to === to && m.subject.includes(subjectIncludes));
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No email to ${to} with subject containing "${subjectIncludes}"`);
};

export const extractTokenFromEmail = (message: MailMessage): string => {
  const match = message.text.match(/[?&]token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error("No token link found in email");
  return match[1];
};

/** Posts with a specific refresh-token cookie, bypassing the agent's cookie jar. */
export const postWithRefreshCookie = (path: string, refreshToken: string, ip = "10.250.0.1") =>
  request(app)
    .post(`${AUTH}${path}`)
    .set("X-Forwarded-For", ip)
    .set(CSRF_HEADER, CSRF_HEADER_VALUE)
    .set("Cookie", `${REFRESH_TOKEN_COOKIE}=${refreshToken}`);
