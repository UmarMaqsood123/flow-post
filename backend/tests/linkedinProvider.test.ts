import { describe, expect, it } from "vitest";
import type { FetchLike } from "../src/integrations/social/http";
import {
  escapeLittleText,
  LinkedInProvider,
} from "../src/integrations/social/providers/linkedin.provider";
import { SocialProviderRegistry } from "../src/integrations/social/registry";
import type { ProviderCredentials } from "../src/integrations/social/types";

/**
 * LinkedIn provider against a fake `fetch` that mimics the documented LinkedIn
 * endpoints. No network access; every request is recorded for assertions.
 */

interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: RequestInit["body"];
}

interface Route {
  method: string;
  match: (url: URL) => boolean;
  respond: (request: RecordedRequest) => Response | Promise<Response>;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const fakeLinkedIn = (routes: Route[]) => {
  const requests: RecordedRequest[] = [];
  const fetch: FetchLike = async (input, init = {}) => {
    const request: RecordedRequest = {
      url: new URL(input),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: init.body,
    };
    requests.push(request);
    const route = routes.find((item) => item.method === request.method && item.match(request.url));
    if (!route) throw new TypeError(`Unexpected request ${request.method} ${input}`);
    return route.respond(request);
  };
  return { fetch, requests };
};

const NOW = new Date("2026-09-15T12:00:00.000Z");
const ACCESS_TOKEN = "AQV-linkedin-access-token-value";

const createProvider = (fetch: FetchLike, overrides = {}) =>
  new LinkedInProvider({
    clientId: "client-123",
    clientSecret: "secret-456",
    redirectUri: "https://app.flowpost.test/api/v1/social-accounts/linkedin/callback",
    apiVersion: "202608",
    fetch,
    now: () => NOW,
    ...overrides,
  });

const credentials: ProviderCredentials = {
  accessToken: ACCESS_TOKEN,
  providerAccountId: "782bbtaQ",
  metadata: {},
};

const tokenRoute = (respond: Route["respond"]): Route => ({
  method: "POST",
  match: (url) => url.href === "https://www.linkedin.com/oauth/v2/accessToken",
  respond,
});

const userinfoRoute = (
  body: unknown = {
    sub: "782bbtaQ",
    name: "John Doe",
    picture: "https://media.licdn.com/p.jpg",
    locale: "en-US",
  },
): Route => ({
  method: "GET",
  match: (url) => url.href === "https://api.linkedin.com/v2/userinfo",
  respond: () => json(200, body),
});

const postsRoute = (respond: Route["respond"]): Route => ({
  method: "POST",
  match: (url) => url.href === "https://api.linkedin.com/rest/posts",
  respond,
});

const createdPost = () =>
  new Response(null, {
    status: 201,
    headers: { "x-restli-id": "urn:li:share:6844785523593134080" },
  });

const formBody = (request: RecordedRequest) =>
  Object.fromEntries(new URLSearchParams(String(request.body)));

const jsonBody = (request: RecordedRequest) =>
  JSON.parse(String(request.body)) as Record<string, unknown>;

describe("LinkedIn OAuth", () => {
  it("builds the authorization URL with the self-serve scopes", async () => {
    const { fetch } = fakeLinkedIn([]);
    const provider = createProvider(fetch);
    expect(provider.isAvailable()).toBe(true);

    const { url, codeVerifier } = await provider.getAuthorizationUrl({
      state: "state-abc",
      redirectUri: "https://app.flowpost.test/api/v1/social-accounts/linkedin/callback",
    });

    expect(codeVerifier).toBeUndefined();
    expect(url).toContain("scope=openid%20profile%20w_member_social");
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      response_type: "code",
      client_id: "client-123",
      redirect_uri: "https://app.flowpost.test/api/v1/social-accounts/linkedin/callback",
      state: "state-abc",
      scope: "openid profile w_member_social",
    });
  });

  it("is unavailable and refuses OAuth without app credentials", async () => {
    const { fetch } = fakeLinkedIn([]);
    const provider = createProvider(fetch, { clientSecret: undefined });
    expect(provider.isAvailable()).toBe(false);
    await expect(
      provider.getAuthorizationUrl({ state: "s", redirectUri: "https://x.test/cb" }),
    ).rejects.toMatchObject({ kind: "NOT_CONFIGURED" });
  });

