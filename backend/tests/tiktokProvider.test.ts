import { describe, expect, it } from "vitest";
import type { FetchLike } from "../src/integrations/social/http";
import { planChunks, TikTokProvider } from "../src/integrations/social/providers/tiktok.provider";
import { SocialProviderRegistry } from "../src/integrations/social/registry";
import type { MediaAsset, ProviderCredentials } from "../src/integrations/social/types";
import { fakeGraph, json, type RecordedRequest, type Route } from "./helpers/fakeGraph";

const NOW = new Date("2026-09-16T09:00:00.000Z");
const ACCESS_TOKEN = "act.tiktok-access-token";

const createProvider = (fetch: FetchLike, overrides = {}) =>
  new TikTokProvider({
    clientKey: "client-key-1",
    clientSecret: "client-secret-1",
    redirectUri: "https://app.flowpost.test/api/v1/social-accounts/tiktok/callback",
    fetch,
    now: () => NOW,
    sleep: () => Promise.resolve(),
    ...overrides,
  });

const credentials: ProviderCredentials = {
  accessToken: ACCESS_TOKEN,
  providerAccountId: "open-id-1",
  metadata: { username: "acmecoffee" },
};

const video = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  url: "https://cdn.flowpost.test/pour.mp4",
  mimeType: "video/mp4",
  read: () => Promise.resolve(Buffer.alloc(1024, 7)),
  ...overrides,
});

/** Matches a TikTok API path exactly. */
const path = (method: string, pathname: string, respond: Route["respond"]): Route => ({
  method,
  match: (url) => url.origin === "https://open.tiktokapis.com" && url.pathname === pathname,
  respond,
});

const UPLOAD_URL = "https://upload.tiktokapis.test/upload/123";

const creatorRoute = (
  privacyLevels = ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
  extra: Record<string, unknown> = {},
) =>
  path("POST", "/v2/post/publish/creator_info/query/", () =>
    json(200, {
      data: {
        creator_nickname: "Acme Coffee",
        creator_username: "acmecoffee",
        privacy_level_options: privacyLevels,
        max_video_post_duration_sec: 600,
        comment_disabled: false,
        duet_disabled: false,
        stitch_disabled: false,
        ...extra,
      },
      error: { code: "ok" },
    }),
  );

const publishRoutes = (statuses: string[] = ["PUBLISH_COMPLETE"]) => {
  const queue = [...statuses];
  return [
    creatorRoute(),
    path("POST", "/v2/post/publish/video/init/", () =>
      json(200, {
        data: { publish_id: "publish-1", upload_url: UPLOAD_URL },
        error: { code: "ok" },
      }),
    ),
    { method: "PUT", match: (url: URL) => url.href === UPLOAD_URL, respond: () => json(201, {}) },
    path("POST", "/v2/post/publish/status/fetch/", () =>
      json(200, {
        data: {
          status: queue.length > 1 ? queue.shift() : queue[0],
          publicaly_available_post_id: ["7100000000000000000"],
        },
        error: { code: "ok" },
      }),
    ),
  ];
};

const jsonBody = (request: RecordedRequest) =>
  JSON.parse(String(request.body)) as Record<string, unknown>;

describe("TikTok chunk planning", () => {
  it("sends a small file as one chunk", () => {
    expect(planChunks(1024)).toEqual({ chunkSize: 1024, chunkCount: 1 });
    expect(planChunks(5 * 1024 * 1024)).toEqual({
      chunkSize: 5 * 1024 * 1024,
      chunkCount: 1,
    });
  });

  it("rounds the chunk count down, so the last chunk carries the remainder", () => {
    // 12 MB at a 5 MB chunk is two chunks, not three: the second is 7 MB.
    const plan = planChunks(12 * 1024 * 1024);
    expect(plan.chunkSize).toBe(5 * 1024 * 1024);
    expect(plan.chunkCount).toBe(2);
  });

  it("stays within TikTok's chunk size and count limits", () => {
    const huge = planChunks(4 * 1024 * 1024 * 1024);
    expect(huge.chunkSize).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(huge.chunkCount).toBeLessThanOrEqual(1000);
  });
});

