import { describe, expect, it } from "vitest";
import type { FetchLike } from "../src/integrations/social/http";
import { InstagramProvider } from "../src/integrations/social/providers/instagram.provider";
import { SocialProviderRegistry } from "../src/integrations/social/registry";
import type { MediaAsset, ProviderCredentials } from "../src/integrations/social/types";
import { fakeGraph, formBody, graphError, json, pagesPayload, route } from "./helpers/fakeGraph";

const NOW = new Date("2026-09-16T09:00:00.000Z");
const IG_ID = "17841400000";
const PAGE_TOKEN = "page-token-1001";

const createProvider = (fetch: FetchLike, overrides = {}) =>
  new InstagramProvider({
    appId: "app-123",
    appSecret: "app-secret",
    redirectUri: "https://app.flowpost.test/api/v1/social-accounts/instagram/callback",
    fetch,
    now: () => NOW,
    // Don't actually wait between status polls.
    sleep: () => Promise.resolve(),
    ...overrides,
  });

const credentials: ProviderCredentials = {
  accessToken: PAGE_TOKEN,
  providerAccountId: IG_ID,
  metadata: { pageId: "1001" },
};

const image = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  url: "https://cdn.flowpost.test/beans.jpg",
  mimeType: "image/jpeg",
  ...overrides,
});

const video = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  url: "https://cdn.flowpost.test/reel.mp4",
  mimeType: "video/mp4",
  ...overrides,
});

/** Containers are created, polled until FINISHED, then published. */
const publishingRoutes = (options: { statuses?: string[] } = {}) => {
  const statuses = [...(options.statuses ?? ["FINISHED"])];
  let created = 0;
  return [
    route("POST", `/${IG_ID}/media`, () => {
      created += 1;
      return json(200, { id: `container-${created}` });
    }),
    route("GET", /^\/container-\d+$/, () =>
      json(200, { status_code: statuses.length > 1 ? statuses.shift() : statuses[0] }),
    ),
    route("POST", `/${IG_ID}/media_publish`, () => json(200, { id: "media-999" })),
    route("GET", "/media-999", () =>
      json(200, { id: "media-999", permalink: "https://www.instagram.com/p/ABC/" }),
    ),
  ];
};