  it("exchanges the code, then loads the member profile", async () => {
    const { fetch, requests } = fakeLinkedIn([
      tokenRoute(() =>
        json(200, {
          access_token: ACCESS_TOKEN,
          expires_in: 5184000,
          scope: "openid,profile,w_member_social",
        }),
      ),
      userinfoRoute(),
    ]);
    const provider = createProvider(fetch);

    const { tokens, profile } = await provider.handleOAuthCallback({
      code: "auth-code",
      redirectUri: "https://app.flowpost.test/api/v1/social-accounts/linkedin/callback",
    });

    const [tokenRequest, profileRequest] = requests;
    expect(tokenRequest?.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(tokenRequest && formBody(tokenRequest)).toEqual({
      grant_type: "authorization_code",
      code: "auth-code",
      redirect_uri: "https://app.flowpost.test/api/v1/social-accounts/linkedin/callback",
      client_id: "client-123",
      client_secret: "secret-456",
    });
    expect(profileRequest?.headers.get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);

    expect(tokens).toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: undefined,
      expiresAt: new Date(NOW.getTime() + 5184000 * 1000),
      refreshTokenExpiresAt: null,
      scopes: ["openid", "profile", "w_member_social"],
    });
    expect(profile).toEqual({
      providerAccountId: "782bbtaQ",
      accountName: "John Doe",
      username: null,
      profileImage: "https://media.licdn.com/p.jpg",
      metadata: { accountType: "member", authorUrn: "urn:li:person:782bbtaQ", locale: "en-US" },
    });
  });

  it("keeps refresh tokens for apps that receive them", async () => {
    const { fetch, requests } = fakeLinkedIn([
      tokenRoute(() =>
        json(200, {
          access_token: "new-access",
          expires_in: 5184000,
          refresh_token: "refresh-1",
          refresh_token_expires_in: 31536000,
          scope: "openid profile w_member_social",
        }),
      ),
    ]);
    const tokens = await createProvider(fetch).refreshAccessToken("refresh-0");

    expect(requests[0] && formBody(requests[0])).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "refresh-0",
    });
    expect(tokens).toMatchObject({
      accessToken: "new-access",
      refreshToken: "refresh-1",
      refreshTokenExpiresAt: new Date(NOW.getTime() + 31536000 * 1000),
    });
  });

  it("refuses connections that didn't grant posting permission", async () => {
    const { fetch } = fakeLinkedIn([
      tokenRoute(() =>
        json(200, { access_token: ACCESS_TOKEN, expires_in: 5184000, scope: "openid profile" }),
      ),
      userinfoRoute(),
    ]);
    await expect(
      createProvider(fetch).handleOAuthCallback({ code: "c", redirectUri: "https://x.test/cb" }),
    ).rejects.toMatchObject({ kind: "PERMISSION_DENIED" });
  });

  it("maps token endpoint failures without leaking secrets", async () => {
    const invalidCode = fakeLinkedIn([
      tokenRoute(() =>
        json(400, {
          error: "invalid_redirect_uri",
          error_description: "Unable to retrieve access token",
        }),
      ),
    ]);
    const exchange = createProvider(invalidCode.fetch).handleOAuthCallback({
      code: "c",
      redirectUri: "https://x.test/cb",
    });
    await expect(exchange).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
    await exchange.catch((error: Error) => expect(error.message).not.toContain("secret-456"));

    const revoked = fakeLinkedIn([tokenRoute(() => json(400, { error: "invalid_request" }))]);
    await expect(createProvider(revoked.fetch).refreshAccessToken("old")).rejects.toMatchObject({
      kind: "REAUTH_REQUIRED",
    });

    const garbage = fakeLinkedIn([tokenRoute(() => json(200, { unexpected: true }))]);
    await expect(createProvider(garbage.fetch).refreshAccessToken("old")).rejects.toMatchObject({
      kind: "PROVIDER_ERROR",
    });
  });
});

