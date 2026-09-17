import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SocialProviderError } from "../src/integrations/social/errors";
import { createDefaultSocialProviders } from "../src/integrations/social/providers";
import {
  setSocialProviderRegistry,
  SocialProviderRegistry,
} from "../src/integrations/social/registry";
import { SocialAccount } from "../src/models/socialAccount.model";
import { SocialConnectionDraft } from "../src/models/socialConnectionDraft.model";
import { SocialOAuthState } from "../src/models/socialOAuthState.model";
import { User } from "../src/models/user.model";
import { Workspace } from "../src/models/workspace.model";
import { WorkspaceMember } from "../src/models/workspaceMember.model";
import * as SocialAccountService from "../src/services/socialAccount.service";
import { getTokenSecretBox } from "../src/utils/encryption.util";
import { hashToken } from "../src/utils/token.util";
import type { WorkspaceContext } from "../src/utils/workspaceContext.util";
import { app } from "./helpers/client";
import { useTestDatabase } from "./helpers/database";
import { MockSocialProvider, type MockSocialProviderOptions } from "./helpers/mockSocialProvider";
import {
  addMember,
  API,
  call,
  createUser,
  createWorkspace,
  type TestUser,
} from "./helpers/workspace";

useTestDatabase();

let provider: MockSocialProvider;
let restoreRegistry: (() => void) | undefined;

/** Registers a mock as LinkedIn next to the real (not yet available) providers. */
const useMockProvider = (options: MockSocialProviderOptions = {}) => {
  restoreRegistry?.();
  provider = new MockSocialProvider({ platform: "LINKEDIN", ...options });
  restoreRegistry = setSocialProviderRegistry(
    new SocialProviderRegistry([
      provider,
      ...createDefaultSocialProviders().filter((item) => item.platform !== "LINKEDIN"),
    ]),
  );
};

beforeEach(() => useMockProvider());
afterEach(() => {
  restoreRegistry?.();
  restoreRegistry = undefined;
});

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5a60000000049454e44ae426082",
  "hex",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const CALLBACK_URL = "http://localhost:5173/api/v1/social-accounts/linkedin/callback";
const COOKIE_NAME = "flowpost_oauth_linkedin";

interface PublicAccount {
  id: string;
  providerAccountId: string;
  status: string;
  accountName: string;
  profileImage: string | null;
  capabilities: string[];
  lastCheckedAt: string | null;
  lastError: { code: string; message: string } | null;
}

const accountsPath = (workspaceId: string) => `/workspaces/${workspaceId}/social-accounts`;

const startConnection = (user: TestUser, workspaceId: string, platform = "linkedin") =>
  call(user, "get", `/social-accounts/${platform}/connect?workspaceId=${workspaceId}`);

const setCookies = (res: request.Response) =>
  (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];

