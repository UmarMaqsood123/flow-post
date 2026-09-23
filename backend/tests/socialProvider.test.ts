import { describe, expect, it } from "vitest";
import {
  requiredCapabilityForImages,
  requiredCapabilityForVideo,
  type SocialCapability,
} from "../src/integrations/social/capabilities";
import { SocialProviderError } from "../src/integrations/social/errors";
import { BaseSocialProvider } from "../src/integrations/social/provider";
import { createDefaultSocialProviders } from "../src/integrations/social/providers";
import { FacebookProvider } from "../src/integrations/social/providers/facebook.provider";
import { InstagramProvider } from "../src/integrations/social/providers/instagram.provider";
import { LinkedInProvider } from "../src/integrations/social/providers/linkedin.provider";
import { TikTokProvider } from "../src/integrations/social/providers/tiktok.provider";
import { YouTubeProvider } from "../src/integrations/social/providers/youtube.provider";
import {
  findUnimplementedCapabilities,
  SocialProviderRegistry,
} from "../src/integrations/social/registry";
import type {
  AuthorizationRequest,
  OAuthConnection,
  ProviderCredentials,
  ProviderOAuthConfig,
  SocialProfile,
} from "../src/integrations/social/types";
import { MockSocialProvider } from "./helpers/mockSocialProvider";

/** Implements only OAuth and profile; capabilities are whatever the test declares. */
class MinimalProvider extends BaseSocialProvider {
  readonly platform = "FACEBOOK" as const;
  readonly displayName = "Minimal";
  readonly oauth: ProviderOAuthConfig = { scopes: [], usesPkce: false };
  readonly capabilities: ReadonlySet<SocialCapability>;

  constructor(capabilities: SocialCapability[]) {
    super();
    this.capabilities = new Set(capabilities);
  }

  isAvailable() {
    return true;
  }

  getAuthorizationUrl(): Promise<AuthorizationRequest> {
    return Promise.resolve({ url: "https://minimal.test/authorize" });
  }

  handleOAuthCallback(): Promise<OAuthConnection> {
    return Promise.reject(new Error("not used"));
  }

  getProfile(): Promise<SocialProfile> {
    return Promise.reject(new Error("not used"));
  }
}

const credentials: ProviderCredentials = {
  accessToken: "token",
  providerAccountId: "account",
  metadata: {},
};

describe("SocialProviderRegistry", () => {
  it("looks up providers by platform and lists them in platform order", () => {
    const youtube = new MockSocialProvider({ platform: "YOUTUBE" });
    const linkedin = new MockSocialProvider({ platform: "LINKEDIN" });
    const registry = new SocialProviderRegistry([youtube, linkedin]);

    expect(registry.list().map((provider) => provider.platform)).toEqual(["LINKEDIN", "YOUTUBE"]);
    expect(registry.get("YOUTUBE")).toBe(youtube);
    expect(registry.has("TIKTOK")).toBe(false);

    let lookupError: unknown;
    try {
      registry.get("TIKTOK");
    } catch (error) {
      lookupError = error;
    }
    expect(lookupError).toBeInstanceOf(SocialProviderError);
    expect(lookupError).toMatchObject({ kind: "NOT_CONFIGURED", platform: "TIKTOK" });
  });

  it("allows only one provider per platform", () => {
    const registry = new SocialProviderRegistry([new MockSocialProvider({ platform: "TIKTOK" })]);
    expect(() => registry.register(new MockSocialProvider({ platform: "TIKTOK" }))).toThrow(
      /already registered/,
    );
  });

  it("rejects providers that declare capabilities they don't implement", () => {
    const dishonest = new MinimalProvider(["TEXT_POST", "ANALYTICS"]);
    expect(findUnimplementedCapabilities(dishonest)).toEqual(["TEXT_POST", "ANALYTICS"]);
    expect(() => new SocialProviderRegistry([dishonest])).toThrow(/TEXT_POST, ANALYTICS/);

    expect(() => new SocialProviderRegistry([new MinimalProvider([])])).not.toThrow();
  });
});

describe("BaseSocialProvider", () => {
  it("rejects every operation the provider doesn't support", async () => {
    const provider = new MinimalProvider([]);
    expect(provider.supports("TEXT_POST")).toBe(false);

    const unsupported = { kind: "UNSUPPORTED_CAPABILITY", platform: "FACEBOOK" };
    await expect(provider.publishText(credentials, { text: "Hi" })).rejects.toMatchObject(
      unsupported,
    );
    await expect(
      provider.publishImage(credentials, {
        images: [{ url: "https://x.test/a.png", mimeType: "image/png" }],
      }),
    ).rejects.toMatchObject(unsupported);
    await expect(
      provider.publishVideo(credentials, {
        video: { url: "https://x.test/v.mp4", mimeType: "video/mp4" },
        format: "short",
      }),
    ).rejects.toMatchObject(unsupported);
    await expect(provider.getPost(credentials, "1")).rejects.toMatchObject(unsupported);
    await expect(provider.deletePost(credentials, "1")).rejects.toMatchObject(unsupported);
    await expect(provider.getAnalytics(credentials, {})).rejects.toMatchObject(unsupported);
    await expect(provider.refreshAccessToken("refresh")).rejects.toMatchObject(unsupported);
  });
});

