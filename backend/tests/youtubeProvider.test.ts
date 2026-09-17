import { describe, expect, it } from "vitest";
import type { FetchLike } from "../src/integrations/social/http";
import { YouTubeProvider } from "../src/integrations/social/providers/youtube.provider";
import { SocialProviderRegistry } from "../src/integrations/social/registry";
import type { MediaAsset, ProviderCredentials } from "../src/integrations/social/types";
import { fakeGraph, json, type RecordedRequest, type Route } from "./helpers/fakeGraph";

const NOW = new Date("2026-09-16T09:00:00.000Z");
const ACCESS_TOKEN = "ya29.access-token";
const SESSION_URL = "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session-1";

const createProvider = (fetch: FetchLike, overrides = {}) =>
  new YouTubeProvider({
    clientId: "client-id-1",
    clientSecret: "client-secret-1",
    redirectUri: "https://app.flowpost.test/api/v1/social-accounts/youtube/callback",
    fetch,
    now: () => NOW,
    ...overrides,
  });

const credentials: ProviderCredentials = {
  accessToken: ACCESS_TOKEN,
  providerAccountId: "UC-channel-1",
  metadata: { accountType: "channel" },
};

const video = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  url: "https://cdn.flowpost.test/roast.mp4",
  mimeType: "video/mp4",
  read: () => Promise.resolve(Buffer.alloc(2048, 5)),
  ...overrides,
});

const at = (method: string, href: string, respond: Route["respond"]): Route => ({
  method,
  match: (url) => url.href.startsWith(href),
  respond,
});

const tokenRoute = (body: Record<string, unknown> = {}) =>
  at("POST", "https://oauth2.googleapis.com/token", () =>
    json(200, {
      access_token: ACCESS_TOKEN,
      refresh_token: "1//refresh-token",
      expires_in: 3599,
      scope: "https://www.googleapis.com/auth/youtube.upload",
      ...body,
    }),
  );

const channelRoute = () =>
  at("GET", "https://www.googleapis.com/youtube/v3/channels", () =>
    json(200, {
      items: [
        {
          id: "UC-channel-1",
          snippet: {
            title: "Acme Coffee",
            customUrl: "@acmecoffee",
            thumbnails: { default: { url: "https://yt3.test/a.jpg" } },
          },
          contentDetails: { relatedPlaylists: { uploads: "UU-uploads-1" } },
        },
      ],
    }),
  );

const uploadRoutes = () => [
  at("POST", "https://www.googleapis.com/upload/youtube/v3/videos", () =>
    json(200, {}, { location: SESSION_URL }),
  ),
  at("PUT", SESSION_URL, () => json(201, { id: "video-1", status: { privacyStatus: "public" } })),
];

const jsonBody = (request: RecordedRequest) =>
  JSON.parse(String(request.body)) as Record<string, unknown>;