/** "name=value" from the connect response, ready for a Cookie header. */
const bindingCookie = (res: request.Response) =>
  setCookies(res)
    .find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`))
    ?.split(";")[0] ?? "";

/** The browser arriving back from the platform (no Authorization header). */
const sendCallback = (user: TestUser, query: Record<string, string>, cookie?: string) => {
  const test = request(app)
    .get(`${API}/social-accounts/linkedin/callback?${new URLSearchParams(query).toString()}`)
    .set("X-Forwarded-For", user.client.ip);
  return cookie ? test.set("Cookie", cookie) : test;
};

/** Asserts the redirect to the frontend page and returns its query parameters. */
const redirectResult = (res: request.Response) => {
  expect(res.status).toBe(303);
  const location = new URL(res.headers.location ?? "");
  expect(`${location.origin}${location.pathname}`).toBe("http://localhost:5173/social-accounts");
  return Object.fromEntries(location.searchParams);
};

const listAccounts = async (user: TestUser, workspaceId: string) => {
  const res = await call(user, "get", accountsPath(workspaceId)).expect(200);
  return res.body.data.accounts as PublicAccount[];
};

const connectAccount = async (user: TestUser, workspaceId: string): Promise<PublicAccount> => {
  const start = await startConnection(user, workspaceId).expect(200);
  const approval = provider.approve(start.body.data.authorizationUrl);
  const res = await sendCallback(user, approval, bindingCookie(start));
  expect(redirectResult(res)).toEqual({ platform: "linkedin", connected: "1", workspaceId });
  const account = (await listAccounts(user, workspaceId)).find(
    (item) => item.providerAccountId === provider.currentProfileId,
  );
  if (!account) throw new Error("Connected account not listed");
  return account;
};

const loadStored = (accountId: string) =>
  SocialAccount.findById(accountId)
    .setOptions({ skipWorkspaceScope: true })
    .select("+encryptedAccessToken +encryptedRefreshToken");

const contextFor = async (user: TestUser, workspaceId: string): Promise<WorkspaceContext> => {
  const [userDoc, workspace, member] = await Promise.all([
    User.findById(user.id),
    Workspace.findById(workspaceId),
    WorkspaceMember.findOne({ workspace: workspaceId, user: user.id }),
  ]);
  if (!userDoc || !workspace || !member) throw new Error("Test context not found");
  return { user: userDoc, workspace, member };
};

/** Makes the stored token expire within the refresh window. */
const expireSoon = (accountId: string, workspaceId: string) =>
  SocialAccount.updateOne(
    { _id: accountId, workspace: workspaceId },
    { $set: { tokenExpiresAt: new Date(Date.now() + 60_000) } },
  );

const uploadFile = async (
  user: TestUser,
  workspaceId: string,
  buffer: Buffer,
  filename: string,
) => {
  const res = await request(app)
    .post(`${API}/workspaces/${workspaceId}/files`)
    .set("X-Forwarded-For", user.client.ip)
    .set("Authorization", `Bearer ${user.token}`)
    .attach("file", buffer, { filename, contentType: "application/octet-stream" })
    .expect(201);
  return res.body.data.file as { id: string };
};

const setup = async () => {
  const owner = await createUser("Olivia");
  const workspace = await createWorkspace(owner);
  return { owner, workspace };
};

describe("Social platforms", () => {
  it("lists every platform with its capabilities and availability", async () => {
    const { owner, workspace } = await setup();
    const viewer = await createUser("Vic");
    await addMember(owner, workspace.id, viewer, "VIEWER");

    const res = await call(viewer, "get", `${accountsPath(workspace.id)}/platforms`).expect(200);
    const platforms = res.body.data.platforms as {
      platform: string;
      available: boolean;
      capabilities: string[];
    }[];

    expect(platforms.map((item) => item.platform)).toEqual([
      "LINKEDIN",
      "FACEBOOK",
      "INSTAGRAM",
      "TIKTOK",
      "YOUTUBE",
    ]);
    expect(platforms.find((item) => item.platform === "LINKEDIN")).toMatchObject({
      available: true,
      capabilities: expect.arrayContaining(["TEXT_POST"]),
    });
    const instagram = platforms.find((item) => item.platform === "INSTAGRAM");
    expect(instagram?.available).toBe(false);
    expect(instagram?.capabilities).not.toContain("TEXT_POST");
  });

  it("refuses platforms that aren't available or supported", async () => {
    const { owner, workspace } = await setup();

    const unavailable = await startConnection(owner, workspace.id, "facebook").expect(503);
    expect(unavailable.body.error.code).toBe("SOCIAL_PROVIDER_UNAVAILABLE");
    await startConnection(owner, workspace.id, "myspace").expect(422);
    await call(owner, "get", "/social-accounts/linkedin/connect").expect(422);

    expect(await SocialOAuthState.countDocuments({ workspace: workspace.id })).toBe(0);
  });
});

describe("Connecting accounts", () => {
  it("connects through OAuth and never exposes tokens", async () => {
    const { owner, workspace } = await setup();

    const start = await startConnection(owner, workspace.id).expect(200);
    const authorizationUrl = new URL(start.body.data.authorizationUrl);
    expect(authorizationUrl.host).toBe("auth.mock-social.test");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(CALLBACK_URL);
    const state = authorizationUrl.searchParams.get("state") ?? "";
    expect(state.length).toBeGreaterThanOrEqual(32);

    // The attempt is bound to this browser by an httpOnly cookie on the social-accounts path.
    const cookieHeader = setCookies(start).find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
    expect(cookieHeader).toMatch(/HttpOnly/);
    expect(cookieHeader).toMatch(/SameSite=Lax/);
    expect(cookieHeader).toMatch(/Path=\/api\/v1\/social-accounts/);
    const cookie = bindingCookie(start);
    const cookieValue = cookie.slice(COOKIE_NAME.length + 1);

    // Only hashes of the state and the cookie value are stored.
    const pending = await SocialOAuthState.findOne({ workspace: workspace.id }).select(
      "+bindingHash",
    );
    expect(pending?.stateHash).toBe(hashToken(state));
    expect(pending?.bindingHash).toBe(hashToken(cookieValue));
    expect(JSON.stringify(pending)).not.toContain(state);

    const { code } = provider.approve(authorizationUrl.toString());
    const res = await sendCallback(owner, { code, state }, cookie);
    expect(redirectResult(res)).toEqual({
      platform: "linkedin",
      connected: "1",
      workspaceId: workspace.id,
    });
    expect(setCookies(res).find((item) => item.startsWith(`${COOKIE_NAME}=;`))).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );

    const accessToken = provider.lastAccessToken;
    const refreshToken = accessToken.replace("mock-access-", "mock-refresh-");
    const list = await call(owner, "get", accountsPath(workspace.id)).expect(200);
    const [account] = list.body.data.accounts as (PublicAccount & Record<string, unknown>)[];
    expect(account).toMatchObject({
      platform: "LINKEDIN",
      providerAccountId: "mock-account-1",
      accountName: "Mock Company",
      profileImage: "https://cdn.mock-social.test/avatar.png",
      status: "CONNECTED",
      scopes: ["mock.read", "mock.publish"],
      lastError: null,
      lastCheckedAt: expect.any(String),
    });
    expect(
      Object.keys(account ?? {}).filter((key) =>
        /encrypted|accesstoken|refreshtoken|metadata/i.test(key),
      ),
    ).toEqual([]);
    expect(list.text).not.toContain(accessToken);
    expect(res.headers.location).not.toContain(accessToken);

    // Stored encrypted and bound to this account.
    const stored = await loadStored(account?.id ?? "");
    const encryptedAccessToken = stored?.encryptedAccessToken ?? "";
    expect(encryptedAccessToken).toMatch(/^v1\./);
    expect(encryptedAccessToken).not.toContain(accessToken);
    expect(stored?.encryptedRefreshToken).not.toContain(refreshToken);
    expect(
      getTokenSecretBox()?.decrypt(
        encryptedAccessToken,
        `social-account:${workspace.id}:LINKEDIN:mock-account-1:access`,
      ),
    ).toBe(accessToken);
    expect(JSON.stringify(stored)).not.toContain(encryptedAccessToken);
    const plain = await SocialAccount.findOne({ workspace: workspace.id });
    expect(plain?.encryptedAccessToken).toBeUndefined();

    expect(await SocialOAuthState.countDocuments({ workspace: workspace.id })).toBe(0);
  });

  it("only completes in the browser that started the connection", async () => {
    const { owner, workspace } = await setup();

    // No cookie (e.g. a consent link sent to someone else): rejected, and the state is burned.
    const first = await startConnection(owner, workspace.id).expect(200);
    const firstApproval = provider.approve(first.body.data.authorizationUrl);
    expect(redirectResult(await sendCallback(owner, firstApproval))).toMatchObject({
      error: "expired",
    });
    expect(
      redirectResult(await sendCallback(owner, firstApproval, bindingCookie(first))),
    ).toMatchObject({
      error: "expired",
    });

    // A cookie from a different attempt doesn't match either.
    const second = await startConnection(owner, workspace.id).expect(200);
    const third = await startConnection(owner, workspace.id).expect(200);
    const secondApproval = provider.approve(second.body.data.authorizationUrl);
    expect(
      redirectResult(await sendCallback(owner, secondApproval, bindingCookie(third))),
    ).toMatchObject({
      error: "expired",
    });

    expect(await SocialAccount.countDocuments({ workspace: workspace.id })).toBe(0);
    expect(provider.countCalls("handleOAuthCallback")).toBe(0);
  });

  it("rejects unknown, reused and expired states", async () => {
    const { owner, workspace } = await setup();
    const start = await startConnection(owner, workspace.id).expect(200);
    const cookie = bindingCookie(start);
    const approval = provider.approve(start.body.data.authorizationUrl);

    expect(
      redirectResult(await sendCallback(owner, { ...approval, state: "x".repeat(43) }, cookie)),
    ).toMatchObject({ error: "expired" });
    await sendCallback(owner, approval, cookie).expect(303);
    expect(redirectResult(await sendCallback(owner, approval, cookie))).toMatchObject({
      error: "expired",
    });

    const late = await startConnection(owner, workspace.id).expect(200);
    const lateApproval = provider.approve(late.body.data.authorizationUrl);
    await SocialOAuthState.updateMany(
      { workspace: workspace.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect(
      redirectResult(await sendCallback(owner, lateApproval, bindingCookie(late))),
    ).toMatchObject({
      error: "expired",
    });
  });

  it("rechecks permissions when the browser comes back", async () => {
    const { owner, workspace } = await setup();
    const admin = await createUser("Adam");
    const memberId = await addMember(owner, workspace.id, admin, "ADMIN");

    const start = await startConnection(admin, workspace.id).expect(200);
    await call(owner, "patch", `/workspaces/${workspace.id}/members/${memberId}`, {
      role: "EDITOR",
    }).expect(200);

    const approval = provider.approve(start.body.data.authorizationUrl);
    expect(redirectResult(await sendCallback(admin, approval, bindingCookie(start)))).toMatchObject(
      {
        error: "forbidden",
      },
    );
    expect(await SocialAccount.countDocuments({ workspace: workspace.id })).toBe(0);
  });

  it("handles the user cancelling on the platform", async () => {
    const { owner, workspace } = await setup();
    const start = await startConnection(owner, workspace.id).expect(200);
    const cookie = bindingCookie(start);
    const approval = provider.approve(start.body.data.authorizationUrl);

    const res = await sendCallback(
      owner,
      {
        error: "user_cancelled_authorize",
        error_description: "The user refused to authorize",
        state: approval.state,
      },
      cookie,
    );
    expect(redirectResult(res)).toEqual({ platform: "linkedin", error: "cancelled" });
    expect(redirectResult(await sendCallback(owner, approval, cookie))).toMatchObject({
      error: "expired",
    });
  });

  it("stores the PKCE verifier encrypted and verifies it on callback", async () => {
    useMockProvider({ usesPkce: true });
    const { owner, workspace } = await setup();

    const start = await startConnection(owner, workspace.id).expect(200);
    const pending = await SocialOAuthState.findOne({ workspace: workspace.id }).select(
      "+encryptedCodeVerifier",
    );
    expect(pending?.encryptedCodeVerifier).toMatch(/^v1\./);
    expect(pending?.encryptedCodeVerifier).not.toContain("mock-verifier-");

    const approval = provider.approve(start.body.data.authorizationUrl);
    expect(redirectResult(await sendCallback(owner, approval, bindingCookie(start)))).toMatchObject(
      {
        connected: "1",
      },
    );
  });

  it("updates the same record when an account is reconnected", async () => {
    const { owner, workspace } = await setup();

    const first = await connectAccount(owner, workspace.id);
    const firstStored = await loadStored(first.id);
    const second = await connectAccount(owner, workspace.id);
    const secondStored = await loadStored(second.id);

    expect(second.id).toBe(first.id);
    expect(await SocialAccount.countDocuments({ workspace: workspace.id })).toBe(1);
    expect(secondStored?.encryptedAccessToken).not.toBe(firstStored?.encryptedAccessToken);

    provider.setProfile({ providerAccountId: "mock-account-2", accountName: "Second Page" });
    const other = await connectAccount(owner, workspace.id);
    expect(other.id).not.toBe(first.id);
    expect(await listAccounts(owner, workspace.id)).toHaveLength(2);
  });

  it("reports platform failures during the OAuth exchange", async () => {
    const { owner, workspace } = await setup();

    for (const [kind, reason] of [
      ["PROVIDER_ERROR", "failed"],
      ["PERMISSION_DENIED", "permission"],
    ] as const) {
      const start = await startConnection(owner, workspace.id).expect(200);
      const approval = provider.approve(start.body.data.authorizationUrl);
      provider.failNext("handleOAuthCallback", provider.error(kind));
      const res = await sendCallback(owner, approval, bindingCookie(start));
      expect(redirectResult(res)).toEqual({ platform: "linkedin", error: reason });
    }
    expect(await SocialAccount.countDocuments({ workspace: workspace.id })).toBe(0);
  });
});

describe("Social account permissions and isolation", () => {
  it("lets members view accounts but limits who can connect, test and disconnect", async () => {
    const { owner, workspace } = await setup();
    const editor = await createUser("Eve");
    const viewer = await createUser("Vic");
    await addMember(owner, workspace.id, editor, "EDITOR");
    await addMember(owner, workspace.id, viewer, "VIEWER");
    const account = await connectAccount(owner, workspace.id);

    expect(await listAccounts(viewer, workspace.id)).toHaveLength(1);

    await startConnection(editor, workspace.id).expect(403);
    await call(viewer, "post", `/social-accounts/${account.id}/test`).expect(403);
    await call(viewer, "post", `/social-accounts/${account.id}/posts`, { text: "Hi" }).expect(403);
    // Direct publishing skips approval, so editors can't use it.
    await call(editor, "post", `/social-accounts/${account.id}/posts`, { text: "Hi" }).expect(403);
    await call(editor, "delete", `/social-accounts/${account.id}`).expect(403);

    await call(editor, "post", `/social-accounts/${account.id}/test`).expect(200);
  });

  it("keeps accounts isolated between workspaces", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const aliceWorkspace = await createWorkspace(alice);
    const bobWorkspace = await createWorkspace(bob);
    const account = await connectAccount(alice, aliceWorkspace.id);

    await call(bob, "get", accountsPath(aliceWorkspace.id)).expect(404);
    await startConnection(bob, aliceWorkspace.id).expect(404);
    await call(bob, "delete", `/social-accounts/${account.id}`).expect(404);
    await call(bob, "post", `/social-accounts/${account.id}/test`).expect(404);
    await call(bob, "post", `/social-accounts/${account.id}/posts`, { text: "Not mine" }).expect(
      404,
    );
    await call(bob, "delete", `/social-accounts/${"a".repeat(24)}`).expect(404);

    const bobContext = await contextFor(bob, bobWorkspace.id);
    await expect(
      SocialAccountService.publishText(bobContext, account.id, { text: "Not mine" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(provider.countCalls("publishText")).toBe(0);
    expect(provider.countCalls("getProfile")).toBe(0);
  });

  it("deletes stored tokens on disconnect and restores the record on reconnect", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);

    await call(owner, "delete", `/social-accounts/${account.id}`).expect(200);
    expect(await listAccounts(owner, workspace.id)).toHaveLength(0);

    const stored = await loadStored(account.id);
    expect(stored).toMatchObject({
      status: "DISCONNECTED",
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
    });
    expect(stored?.disconnectedAt).toBeInstanceOf(Date);
    await call(owner, "delete", `/social-accounts/${account.id}`).expect(404);

    const context = await contextFor(owner, workspace.id);
    await expect(
      SocialAccountService.publishText(context, account.id, { text: "Hello" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SOCIAL_ACCOUNT_DISCONNECTED" });

    const reconnected = await connectAccount(owner, workspace.id);
    expect(reconnected).toMatchObject({ id: account.id, status: "CONNECTED" });
  });

  it("removes accounts and pending connections when the workspace is deleted", async () => {
    const { owner, workspace } = await setup();
    await connectAccount(owner, workspace.id);
    await startConnection(owner, workspace.id).expect(200);

    await call(owner, "delete", `/workspaces/${workspace.id}`).expect(200);
    await call(owner, "delete", `/workspaces/${workspace.id}/permanent`, {
      confirmName: workspace.name,
    }).expect(200);

    expect(await SocialAccount.countDocuments({ workspace: workspace.id })).toBe(0);
    expect(await SocialOAuthState.countDocuments({ workspace: workspace.id })).toBe(0);
  });
});

describe("Connection test", () => {
  it("checks the connection and refreshes the profile without publishing", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);

    provider.setProfile({
      accountName: "Renamed Co",
      profileImage: "javascript:alert(1)",
      metadata: { accessToken: "leaked", followers: 10 },
    });
    const res = await call(owner, "post", `/social-accounts/${account.id}/test`).expect(200);

    expect(res.body.data).toMatchObject({
      checkedAt: expect.any(String),
      account: { accountName: "Renamed Co", profileImage: null, status: "CONNECTED" },
    });
    expect(res.text).not.toContain("leaked");
    expect((await loadStored(account.id))?.metadata).toEqual({ followers: 10 });
    expect(provider.countCalls("publishText")).toBe(0);
  });

  it("reports revoked access, then recovers after a successful refresh", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);

    provider.revokeAccessTokens();
    const failed = await call(owner, "post", `/social-accounts/${account.id}/test`).expect(409);
    expect(failed.body.error.code).toBe("SOCIAL_REAUTH_REQUIRED");
    expect((await listAccounts(owner, workspace.id))[0]).toMatchObject({ status: "EXPIRED" });

    // Expired accounts refresh before the next call.
    await call(owner, "post", `/social-accounts/${account.id}/test`).expect(200);
    expect((await listAccounts(owner, workspace.id))[0]).toMatchObject({
      status: "CONNECTED",
      lastError: null,
    });
  });
});

describe("Publishing", () => {
  it("publishes a text post", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);

    const res = await call(owner, "post", `/social-accounts/${account.id}/posts`, {
      text: "  Hello from FlowPost  ",
    }).expect(201);
    expect(res.body.data.post).toMatchObject({
      providerPostId: expect.stringMatching(/^mock-post-/),
      url: expect.any(String),
    });
    expect(provider.publishedInputs.at(-1)).toEqual({ text: "Hello from FlowPost" });

    await call(owner, "post", `/social-accounts/${account.id}/posts`, { text: "" }).expect(422);
  });

  it("publishes an image post from the media library", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);
    const image = await uploadFile(owner, workspace.id, PNG, "launch.png");

    await call(owner, "post", `/social-accounts/${account.id}/posts`, {
      text: "Launch day",
      fileId: image.id,
    }).expect(201);

    const input = provider.publishedInputs.at(-1) as {
      text: string;
      images: { mimeType: string; read: () => Promise<Buffer> }[];
    };
    expect(input.text).toBe("Launch day");
    expect(input.images).toHaveLength(1);
    expect(input.images[0]?.mimeType).toBe("image/png");
    expect((await input.images[0]?.read())?.equals(PNG)).toBe(true);

    const document = await uploadFile(owner, workspace.id, PDF, "brief.pdf");
    const notImage = await call(owner, "post", `/social-accounts/${account.id}/posts`, {
      text: "Brief",
      fileId: document.id,
    }).expect(400);
    expect(notImage.body.error.code).toBe("SOCIAL_INVALID_REQUEST");

    const otherWorkspace = await createWorkspace(owner, { name: "Other brand" });
    const foreign = await uploadFile(owner, otherWorkspace.id, PNG, "other.png");
    await call(owner, "post", `/social-accounts/${account.id}/posts`, {
      text: "Wrong workspace",
      fileId: foreign.id,
    }).expect(404);
  });

  it("refuses content the platform can't publish before calling it", async () => {
    useMockProvider({ capabilities: ["TEXT_POST"] });
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);
    const image = await uploadFile(owner, workspace.id, PNG, "launch.png");

    const res = await call(owner, "post", `/social-accounts/${account.id}/posts`, {
      text: "Launch",
      fileId: image.id,
    }).expect(422);
    expect(res.body.error.code).toBe("SOCIAL_CAPABILITY_UNSUPPORTED");
    expect(provider.countCalls("publishImage")).toBe(0);
  });
});

describe("Token lifecycle", () => {
  it("refreshes an expiring token before using it", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);
    const context = await contextFor(owner, workspace.id);
    const before = await loadStored(account.id);
    await expireSoon(account.id, workspace.id);

    await SocialAccountService.publishText(context, account.id, { text: "After refresh" });
    expect(provider.countCalls("refreshAccessToken")).toBe(1);

    const after = await loadStored(account.id);
    expect(after?.status).toBe("CONNECTED");
    expect(after?.lastRefreshedAt).toBeInstanceOf(Date);
    expect(after?.encryptedAccessToken).not.toBe(before?.encryptedAccessToken);
    expect(after?.tokenExpiresAt?.getTime()).toBeGreaterThan(Date.now() + 30 * 60_000);

    await SocialAccountService.publishText(context, account.id, { text: "No refresh needed" });
    expect(provider.countCalls("refreshAccessToken")).toBe(1);
  });

  it("asks for reconnection when the refresh is rejected", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);
    const context = await contextFor(owner, workspace.id);
    await expireSoon(account.id, workspace.id);

    provider.failNext(
      "refreshAccessToken",
      provider.error("REAUTH_REQUIRED", "Access was revoked"),
    );
    await expect(
      SocialAccountService.publishText(context, account.id, { text: "Hello" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SOCIAL_REAUTH_REQUIRED" });
    expect((await listAccounts(owner, workspace.id))[0]).toMatchObject({
      status: "REAUTH_REQUIRED",
      lastError: { code: "REAUTH_REQUIRED", message: "Access was revoked" },
    });

    // No further platform calls until the user reconnects.
    const callCount = provider.calls.length;
    await call(owner, "post", `/social-accounts/${account.id}/test`).expect(409);
    expect(provider.calls.length).toBe(callCount);

    const reconnected = await connectAccount(owner, workspace.id);
    expect(reconnected).toMatchObject({ status: "CONNECTED", lastError: null });
  });

  it("marks the account expired when there is no usable refresh token", async () => {
    useMockProvider({ capabilities: ["TEXT_POST"] });
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);
    const context = await contextFor(owner, workspace.id);
    await expireSoon(account.id, workspace.id);

    await expect(
      SocialAccountService.publishText(context, account.id, { text: "Hello" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SOCIAL_REAUTH_REQUIRED" });
    expect(await loadStored(account.id)).toMatchObject({ status: "EXPIRED" });
    expect(provider.countCalls("refreshAccessToken")).toBe(0);
  });

  it("doesn't use a refresh token past its own expiry", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);
    const context = await contextFor(owner, workspace.id);
    await SocialAccount.updateOne(
      { _id: account.id, workspace: workspace.id },
      {
        $set: {
          tokenExpiresAt: new Date(Date.now() + 60_000),
          refreshTokenExpiresAt: new Date(Date.now() - 1000),
        },
      },
    );

    await expect(
      SocialAccountService.publishText(context, account.id, { text: "Hello" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await loadStored(account.id)).toMatchObject({ status: "EXPIRED" });
    expect(provider.countCalls("refreshAccessToken")).toBe(0);
  });

  it("records transient platform errors without changing the status", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);
    const context = await contextFor(owner, workspace.id);

    provider.failNext("publishText", provider.error("PROVIDER_ERROR", "Mock outage"));
    await expect(
      SocialAccountService.publishText(context, account.id, { text: "Hello" }),
    ).rejects.toMatchObject({ statusCode: 502, code: "SOCIAL_PROVIDER_ERROR" });
    expect(await loadStored(account.id)).toMatchObject({
      status: "CONNECTED",
      lastError: { code: "PROVIDER_ERROR", message: "Mock outage" },
    });

    provider.failNext(
      "publishText",
      new SocialProviderError("RATE_LIMITED", "Slow down", {
        platform: "LINKEDIN",
        retryAfterSeconds: 30,
      }),
    );
    await expect(
      SocialAccountService.publishText(context, account.id, { text: "Hello" }),
    ).rejects.toMatchObject({ statusCode: 429, details: { retryAfterSeconds: 30 } });
  });

  it("asks for reconnection when a permission was removed", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);

    provider.failNext("publishText", provider.error("PERMISSION_DENIED", "Posting not allowed"));
    const res = await call(owner, "post", `/social-accounts/${account.id}/posts`, {
      text: "Hello",
    }).expect(403);
    expect(res.body.error.code).toBe("SOCIAL_PERMISSION_DENIED");
    expect(await loadStored(account.id)).toMatchObject({ status: "REAUTH_REQUIRED" });
  });

  it("blocks accounts the platform reports as restricted", async () => {
    const { owner, workspace } = await setup();
    const account = await connectAccount(owner, workspace.id);
    const context = await contextFor(owner, workspace.id);

    provider.failNext("publishText", provider.error("ACCOUNT_RESTRICTED", "Account is restricted"));
    await expect(
      SocialAccountService.publishText(context, account.id, { text: "Hello" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SOCIAL_ACCOUNT_ERROR" });
    expect(await loadStored(account.id)).toMatchObject({ status: "ERROR" });

    const callCount = provider.calls.length;
    await expect(
      SocialAccountService.publishText(context, account.id, { text: "Hello" }),
    ).rejects.toMatchObject({ code: "SOCIAL_ACCOUNT_ERROR" });
    expect(provider.calls.length).toBe(callCount);
  });

  it("refuses credentials copied from another account", async () => {
    const { owner, workspace } = await setup();
    const first = await connectAccount(owner, workspace.id);
    provider.setProfile({ providerAccountId: "mock-account-2" });
    const second = await connectAccount(owner, workspace.id);
    const context = await contextFor(owner, workspace.id);

    const secondStored = await loadStored(second.id);
    await SocialAccount.updateOne(
      { _id: first.id, workspace: workspace.id },
      { $set: { encryptedAccessToken: secondStored?.encryptedAccessToken } },
    );

    await expect(
      SocialAccountService.publishText(context, first.id, { text: "Hello" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SOCIAL_REAUTH_REQUIRED" });
    expect(await loadStored(first.id)).toMatchObject({
      status: "REAUTH_REQUIRED",
      lastError: { code: "TOKEN_DECRYPTION_FAILED" },
    });
    expect(provider.countCalls("publishText")).toBe(0);
  });
});

describe("Choosing which account to connect", () => {
  const TARGETS = [
    { id: "page-1", name: "Acme Coffee", username: "acmecoffee", image: null, description: "Cafe" },
    { id: "page-2", name: "Acme Roastery", username: null, image: null, description: null },
  ];

  /** Runs OAuth to the point where the user has to choose a Page. */
  const startChoice = async (user: TestUser, workspaceId: string) => {
    provider.offerTargets(TARGETS);
    const start = await startConnection(user, workspaceId).expect(200);
    const approval = provider.approve(start.body.data.authorizationUrl);
    const res = await sendCallback(user, approval, bindingCookie(start));
    return redirectResult(res);
  };

  it("asks which account to connect instead of guessing", async () => {
    const { owner, workspace } = await setup();

    const result = await startChoice(owner, workspace.id);

    expect(result.connected).toBeUndefined();
    expect(result.workspaceId).toBe(workspace.id);
    expect(result.choose).toBeTruthy();
    // Nothing is connected until the user picks.
    expect(await listAccounts(owner, workspace.id)).toHaveLength(0);
    expect(provider.connectedTargetIds).toEqual([]);
  });

  it("holds the token encrypted while it waits for the choice", async () => {
    const { owner, workspace } = await setup();
    const { choose } = await startChoice(owner, workspace.id);

    const draft = await SocialConnectionDraft.findOne({
      _id: choose,
      workspace: workspace.id,
    }).select("+encryptedAccessToken");
    expect(draft?.targets.map((target) => target.id)).toEqual(["page-1", "page-2"]);
    expect(draft?.encryptedAccessToken).not.toContain(provider.lastAccessToken);
    expect(JSON.stringify(draft)).not.toContain(provider.lastAccessToken);
    // The OAuth state is spent either way.
    expect(await SocialOAuthState.countDocuments({ workspace: workspace.id })).toBe(0);
  });

  it("lists the choices and connects the one the user picks", async () => {
    const { owner, workspace } = await setup();
    const { choose } = await startChoice(owner, workspace.id);
    const path = `/social-accounts/connections/${choose}?workspaceId=${workspace.id}`;

    const listed = await call(owner, "get", path).expect(200);
    expect(listed.body.data.targets).toHaveLength(2);
    expect(listed.body.data.platform).toBe("LINKEDIN");

    const chosen = await call(owner, "post", path, { targetId: "page-2" }).expect(200);
    expect(chosen.body.data.account).toMatchObject({
      providerAccountId: "page-2",
      accountName: "Acme Roastery",
      status: "CONNECTED",
    });
    expect(provider.connectedTargetIds).toEqual(["page-2"]);

    const accounts = await listAccounts(owner, workspace.id);
    expect(accounts.map((account) => account.providerAccountId)).toEqual(["page-2"]);
    // The draft is spent once used.
    expect(await SocialConnectionDraft.countDocuments({ workspace: workspace.id })).toBe(0);
  });

  it("refuses an account that wasn't part of the authorization", async () => {
    const { owner, workspace } = await setup();
    const { choose } = await startChoice(owner, workspace.id);

    const res = await call(
      owner,
      "post",
      `/social-accounts/connections/${choose}?workspaceId=${workspace.id}`,
      { targetId: "page-999" },
    ).expect(400);
    expect(res.body.message).toContain("isn't part of this connection");
    expect(provider.connectedTargetIds).toEqual([]);
  });

  it("keeps drafts inside their workspace, and to admins", async () => {
    const { owner, workspace } = await setup();
    const { choose } = await startChoice(owner, workspace.id);
    const path = `/social-accounts/connections/${choose}?workspaceId=${workspace.id}`;

    const editor = await createUser("Eddie Editor");
    await addMember(owner, workspace.id, editor, "EDITOR");
    await call(editor, "get", path).expect(403);

    const outsider = await createUser("Olive Outsider");
    const otherWorkspace = await createWorkspace(outsider);
    await call(
      outsider,
      "get",
      `/social-accounts/connections/${choose}?workspaceId=${otherWorkspace.id}`,
    ).expect(404);
  });

  it("connects straight away when the login granted only one account", async () => {
    const { owner, workspace } = await setup();
    provider.offerTargets([TARGETS[0]]);

    const start = await startConnection(owner, workspace.id).expect(200);
    const approval = provider.approve(start.body.data.authorizationUrl);
    const result = redirectResult(await sendCallback(owner, approval, bindingCookie(start)));

    expect(result).toEqual({ platform: "linkedin", connected: "1", workspaceId: workspace.id });
    expect(provider.connectedTargetIds).toEqual(["page-1"]);
    expect((await listAccounts(owner, workspace.id))[0].providerAccountId).toBe("page-1");
  });
});