describe("TikTok OAuth", () => {
  it("builds the authorization URL with the posting scopes", async () => {
    const { fetch } = fakeGraph([]);
    const { url, codeVerifier } = await createProvider(fetch).getAuthorizationUrl({
      state: "state-1",
      redirectUri: "https://app.flowpost.test/cb",
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(parsed.searchParams.get("client_key")).toBe("client-key-1");
    // video.list and user.info.stats are the analytics scopes.
    expect(parsed.searchParams.get("scope")).toBe(
      "user.info.basic,video.publish,video.list,user.info.stats",
    );
    // The server-side flow doesn't use PKCE.
    expect(codeVerifier).toBeUndefined();
  });

  it("keeps the rotated refresh token TikTok returns", async () => {
    const { fetch, requests } = fakeGraph([
      path("POST", "/v2/oauth/token/", () =>
        json(200, {
          access_token: ACCESS_TOKEN,
          refresh_token: "rft.new-refresh-token",
          expires_in: 86_400,
          refresh_expires_in: 31_536_000,
          scope: "user.info.basic,video.publish",
          open_id: "open-id-1",
        }),
      ),
    ]);

    const tokens = await createProvider(fetch).refreshAccessToken("rft.old-refresh-token");

    expect(Object.fromEntries(new URLSearchParams(String(requests[0].body)))).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "rft.old-refresh-token",
      client_key: "client-key-1",
    });
    expect(tokens.refreshToken).toBe("rft.new-refresh-token");
    expect(tokens.expiresAt).toEqual(new Date(NOW.getTime() + 86_400 * 1000));
    expect(tokens.refreshTokenExpiresAt).toEqual(new Date(NOW.getTime() + 31_536_000 * 1000));
  });

  it("reads the creator profile", async () => {
    const { fetch } = fakeGraph([
      path("GET", "/v2/user/info/", () =>
        json(200, {
          data: {
            user: {
              open_id: "open-id-1",
              display_name: "Acme Coffee",
              username: "acmecoffee",
              avatar_url: "https://p16.tiktokcdn.test/a.jpg",
            },
          },
          error: { code: "ok" },
        }),
      ),
    ]);

    const profile = await createProvider(fetch).getProfile(credentials);

    expect(profile).toMatchObject({
      providerAccountId: "open-id-1",
      accountName: "Acme Coffee",
      username: "acmecoffee",
    });
  });
});