describe("LinkedIn publishing", () => {
  it("publishes a text post through the versioned Posts API", async () => {
    const { fetch, requests } = fakeLinkedIn([postsRoute(createdPost)]);
    const result = await createProvider(fetch).publishText(credentials, {
      text: "Launch (v2) is live! #product @team *new*",
    });

    expect(result).toEqual({
      providerPostId: "urn:li:share:6844785523593134080",
      url: "https://www.linkedin.com/feed/update/urn:li:share:6844785523593134080/",
      publishedAt: NOW,
    });
    const [request] = requests;
    expect(request?.headers.get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(request?.headers.get("linkedin-version")).toBe("202608");
    expect(request?.headers.get("x-restli-protocol-version")).toBe("2.0.0");
    expect(request && jsonBody(request)).toEqual({
      author: "urn:li:person:782bbtaQ",
      commentary: "Launch \\(v2\\) is live! #product \\@team \\*new\\*",
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    });
  });

  it("validates text before calling LinkedIn", async () => {
    const { fetch, requests } = fakeLinkedIn([postsRoute(createdPost)]);
    const provider = createProvider(fetch);

    await expect(provider.publishText(credentials, { text: "   " })).rejects.toMatchObject({
      kind: "INVALID_REQUEST",
    });
    await expect(
      provider.publishText(credentials, { text: "a".repeat(3001) }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST", message: expect.stringContaining("3,000") });
    expect(requests).toHaveLength(0);
  });

  it("uploads a single image synchronously, then posts it", async () => {
    const bytes = Buffer.from("89504e470d0a1a0a", "hex");
    const { fetch, requests } = fakeLinkedIn([
      {
        method: "POST",
        match: (url) => url.href === "https://api.linkedin.com/rest/assets?action=registerUpload",
        respond: () =>
          json(200, {
            value: {
              uploadMechanism: {
                "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
                  uploadUrl:
                    "https://www.linkedin.com/dms-uploads/C5622AQHdBDflPp0pEg/feedshare-uploadedImage/0?sync=1",
                  headers: { "media-type-family": "STILLIMAGE" },
                },
              },
              asset: "urn:li:digitalmediaAsset:C5622AQHdBDflPp0pEg",
            },
          }),
      },
      {
        method: "PUT",
        match: (url) =>
          url.hostname === "www.linkedin.com" && url.pathname.startsWith("/dms-uploads/"),
        respond: () => new Response(null, { status: 201 }),
      },
      postsRoute(createdPost),
    ]);

    await createProvider(fetch).publishImage(credentials, {
      text: "Our new office",
      images: [
        {
          url: "https://storage.test/a.png",
          mimeType: "image/png",
          altText: "Office",
          read: async () => bytes,
        },
      ],
    });

    const [register, upload, post] = requests;
    expect(register && jsonBody(register)).toEqual({
      registerUploadRequest: {
        owner: "urn:li:person:782bbtaQ",
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        serviceRelationships: [
          { identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" },
        ],
        supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"],
      },
    });
    expect(upload?.headers.get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(upload?.headers.get("content-type")).toBe("image/png");
    expect(upload?.headers.get("media-type-family")).toBe("STILLIMAGE");
    expect(Buffer.from(upload?.body as Uint8Array).equals(bytes)).toBe(true);
    expect(post && jsonBody(post)).toMatchObject({
      commentary: "Our new office",
      content: { media: { id: "urn:li:image:C5622AQHdBDflPp0pEg", altText: "Office" } },
    });
  });

  it("rejects unsupported images and never sends the token to other hosts", async () => {
    const png = {
      url: "https://storage.test/a.png",
      mimeType: "image/png",
      read: async () => Buffer.from("x"),
    };
    const gif = fakeLinkedIn([]);
    await expect(
      createProvider(gif.fetch).publishImage(credentials, {
        images: [{ ...png, mimeType: "image/gif" }],
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
    await expect(
      createProvider(gif.fetch).publishImage(credentials, { images: [png, png] }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
    expect(gif.requests).toHaveLength(0);

    const hostile = fakeLinkedIn([
      {
        method: "POST",
        match: (url) => url.pathname === "/rest/assets",
        respond: () =>
          json(200, {
            value: {
              uploadMechanism: {
                "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
                  uploadUrl: "https://attacker.example/steal",
                },
              },
              asset: "urn:li:digitalmediaAsset:C5622AQHdBDflPp0pEg",
            },
          }),
      },
    ]);
    await expect(
      createProvider(hostile.fetch).publishImage(credentials, { images: [png] }),
    ).rejects.toMatchObject({ kind: "PROVIDER_ERROR" });
    expect(hostile.requests.map((request) => request.url.hostname)).toEqual(["api.linkedin.com"]);
  });

  it("maps LinkedIn API errors onto provider error kinds", async () => {
    const cases: [Response | Error, Record<string, unknown>][] = [
      [json(401, { message: "Invalid access token" }), { kind: "TOKEN_EXPIRED" }],
      [json(403, { message: "Not enough permissions" }), { kind: "PERMISSION_DENIED" }],
      [
        json(429, { message: "Throttled" }, { "Retry-After": "120" }),
        { kind: "RATE_LIMITED", retryAfterSeconds: 120 },
      ],
      [
        json(422, { message: "commentary length exceeds the allowed maximum" }),
        { kind: "INVALID_REQUEST", message: expect.stringContaining("commentary length") },
      ],
      [json(500, {}), { kind: "PROVIDER_ERROR", retryable: true }],
      [new TypeError("fetch failed"), { kind: "PROVIDER_ERROR", retryable: true }],
    ];

    for (const [outcome, expected] of cases) {
      const { fetch } = fakeLinkedIn([
        postsRoute(() => {
          if (outcome instanceof Error) throw outcome;
          return outcome;
        }),
      ]);
      const attempt = createProvider(fetch).publishText(credentials, { text: "Hello" });
      await expect(attempt).rejects.toMatchObject(expected);
      await attempt.catch((error: Error) => expect(error.message).not.toContain(ACCESS_TOKEN));
    }
  });
});

describe("LinkedIn provider contract", () => {
  it("implements every capability it declares", () => {
    const { fetch } = fakeLinkedIn([]);
    expect(() => new SocialProviderRegistry([createProvider(fetch)])).not.toThrow();
  });

  it("escapes little-text reserved characters but keeps hashtags", () => {
    expect(escapeLittleText("#launch day (beta) @ C# a_b ~ok~ [x]{y}<z>|\\")).toBe(
      "#launch day \\(beta\\) \\@ C\\# a\\_b \\~ok\\~ \\[x\\]\\{y\\}\\<z\\>\\|\\\\",
    );
  });
});
