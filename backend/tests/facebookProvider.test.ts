import { describe, expect, it } from "vitest";
import type { FetchLike } from "../src/integrations/social/http";
import { FacebookProvider } from "../src/integrations/social/providers/facebook.provider";
import { SocialProviderRegistry } from "../src/integrations/social/registry";
import type { MediaAsset, ProviderCredentials } from "../src/integrations/social/types";
import { fakeGraph, formBody, graphError, json, pagesPayload, route } from "./helpers/fakeGraph";

const NOW = new Date("2026-09-16T09:00:00.000Z");
const PAGE_TOKEN = "page-token-1001";

const createProvider = (fetch: FetchLike, overrides = {}) =>
  new FacebookProvider({
    appId: "app-123",
    appSecret: "app-secret",
    redirectUri: "https://app.flowpost.test/api/v1/social-accounts/facebook/callback",
    fetch,
    now: () => NOW,
    ...overrides,
  });

const credentials: ProviderCredentials = {
  accessToken: PAGE_TOKEN,
  providerAccountId: "1001",
  metadata: { accountType: "page" },
};

const tokenRoutes = () => [
  route("GET", "/oauth/access_token", (request) =>
    json(200, {
      access_token: request.url.searchParams.get("grant_type")
        ? "long-lived-user-token"
        : "short-lived-user-token",
      expires_in: 5_184_000,
    }),
  ),
];

const image = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  url: "https://cdn.flowpost.test/beans.jpg",
  mimeType: "image/jpeg",
  ...overrides,
});

