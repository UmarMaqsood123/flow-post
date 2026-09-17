import request from "supertest";
import { type MailMessage, mailOutbox } from "../../src/utils/mailer.util";
import {
  app,
  createClient,
  extractTokenFromEmail,
  registerUser,
  type TestClient,
  waitForEmail,
} from "./client";

export const API = "/api/v1";

export interface TestUser {
  id: string;
  name: string;
  email: string;
  token: string;
  client: TestClient;
}

export const createUser = async (name: string, { verified = true } = {}): Promise<TestUser> => {
  const client = createClient();
  const { credentials, accessToken, res } = await registerUser(client, { name });
  if (verified) {
    const token = extractTokenFromEmail(await waitForEmail(credentials.email, "Verify"));
    await client.post("/verify-email", { token }).expect(200);
  }
  return { id: res.body.data.user.id, name, email: credentials.email, token: accessToken, client };
};

type Method = "get" | "post" | "put" | "patch" | "delete";

/** Authenticated request as `user` (from that user's own IP). */
export const call = (user: TestUser, method: Method, path: string, body?: object) => {
  const test = request(app)
    [method](`${API}${path}`)
    .set("X-Forwarded-For", user.client.ip)
    .set("Authorization", `Bearer ${user.token}`);
  return body ? test.send(body) : test;
};

export const createWorkspace = async (owner: TestUser, overrides: object = {}) => {
  const res = await call(owner, "post", "/workspaces", {
    name: `${owner.name}'s workspace`,
    timezone: "UTC",
    ...overrides,
  }).expect(201);
  return res.body.data.workspace as { id: string; name: string };
};

/** Most recent email to `to` whose subject contains `subjectIncludes`. */
export const latestEmail = async (to: string, subjectIncludes: string): Promise<MailMessage> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const matches = mailOutbox.filter((m) => m.to === to && m.subject.includes(subjectIncludes));
    const message = matches.at(-1);
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No email to ${to} with subject containing "${subjectIncludes}"`);
};

export const inviteAndGetToken = async (
  inviter: TestUser,
  workspaceId: string,
  email: string,
  role: "ADMIN" | "EDITOR" | "VIEWER",
) => {
  const res = await call(inviter, "post", `/workspaces/${workspaceId}/invitations`, {
    email,
    role,
  }).expect(201);
  const token = extractTokenFromEmail(await latestEmail(email, "invited you"));
  return { token, invitationId: res.body.data.invitation.id as string };
};

/** Invites `member` and accepts; returns the new membership id. */
export const addMember = async (
  owner: TestUser,
  workspaceId: string,
  member: TestUser,
  role: "ADMIN" | "EDITOR" | "VIEWER",
): Promise<string> => {
  const { token } = await inviteAndGetToken(owner, workspaceId, member.email, role);
  await call(member, "post", "/workspaces/invitations/accept", { token }).expect(200);
  return getMemberId(owner, workspaceId, member);
};

export const getMemberId = async (viewer: TestUser, workspaceId: string, member: TestUser) => {
  const res = await call(viewer, "get", `/workspaces/${workspaceId}/members`).expect(200);
  const found = (res.body.data.members as { id: string; user: { id: string } }[]).find(
    (m) => m.user.id === member.id,
  );
  if (!found) throw new Error(`${member.name} is not a member of ${workspaceId}`);
  return found.id;
};
