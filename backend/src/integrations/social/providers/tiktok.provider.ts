import { NotImplementedSocialProvider } from "./notImplemented.provider";

/**
 * TikTok via Login Kit (PKCE) and the Content Posting API.
 * Video-first; photo posts support one or more images. No delete or text-only posts.
 */
export const createTikTokProvider = () =>
  new NotImplementedSocialProvider({
    platform: "TIKTOK",
    displayName: "TikTok",
    capabilities: ["VIDEO_POST", "SHORT_VIDEO", "IMAGE_POST", "CAROUSEL", "TOKEN_REFRESH"],
    oauth: { scopes: ["user.info.basic", "video.publish"], usesPkce: true },
    credentialEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  });