describe("Instagram OAuth", () => {
  it("asks for the Instagram and Page scopes together", async () => {
    const { fetch } = fakeGraph([]);
    const { url } = await createProvider(fetch).getAuthorizationUrl({
      state: "state-1",
      redirectUri: "https://app.flowpost.test/cb",
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://www.facebook.com");
    expect(parsed.searchParams.get("scope")).toBe(
      "instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement",
    );
  });

  it("offers only Pages that have a linked professional account", async () => {
    const { fetch } = fakeGraph([
      route("GET", "/me/accounts", () =>
        json(
          200,
          pagesPayload([
            { id: "1001", name: "Acme Coffee", instagram: { id: IG_ID, username: "acmecoffee" } },
            { id: "1002", name: "No Instagram Here" },
          ]),
        ),
      ),
    ]);

    const targets = await createProvider(fetch).listConnectionTargets({
      accessToken: "user-token",
      scopes: [],
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      id: IG_ID,
      username: "acmecoffee",
      description: "Linked to Acme Coffee",
    });
  });

  it("connects the Instagram account using its Page token", async () => {
    const { fetch } = fakeGraph([
      route("GET", "/me/accounts", () =>
        json(200, pagesPayload([{ id: "1001", name: "Acme Coffee", instagram: { id: IG_ID } }])),
      ),
    ]);

    const { tokens, profile } = await createProvider(fetch).connectTarget(
      { accessToken: "user-token", scopes: ["instagram_content_publish"] },
      IG_ID,
    );

    expect(tokens.accessToken).toBe(PAGE_TOKEN);
    expect(profile.providerAccountId).toBe(IG_ID);
    expect(profile.metadata).toMatchObject({ pageId: "1001", accountType: "professional" });
  });

  it("explains what to do when no professional account is linked", async () => {
    const { fetch } = fakeGraph([
      route("GET", "/oauth/access_token", () => json(200, { access_token: "t", expires_in: 100 })),
      route("GET", "/me/accounts", () =>
        json(200, pagesPayload([{ id: "1001", name: "Personal Page" }])),
      ),
    ]);

    await expect(
      createProvider(fetch).handleOAuthCallback({ code: "c", redirectUri: "https://x.test/cb" }),
    ).rejects.toMatchObject({
      kind: "PERMISSION_DENIED",
      message: expect.stringContaining("professional account"),
    });
  });
});

describe("Instagram publishing", () => {
  it("creates a container, waits for it, then publishes", async () => {
    const { fetch, requests } = fakeGraph(publishingRoutes());

    const result = await createProvider(fetch).publishImage(credentials, {
      text: "Fresh beans #coffee",
      images: [image({ altText: "A bag of beans" })],
    });

    expect(formBody(requests[0])).toEqual({
      image_url: "https://cdn.flowpost.test/beans.jpg",
      caption: "Fresh beans #coffee",
      alt_text: "A bag of beans",
    });
    expect(requests[1].url.pathname).toContain("/container-1");
    expect(formBody(requests[2])).toEqual({ creation_id: "container-1" });
    expect(result).toEqual({
      providerPostId: "media-999",
      url: "https://www.instagram.com/p/ABC/",
      publishedAt: NOW,
    });
  });

  it("keeps polling while the media is still processing", async () => {
    const { fetch, requests } = fakeGraph(
      publishingRoutes({ statuses: ["IN_PROGRESS", "IN_PROGRESS", "FINISHED"] }),
    );

    await createProvider(fetch).publishVideo(credentials, {
      text: "Pour-over in 30 seconds",
      format: "short",
      video: video(),
    });

    const polls = requests.filter((request) => request.url.pathname.includes("/container-"));
    expect(polls).toHaveLength(3);
  });

  it("fails without publishing when Meta can't process the media", async () => {
    const { fetch, requests } = fakeGraph(publishingRoutes({ statuses: ["ERROR"] }));

    await expect(
      createProvider(fetch).publishImage(credentials, { images: [image()] }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });

    expect(requests.some((request) => request.url.pathname.endsWith("media_publish"))).toBe(false);
  });

  it("builds a carousel from one container per item plus a parent", async () => {
    const { fetch, requests } = fakeGraph(publishingRoutes());

    await createProvider(fetch).publishImage(credentials, {
      text: "Three ways to brew",
      images: [image(), image({ url: "https://cdn.flowpost.test/b.jpg" }), image()],
    });

    const creates = requests.filter(
      (request) => request.method === "POST" && request.url.pathname.endsWith("/media"),
    );
    expect(creates).toHaveLength(4);
    expect(formBody(creates[0]).is_carousel_item).toBe("true");
    expect(formBody(creates[3])).toEqual({
      media_type: "CAROUSEL",
      children: "container-1,container-2,container-3",
      caption: "Three ways to brew",
    });
  });

  it("rejects a carousel over ten items", async () => {
    const { fetch, requests } = fakeGraph([]);
    await expect(
      createProvider(fetch).publishImage(credentials, {
        images: Array.from({ length: 11 }, () => image()),
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
    expect(requests).toHaveLength(0);
  });

  it("publishes video as a reel, and only shares standard video to the feed", async () => {
    const short = fakeGraph(publishingRoutes());
    await createProvider(short.fetch).publishVideo(credentials, {
      format: "short",
      video: video(),
      text: "",
    });
    expect(formBody(short.requests[0])).toMatchObject({
      media_type: "REELS",
      share_to_feed: "false",
    });

    const standard = fakeGraph(publishingRoutes());
    await createProvider(standard.fetch).publishVideo(credentials, {
      format: "standard",
      video: video(),
      text: "",
    });
    expect(formBody(standard.requests[0]).share_to_feed).toBe("true");
  });

  it("only accepts JPEG, because Instagram won't take anything else", async () => {
    const { fetch, requests } = fakeGraph([]);
    await expect(
      createProvider(fetch).publishImage(credentials, {
        images: [image({ mimeType: "image/png" })],
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
    expect(requests).toHaveLength(0);
  });

  it("insists on a public HTTPS link, since Meta fetches the file itself", async () => {
    const { fetch, requests } = fakeGraph([]);
    await expect(
      createProvider(fetch).publishImage(credentials, {
        images: [image({ url: "http://cdn.flowpost.test/beans.jpg" })],
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST", message: expect.stringContaining("HTTPS") });
    expect(requests).toHaveLength(0);
  });

  it("enforces the caption and hashtag limits locally", async () => {
    const { fetch } = fakeGraph([]);
    const provider = createProvider(fetch);

    await expect(
      provider.publishImage(credentials, { text: "x".repeat(2201), images: [image()] }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });

    const hashtags = Array.from({ length: 31 }, (_, index) => `#tag${index}`).join(" ");
    await expect(
      provider.publishImage(credentials, { text: hashtags, images: [image()] }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
  });

  it("still reports success when the permalink can't be read", async () => {
    const { fetch } = fakeGraph([
      ...publishingRoutes().slice(0, 3),
      route("GET", "/media-999", () => graphError(400, { code: 100 })),
    ]);

    const result = await createProvider(fetch).publishImage(credentials, { images: [image()] });
    expect(result.providerPostId).toBe("media-999");
    expect(result.url).toBeNull();
  });

  it("reads the publishing quota from the account rather than assuming it", async () => {
    const { fetch } = fakeGraph([
      route("GET", `/${IG_ID}/content_publishing_limit`, () =>
        json(200, {
          data: [{ quota_usage: 12, config: { quota_total: 50, quota_duration: 86400 } }],
        }),
      ),
    ]);

    expect(await createProvider(fetch).getPublishingLimit(credentials)).toEqual({
      used: 12,
      total: 50,
    });
  });

  it("has no text-only posting, because Instagram has none", () => {
    const { fetch } = fakeGraph([]);
    const provider = createProvider(fetch);
    expect(provider.supports("TEXT_POST")).toBe(false);
    expect(provider.supports("DELETE_POST")).toBe(false);
  });

  it("implements every capability it declares", () => {
    const { fetch } = fakeGraph([]);
    expect(() => new SocialProviderRegistry([createProvider(fetch)])).not.toThrow();
  });
});