describe("Default providers", () => {
  const registry = new SocialProviderRegistry(createDefaultSocialProviders());

  it("registers every platform, none configured in tests", () => {
    expect(registry.list().map((provider) => provider.platform)).toEqual([
      "LINKEDIN",
      "FACEBOOK",
      "INSTAGRAM",
      "TIKTOK",
      "YOUTUBE",
    ]);
    expect(registry.get("LINKEDIN")).toBeInstanceOf(LinkedInProvider);
    expect(registry.get("FACEBOOK")).toBeInstanceOf(FacebookProvider);
    expect(registry.get("INSTAGRAM")).toBeInstanceOf(InstagramProvider);
    expect(registry.get("TIKTOK")).toBeInstanceOf(TikTokProvider);
    expect(registry.get("YOUTUBE")).toBeInstanceOf(YouTubeProvider);
    // vitest.config.mts blanks every platform credential.
    expect(registry.list().every((provider) => !provider.isAvailable())).toBe(true);
  });

  it("declares different capabilities per platform", () => {
    const matrix = Object.fromEntries(
      registry.list().map((provider) => [provider.platform, [...provider.capabilities].sort()]),
    );
    expect(matrix).toEqual({
      // LinkedIn analytics need the partner-only Community Management API.
      LINKEDIN: ["IMAGE_POST", "TEXT_POST", "TOKEN_REFRESH"],
      FACEBOOK: [
        "ANALYTICS",
        "CAROUSEL",
        "DELETE_POST",
        "IMAGE_POST",
        "READ_POST",
        "SHORT_VIDEO",
        "TEXT_POST",
        "VIDEO_POST",
      ],
      // Instagram has no text-only post and can't delete published media.
      // Token refresh is for Instagram Login; Page tokens don't expire.
      INSTAGRAM: [
        "ANALYTICS",
        "CAROUSEL",
        "IMAGE_POST",
        "READ_POST",
        "SHORT_VIDEO",
        "TOKEN_REFRESH",
        "VIDEO_POST",
      ],
      // TikTok photo posts need a verified media domain, so they aren't built.
      TIKTOK: ["ANALYTICS", "SHORT_VIDEO", "TOKEN_REFRESH", "VIDEO_POST"],
      // Deleting needs a broader Google scope than uploading asks for.
      YOUTUBE: ["ANALYTICS", "READ_POST", "SHORT_VIDEO", "TOKEN_REFRESH", "VIDEO_POST"],
    });
    // Both use a confidential server-side flow, so neither needs PKCE.
    expect(registry.get("TIKTOK").oauth.usesPkce).toBe(false);
    expect(registry.get("YOUTUBE").oauth.usesPkce).toBe(false);
  });

  it("says a provider isn't configured rather than pretending to work", async () => {
    for (const provider of registry.list()) {
      await expect(
        provider.getAuthorizationUrl({ state: "state", redirectUri: "https://app.test/callback" }),
      ).rejects.toMatchObject({ kind: "NOT_CONFIGURED", platform: provider.platform });
    }
  });

  it("rejects publishing a kind of content the platform doesn't have", async () => {
    // Every video-only platform refuses text rather than inventing a post.
    for (const platform of ["INSTAGRAM", "TIKTOK", "YOUTUBE"] as const) {
      await expect(
        registry.get(platform).publishText(credentials, { text: "Hi" }),
      ).rejects.toMatchObject({ kind: "UNSUPPORTED_CAPABILITY", platform });
    }
  });
});

describe("Capability helpers", () => {
  it("picks the capability a publish request needs", () => {
    expect(requiredCapabilityForImages(1)).toBe("IMAGE_POST");
    expect(requiredCapabilityForImages(4)).toBe("CAROUSEL");
    expect(requiredCapabilityForVideo("standard")).toBe("VIDEO_POST");
    expect(requiredCapabilityForVideo("short")).toBe("SHORT_VIDEO");
  });
});

describe("MockSocialProvider", () => {
  it("runs OAuth with PKCE, publishing and token refresh through the abstraction", async () => {
    const provider = new MockSocialProvider({ usesPkce: true });
    const request = await provider.getAuthorizationUrl({
      state: "state-value",
      redirectUri: "https://app.test/callback",
    });
    expect(request.codeVerifier).toBeDefined();

    const approval = provider.approve(request.url);
    expect(approval.state).toBe("state-value");
    await expect(
      provider.handleOAuthCallback({
        code: approval.code,
        redirectUri: "https://app.test/callback",
        codeVerifier: "wrong",
      }),
    ).rejects.toMatchObject({ kind: "INVALID_REQUEST" });

    const retry = provider.approve(request.url);
    const { tokens, profile } = await provider.handleOAuthCallback({
      code: retry.code,
      redirectUri: "https://app.test/callback",
      codeVerifier: request.codeVerifier,
    });
    const creds = {
      accessToken: tokens.accessToken,
      providerAccountId: profile.providerAccountId,
      metadata: {},
    };

    const published = await provider.publishText(creds, { text: "Hello" });
    await expect(provider.getPost(creds, published.providerPostId)).resolves.toMatchObject({
      text: "Hello",
    });

    const refreshed = await provider.refreshAccessToken(tokens.refreshToken ?? "");
    expect(refreshed.accessToken).not.toBe(tokens.accessToken);
    await expect(provider.refreshAccessToken(tokens.refreshToken ?? "")).rejects.toMatchObject({
      kind: "REAUTH_REQUIRED",
    });

    provider.revokeAccessTokens();
    await expect(provider.publishText(creds, { text: "Again" })).rejects.toMatchObject({
      kind: "TOKEN_EXPIRED",
    });
  });
});