describe("Facebook OAuth", () => {
  it("sends the Page publishing scopes to the login dialog", async () => {
    const { fetch } = fakeGraph([]);
    const { url } = await createProvider(fetch).getAuthorizationUrl({
      state: "state-1",
      redirectUri: "https://app.flowpost.test/cb",
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://www.facebook.com");
    expect(parsed.pathname).toBe("/v26.0/dialog/oauth");
    // read_insights is what makes Page and post insights readable.
    expect(parsed.searchParams.get("scope")).toBe(
      "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights",
    );
    expect(parsed.searchParams.get("state")).toBe("state-1");
    expect(parsed.searchParams.get("response_type")).toBe("code");
  });

  it("isn't available until the Meta app is configured", () => {
    const { fetch } = fakeGraph([]);
    expect(createProvider(fetch, { appSecret: undefined }).isAvailable()).toBe(false);
    expect(createProvider(fetch, { redirectUri: undefined }).isAvailable()).toBe(false);
    expect(createProvider(fetch).isAvailable()).toBe(true);
  });

  it("exchanges the code for a long-lived token, since short ones last an hour", async () => {
    const { fetch, requests } = fakeGraph([
      ...tokenRoutes(),
      route("GET", "/me/accounts", () =>
        json(200, pagesPayload([{ id: "1001", name: "Acme Coffee" }])),
      ),
    ]);

    const { tokens, profile } = await createProvider(fetch).handleOAuthCallback({
      code: "auth-code",
      redirectUri: "https://app.flowpost.test/cb",
    });

    expect(requests[0].url.searchParams.get("code")).toBe("auth-code");
    expect(requests[1].url.searchParams.get("grant_type")).toBe("fb_exchange_token");
    expect(tokens.accessToken).toBe("long-lived-user-token");
    expect(tokens.refreshToken).toBeNull();
    expect(tokens.expiresAt).toEqual(new Date(NOW.getTime() + 5_184_000 * 1000));
    expect(profile.accountName).toBe("Acme Coffee");
  });

  it("lists every Page the login granted so the user can pick", async () => {
    const { fetch } = fakeGraph([
      route("GET", "/me/accounts", () =>
        json(
          200,
          pagesPayload([
            { id: "1001", name: "Acme Coffee" },
            { id: "1002", name: "Acme Roastery" },
          ]),
        ),
      ),
    ]);

    const targets = await createProvider(fetch).listConnectionTargets({
      accessToken: "user-token",
      scopes: [],
    });

    expect(targets.map((target) => target.id)).toEqual(["1001", "1002"]);
    expect(targets[0].name).toBe("Acme Coffee");
    expect(targets[0].image).toBe("https://scontent.test/1001.jpg");
  });

  it("leaves out Pages the user can't publish to", async () => {
    const { fetch } = fakeGraph([
      route("GET", "/me/accounts", () =>
        json(
          200,
          pagesPayload([
            { id: "1001", name: "Acme Coffee" },
            { id: "1002", name: "Read Only", tasks: ["ANALYZE"] },
          ]),
        ),
      ),
    ]);

    const targets = await createProvider(fetch).listConnectionTargets({
      accessToken: "user-token",
      scopes: [],
    });

    expect(targets.map((target) => target.id)).toEqual(["1001"]);
  });

  it("stores the Page token, not the user token, for the chosen Page", async () => {
    const { fetch } = fakeGraph([
      route("GET", "/me/accounts", () =>
        json(
          200,
          pagesPayload([
            { id: "1001", name: "Acme Coffee" },
            { id: "1002", name: "Acme Roastery", instagram: { id: "17841400000" } },
          ]),
        ),
      ),
    ]);

    const { tokens, profile } = await createProvider(fetch).connectTarget(
      { accessToken: "user-token", scopes: ["pages_manage_posts"] },
      "1002",
    );

    expect(tokens.accessToken).toBe("page-token-1002");
    // Page tokens from a long-lived user token don't expire on their own.
    expect(tokens.expiresAt).toBeNull();
    expect(profile.providerAccountId).toBe("1002");
    expect(profile.metadata).toMatchObject({ instagramAccountId: "17841400000" });
  });

  it("rejects a Page that is no longer available", async () => {
    const { fetch } = fakeGraph([
      route("GET", "/me/accounts", () =>
        json(200, pagesPayload([{ id: "1001", name: "Acme Coffee" }])),
      ),
    ]);

    await expect(
      createProvider(fetch).connectTarget({ accessToken: "user-token", scopes: [] }, "9999"),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
  });

  it("says so when the login granted no Page at all", async () => {
    const { fetch } = fakeGraph([
      ...tokenRoutes(),
      route("GET", "/me/accounts", () => json(200, { data: [] })),
    ]);

    await expect(
      createProvider(fetch).handleOAuthCallback({ code: "c", redirectUri: "https://x.test/cb" }),
    ).rejects.toMatchObject({ kind: "PERMISSION_DENIED" });
  });
});

describe("Facebook publishing", () => {
  it("posts text to the Page feed", async () => {
    const { fetch, requests } = fakeGraph([
      route("POST", "/1001/feed", () => json(200, { id: "1001_5000" })),
    ]);

    const result = await createProvider(fetch).publishText(credentials, {
      text: "Fresh beans beat a fancy machine.",
    });

    expect(formBody(requests[0])).toEqual({ message: "Fresh beans beat a fancy machine." });
    // The token goes in the header, never the query string.
    expect(requests[0].headers.get("Authorization")).toBe(`Bearer ${PAGE_TOKEN}`);
    expect(requests[0].url.search).toBe("");
    expect(result).toEqual({
      providerPostId: "1001_5000",
      url: "https://www.facebook.com/1001/posts/5000",
      publishedAt: NOW,
    });
  });

  it("refuses an empty post before calling Facebook", async () => {
    const { fetch, requests } = fakeGraph([]);
    await expect(
      createProvider(fetch).publishText(credentials, { text: "   " }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
    expect(requests).toHaveLength(0);
  });

  it("posts a single photo with its caption", async () => {
    const { fetch, requests } = fakeGraph([
      route("POST", "/1001/photos", () => json(200, { id: "77", post_id: "1001_5001" })),
    ]);

    const result = await createProvider(fetch).publishImage(credentials, {
      text: "Our new roast",
      images: [image({ altText: "A bag of beans" })],
    });

    expect(formBody(requests[0])).toEqual({
      url: "https://cdn.flowpost.test/beans.jpg",
      caption: "Our new roast",
      alt_text_custom: "A bag of beans",
      published: "true",
    });
    expect(result.providerPostId).toBe("1001_5001");
  });

  it("uploads several photos unpublished, then attaches them to one post", async () => {
    let uploaded = 0;
    const { fetch, requests } = fakeGraph([
      route("POST", "/1001/photos", () => {
        uploaded += 1;
        return json(200, { id: `photo-${uploaded}` });
      }),
      route("POST", "/1001/feed", () => json(200, { id: "1001_5002" })),
    ]);

    const result = await createProvider(fetch).publishImage(credentials, {
      text: "Three ways to brew",
      images: [image(), image({ url: "https://cdn.flowpost.test/b.jpg" }), image()],
    });

    expect(uploaded).toBe(3);
    expect(formBody(requests[0]).published).toBe("false");
    expect(JSON.parse(formBody(requests[3]).attached_media)).toEqual([
      { media_fbid: "photo-1" },
      { media_fbid: "photo-2" },
      { media_fbid: "photo-3" },
    ]);
    expect(result.providerPostId).toBe("1001_5002");
  });

  it.each([
    ["image/webp", "doesn't accept"],
    ["image/svg+xml", "doesn't accept"],
  ])("rejects %s images", async (mimeType) => {
    const { fetch, requests } = fakeGraph([]);
    await expect(
      createProvider(fetch).publishImage(credentials, { images: [image({ mimeType })] }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
    expect(requests).toHaveLength(0);
  });

  it("rejects an image over Facebook's 10 MB limit", async () => {
    const { fetch } = fakeGraph([]);
    await expect(
      createProvider(fetch).publishImage(credentials, {
        images: [image({ size: 11 * 1024 * 1024 })],
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
  });

  it("uploads a standard video through the resumable endpoint", async () => {
    const { fetch, requests } = fakeGraph([
      route("POST", "/app-123/uploads", () => json(200, { id: "upload:session-1" })),
      route("POST", "/upload:session-1", () => json(200, { h: "file-handle-9" })),
      route("POST", "/1001/videos", () => json(200, { id: "vid-1" })),
    ]);

    const result = await createProvider(fetch).publishVideo(credentials, {
      text: "Behind the roast",
      title: "Roasting",
      format: "standard",
      video: {
        url: "https://cdn.flowpost.test/roast.mp4",
        mimeType: "video/mp4",
        read: () => Promise.resolve(Buffer.from("video-bytes")),
      },
    });

    // Uploads go to graph.facebook.com: graph-video.facebook.com is deprecated.
    expect(requests[1].url.origin).toBe("https://graph.facebook.com");
    expect(requests[1].headers.get("file_offset")).toBe("0");
    expect(formBody(requests[2])).toEqual({
      title: "Roasting",
      description: "Behind the roast",
      fbuploader_video_file_chunk: "file-handle-9",
    });
    expect(result.providerPostId).toBe("vid-1");
  });

  it("publishes short video through the Reels API", async () => {
    const { fetch, requests } = fakeGraph([
      route("POST", "/1001/video_reels", (request) => {
        const phase = formBody(request).upload_phase;
        return json(200, phase === "start" ? { video_id: "reel-1" } : { success: true });
      }),
      route("POST", /^\/video-upload\//, () => json(200, { success: true })),
    ]);

    const result = await createProvider(fetch).publishVideo(credentials, {
      text: "60 seconds of pour-over",
      format: "short",
      video: {
        url: "https://cdn.flowpost.test/reel.mp4",
        mimeType: "video/mp4",
        read: () => Promise.resolve(Buffer.from("reel-bytes")),
      },
    });

    expect(requests[1].url.origin).toBe("https://rupload.facebook.com");
    expect(requests[1].headers.get("Authorization")).toBe(`OAuth ${PAGE_TOKEN}`);
    expect(formBody(requests[2])).toMatchObject({
      upload_phase: "finish",
      video_id: "reel-1",
      video_state: "PUBLISHED",
    });
    expect(result.providerPostId).toBe("reel-1");
  });

  it("deletes a post", async () => {
    const { fetch, requests } = fakeGraph([
      route("DELETE", "/1001_5000", () => json(200, { success: true })),
    ]);
    await createProvider(fetch).deletePost(credentials, "1001_5000");
    expect(requests[0].method).toBe("DELETE");
  });
});

describe("Facebook error mapping", () => {
  it.each([
    [{ status: 400, code: 190 }, "REAUTH_REQUIRED"],
    [{ status: 403, code: 200 }, "PERMISSION_DENIED"],
    [{ status: 400, code: 368 }, "ACCOUNT_RESTRICTED"],
    [{ status: 400, code: 4 }, "RATE_LIMITED"],
    [{ status: 500, code: 2 }, "PROVIDER_ERROR"],
    [{ status: 400, code: 100 }, "INVALID_REQUEST"],
  ])("maps %o onto the right kind", async ({ status, code }, kind) => {
    const { fetch } = fakeGraph([
      route("POST", "/1001/feed", () => graphError(status, { code, type: "GraphMethodException" })),
    ]);

    await expect(
      createProvider(fetch).publishText(credentials, { text: "Hello" }),
    ).rejects.toMatchObject({ kind });
  });

  it("shows Meta's own user-facing message when there is one", async () => {
    const { fetch } = fakeGraph([
      route("POST", "/1001/feed", () =>
        graphError(400, { code: 100, userMessage: "This Page needs Publishing Authorization." }),
      ),
    ]);

    await expect(
      createProvider(fetch).publishText(credentials, { text: "Hello" }),
    ).rejects.toMatchObject({
      kind: "INVALID_REQUEST",
      message: "This Page needs Publishing Authorization.",
    });
  });

  it("treats rate limiting as retryable, and bad input as not", async () => {
    const limited = fakeGraph([route("POST", "/1001/feed", () => graphError(429, { code: 4 }))]);
    await expect(
      createProvider(limited.fetch).publishText(credentials, { text: "Hi" }),
    ).rejects.toMatchObject({ retryable: true });

    const invalid = fakeGraph([route("POST", "/1001/feed", () => graphError(400, { code: 100 }))]);
    await expect(
      createProvider(invalid.fetch).publishText(credentials, { text: "Hi" }),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("implements every capability it declares", () => {
    const { fetch } = fakeGraph([]);
    expect(() => new SocialProviderRegistry([createProvider(fetch)])).not.toThrow();
  });
});