describe("TikTok publishing", () => {
  it("asks what the creator may post, uploads, then polls until it's live", async () => {
    const { fetch, requests } = fakeGraph(publishRoutes());

    const result = await createProvider(fetch).publishVideo(credentials, {
      text: "Pour-over in 30 seconds",
      format: "short",
      video: video(),
    });

    // creator_info comes first: the privacy level can't be assumed.
    expect(requests[0].url.pathname).toBe("/v2/post/publish/creator_info/query/");
    expect(jsonBody(requests[1])).toMatchObject({
      post_info: { title: "Pour-over in 30 seconds", privacy_level: "PUBLIC_TO_EVERYONE" },
      source_info: { source: "FILE_UPLOAD", video_size: 1024, total_chunk_count: 1 },
    });
    expect(requests[2].headers.get("Content-Range")).toBe("bytes 0-1023/1024");
    expect(result).toEqual({
      providerPostId: "7100000000000000000",
      url: "https://www.tiktok.com/@acmecoffee/video/7100000000000000000",
      publishedAt: NOW,
    });
  });

  it("only uses a privacy level the account currently offers", async () => {
    // An unaudited app gets SELF_ONLY and nothing else.
    const { fetch, requests } = fakeGraph([
      creatorRoute(["SELF_ONLY"]),
      ...publishRoutes().slice(1),
    ]);

    await createProvider(fetch).publishVideo(credentials, { format: "short", video: video() });

    expect(jsonBody(requests[1]).post_info).toMatchObject({ privacy_level: "SELF_ONLY" });
  });

  it("prefers the account's stored privacy level when it's still allowed", async () => {
    const { fetch, requests } = fakeGraph(publishRoutes());

    await createProvider(fetch).publishVideo(
      { ...credentials, metadata: { ...credentials.metadata, privacyLevel: "SELF_ONLY" } },
      { format: "short", video: video() },
    );

    expect(jsonBody(requests[1]).post_info).toMatchObject({ privacy_level: "SELF_ONLY" });
  });

  it("carries the creator's interaction settings into the post", async () => {
    const { fetch, requests } = fakeGraph([
      creatorRoute(["PUBLIC_TO_EVERYONE"], { duet_disabled: true, stitch_disabled: true }),
      ...publishRoutes().slice(1),
    ]);

    await createProvider(fetch).publishVideo(credentials, { format: "short", video: video() });

    expect(jsonBody(requests[1]).post_info).toMatchObject({
      disable_duet: true,
      disable_stitch: true,
      disable_comment: false,
    });
  });

  it("uploads a large file as several chunks, in order", async () => {
    const size = 12 * 1024 * 1024;
    const ranges: string[] = [];
    const routes = publishRoutes();
    routes[2] = {
      method: "PUT",
      match: (url: URL) => url.href === UPLOAD_URL,
      respond: (request) => {
        ranges.push(String(request.headers.get("Content-Range")));
        return json(ranges.length === 2 ? 201 : 206, {});
      },
    };
    const { fetch } = fakeGraph(routes);

    await createProvider(fetch).publishVideo(credentials, {
      format: "short",
      video: video({ read: () => Promise.resolve(Buffer.alloc(size, 3)) }),
    });

    // Two chunks: 5 MB, then everything left.
    expect(ranges).toEqual([
      `bytes 0-${5 * 1024 * 1024 - 1}/${size}`,
      `bytes ${5 * 1024 * 1024}-${size - 1}/${size}`,
    ]);
  });

  it("keeps polling while TikTok is still processing", async () => {
    const { fetch, requests } = fakeGraph(
      publishRoutes(["PROCESSING_UPLOAD", "PROCESSING_DOWNLOAD", "PUBLISH_COMPLETE"]),
    );

    await createProvider(fetch).publishVideo(credentials, { format: "short", video: video() });

    const polls = requests.filter((item) => item.url.pathname.endsWith("/status/fetch/"));
    expect(polls).toHaveLength(3);
  });

  it("falls back to the publish id when the post has no public id", async () => {
    const routes = publishRoutes();
    routes[3] = path("POST", "/v2/post/publish/status/fetch/", () =>
      json(200, { data: { status: "PUBLISH_COMPLETE" }, error: { code: "ok" } }),
    );
    const { fetch } = fakeGraph(routes);

    const result = await createProvider(fetch).publishVideo(credentials, {
      format: "short",
      video: video(),
    });

    // A private post never gets a public id, so there's no link to give.
    expect(result.providerPostId).toBe("publish-1");
    expect(result.url).toBeNull();
  });

  it("reports a failed publish", async () => {
    const routes = publishRoutes();
    routes[3] = path("POST", "/v2/post/publish/status/fetch/", () =>
      json(200, {
        data: { status: "FAILED", fail_reason: "video_format_check_failed" },
        error: { code: "ok" },
      }),
    );
    const { fetch } = fakeGraph(routes);

    await expect(
      createProvider(fetch).publishVideo(credentials, { format: "short", video: video() }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST", message: "video_format_check_failed" });
  });

  it("flags an unknown outcome when processing never finishes", async () => {
    let clock = NOW.getTime();
    const { fetch } = fakeGraph(publishRoutes(["PROCESSING_UPLOAD"]));
    const provider = createProvider(fetch, {
      now: () => new Date(clock),
      // Each poll pushes the clock past the timeout.
      sleep: () => {
        clock += 60_000;
        return Promise.resolve();
      },
    });

    // The video is already with TikTok, so retrying could post twice.
    await expect(
      provider.publishVideo(credentials, { format: "short", video: video() }),
    ).rejects.toMatchObject({ outcomeUnknown: true, retryable: false });
  });

  it("validates the file locally before sending anything", async () => {
    const { fetch, requests } = fakeGraph([]);
    const provider = createProvider(fetch);

    await expect(
      provider.publishVideo(credentials, {
        format: "short",
        video: video({ mimeType: "video/avi" }),
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });

    await expect(
      provider.publishVideo(credentials, {
        format: "short",
        video: video({ size: 5 * 1024 * 1024 * 1024 }),
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });

    await expect(
      provider.publishVideo(credentials, {
        format: "short",
        video: video(),
        text: "x".repeat(2201),
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });

    expect(requests).toHaveLength(0);
  });
});

describe("TikTok error mapping", () => {
  it.each([
    ["access_token_invalid", "TOKEN_EXPIRED"],
    ["scope_not_authorized", "PERMISSION_DENIED"],
    ["unaudited_client_can_only_post_to_private_accounts", "PERMISSION_DENIED"],
    ["spam_risk_too_many_posts", "ACCOUNT_RESTRICTED"],
    ["rate_limit_exceeded", "RATE_LIMITED"],
    ["internal_error", "PROVIDER_ERROR"],
  ])("maps %s onto %s", async (code, kind) => {
    // TikTok often returns its errors with HTTP 200.
    const { fetch } = fakeGraph([
      path("POST", "/v2/post/publish/creator_info/query/", () =>
        json(200, { error: { code, message: "Nope" } }),
      ),
    ]);

    await expect(
      createProvider(fetch).publishVideo(credentials, { format: "short", video: video() }),
    ).rejects.toMatchObject({ kind });
  });

  it("implements every capability it declares", () => {
    const { fetch } = fakeGraph([]);
    expect(() => new SocialProviderRegistry([createProvider(fetch)])).not.toThrow();
  });

  it("has no text posts or deleting, because TikTok has neither", () => {
    const { fetch } = fakeGraph([]);
    const provider = createProvider(fetch);
    expect(provider.supports("TEXT_POST")).toBe(false);
    expect(provider.supports("DELETE_POST")).toBe(false);
  });
});