describe("YouTube OAuth", () => {
  it("asks for offline access so a refresh token comes back", async () => {
    const { fetch } = fakeGraph([]);
    const { url } = await createProvider(fetch).getAuthorizationUrl({
      state: "state-1",
      redirectUri: "https://app.flowpost.test/cb",
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    // Without this, Google only issues a refresh token on the very first grant.
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    );
  });

  it("connects the channel the consent screen chose", async () => {
    const { fetch, requests } = fakeGraph([tokenRoute(), channelRoute()]);

    const { tokens, profile } = await createProvider(fetch).handleOAuthCallback({
      code: "auth-code",
      redirectUri: "https://app.flowpost.test/cb",
    });

    expect(Object.fromEntries(new URLSearchParams(String(requests[0].body)))).toMatchObject({
      code: "auth-code",
      grant_type: "authorization_code",
      client_id: "client-id-1",
    });
    expect(tokens.refreshToken).toBe("1//refresh-token");
    expect(tokens.expiresAt).toEqual(new Date(NOW.getTime() + 3599 * 1000));
    expect(profile).toMatchObject({
      providerAccountId: "UC-channel-1",
      accountName: "Acme Coffee",
      username: "@acmecoffee",
    });
    expect(profile.metadata).toMatchObject({ uploadsPlaylistId: "UU-uploads-1" });
  });

  it("refuses a grant with no refresh token, which can't be kept alive", async () => {
    const { fetch } = fakeGraph([tokenRoute({ refresh_token: undefined })]);

    await expect(
      createProvider(fetch).handleOAuthCallback({ code: "c", redirectUri: "https://x.test/cb" }),
    ).rejects.toMatchObject({ kind: "REAUTH_REQUIRED" });
  });

  it("explains when the Google account has no channel", async () => {
    const { fetch } = fakeGraph([
      tokenRoute(),
      at("GET", "https://www.googleapis.com/youtube/v3/channels", () => json(200, { items: [] })),
    ]);

    await expect(
      createProvider(fetch).handleOAuthCallback({ code: "c", redirectUri: "https://x.test/cb" }),
    ).rejects.toMatchObject({
      kind: "PERMISSION_DENIED",
      message: expect.stringContaining("no YouTube channel"),
    });
  });
});

describe("YouTube uploading", () => {
  it("opens a resumable session, then sends the file", async () => {
    const { fetch, requests } = fakeGraph(uploadRoutes());

    const result = await createProvider(fetch).publishVideo(credentials, {
      title: "How we roast",
      text: "A look inside the roastery.",
      format: "standard",
      video: video(),
    });

    const init = requests[0];
    expect(init.url.searchParams.get("uploadType")).toBe("resumable");
    expect(init.url.searchParams.get("part")).toBe("snippet,status");
    expect(init.headers.get("X-Upload-Content-Length")).toBe("2048");
    expect(init.headers.get("X-Upload-Content-Type")).toBe("video/mp4");
    expect(jsonBody(init)).toEqual({
      snippet: {
        title: "How we roast",
        description: "A look inside the roastery.",
        tags: [],
        categoryId: "22",
      },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    });

    // The bytes go to the session URL Google handed back.
    expect(requests[1].url.href).toBe(SESSION_URL);
    expect(result).toEqual({
      providerPostId: "video-1",
      url: "https://www.youtube.com/watch?v=video-1",
      publishedAt: NOW,
    });
  });

  it("takes the title from the first line when none is given", async () => {
    const { fetch, requests } = fakeGraph(uploadRoutes());

    await createProvider(fetch).publishVideo(credentials, {
      text: "Grind size matters\nHere is why.",
      format: "standard",
      video: video(),
    });

    expect((jsonBody(requests[0]).snippet as Record<string, unknown>).title).toBe(
      "Grind size matters",
    );
  });

  it("carries the channel's stored publishing settings", async () => {
    const { fetch, requests } = fakeGraph(uploadRoutes());

    await createProvider(fetch).publishVideo(
      {
        ...credentials,
        metadata: {
          privacyStatus: "unlisted",
          categoryId: "26",
          madeForKids: true,
          tags: ["coffee", "home barista"],
        },
      },
      { title: "Roasting", format: "standard", video: video() },
    );

    const body = jsonBody(requests[0]);
    expect(body.status).toEqual({ privacyStatus: "unlisted", selfDeclaredMadeForKids: true });
    expect((body.snippet as Record<string, unknown>).tags).toEqual(["coffee", "home barista"]);
  });

  it("drops tags once they pass YouTube's combined length limit", async () => {
    const { fetch, requests } = fakeGraph(uploadRoutes());
    const long = "a".repeat(300);

    await createProvider(fetch).publishVideo(
      { ...credentials, metadata: { tags: [long, long, "short"] } },
      { title: "Roasting", format: "standard", video: video() },
    );

    // Two 300-char tags exceed 500 combined, so only the first is kept.
    expect((jsonBody(requests[0]).snippet as Record<string, unknown>).tags).toEqual([long]);
  });

  it("checks the Shorts rules before uploading, since the API never says", async () => {
    const { fetch, requests } = fakeGraph([]);
    const provider = createProvider(fetch);

    await expect(
      provider.publishVideo(credentials, {
        title: "Too long",
        format: "short",
        video: video({ durationSeconds: 200 }),
      }),
    ).rejects.toMatchObject({
      kind: "INVALID_REQUEST",
      message: expect.stringContaining("three minutes"),
    });

    await expect(
      provider.publishVideo(credentials, {
        title: "Too wide",
        format: "short",
        video: video({ width: 1920, height: 1080 }),
      }),
    ).rejects.toMatchObject({
      kind: "INVALID_REQUEST",
      message: expect.stringContaining("square or vertical"),
    });

    expect(requests).toHaveLength(0);
  });

  it("accepts a vertical video within the Shorts length", async () => {
    const { fetch } = fakeGraph(uploadRoutes());

    const result = await createProvider(fetch).publishVideo(credentials, {
      title: "30 second pour",
      format: "short",
      video: video({ durationSeconds: 30, width: 1080, height: 1920 }),
    });

    expect(result.providerPostId).toBe("video-1");
  });

  it("enforces YouTube's title and description limits locally", async () => {
    const { fetch, requests } = fakeGraph([]);
    const provider = createProvider(fetch);

    await expect(
      provider.publishVideo(credentials, {
        title: "",
        text: "",
        format: "standard",
        video: video(),
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });

    await expect(
      provider.publishVideo(credentials, {
        title: "x".repeat(101),
        format: "standard",
        video: video(),
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });

    await expect(
      provider.publishVideo(credentials, {
        title: "Fine",
        text: "x".repeat(5001),
        format: "standard",
        video: video(),
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });

    // YouTube rejects angle brackets in either field.
    await expect(
      provider.publishVideo(credentials, {
        title: "A <b>bold</b> idea",
        format: "standard",
        video: video(),
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });

    expect(requests).toHaveLength(0);
  });

  it("treats a failure mid-upload as an unknown outcome", async () => {
    const { fetch } = fakeGraph([
      at("POST", "https://www.googleapis.com/upload/youtube/v3/videos", () =>
        json(200, {}, { location: SESSION_URL }),
      ),
      at("PUT", SESSION_URL, () => json(500, { error: { message: "Backend error" } })),
    ]);

    // The video may exist already, so the scheduler must not simply retry.
    await expect(
      createProvider(fetch).publishVideo(credentials, {
        title: "Roasting",
        format: "standard",
        video: video(),
      }),
    ).rejects.toMatchObject({ outcomeUnknown: true, retryable: false });
  });

  it("reads back a published video", async () => {
    const { fetch } = fakeGraph([
      at("GET", "https://www.googleapis.com/youtube/v3/videos", () =>
        json(200, {
          items: [
            {
              id: "video-1",
              snippet: { description: "A look inside", publishedAt: "2026-09-16T09:05:00Z" },
            },
          ],
        }),
      ),
    ]);

    expect(await createProvider(fetch).getPost(credentials, "video-1")).toEqual({
      providerPostId: "video-1",
      url: "https://www.youtube.com/watch?v=video-1",
      text: "A look inside",
      publishedAt: new Date("2026-09-16T09:05:00Z"),
    });
  });
});

describe("YouTube error mapping", () => {
  it.each([
    [401, "authError", "TOKEN_EXPIRED"],
    [403, "quotaExceeded", "RATE_LIMITED"],
    [403, "uploadLimitExceeded", "RATE_LIMITED"],
    [403, "forbidden", "PERMISSION_DENIED"],
    [400, "invalidTitle", "INVALID_REQUEST"],
    [503, "backendError", "PROVIDER_ERROR"],
  ])("maps HTTP %i %s onto %s", async (status, reason, kind) => {
    const { fetch } = fakeGraph([
      at("POST", "https://www.googleapis.com/upload/youtube/v3/videos", () =>
        json(status, { error: { message: "Nope", errors: [{ reason }] } }),
      ),
    ]);

    await expect(
      createProvider(fetch).publishVideo(credentials, {
        title: "Roasting",
        format: "standard",
        video: video(),
      }),
    ).rejects.toMatchObject({ kind });
  });

  it("implements every capability it declares", () => {
    const { fetch } = fakeGraph([]);
    expect(() => new SocialProviderRegistry([createProvider(fetch)])).not.toThrow();
  });

  it("declares no text posts, images or deleting", () => {
    const { fetch } = fakeGraph([]);
    const provider = createProvider(fetch);
    expect(provider.supports("TEXT_POST")).toBe(false);
    expect(provider.supports("IMAGE_POST")).toBe(false);
    // Deleting needs a broader scope than this integration asks for.
    expect(provider.supports("DELETE_POST")).toBe(false);
  });
});
