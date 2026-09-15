import { NotImplementedSocialProvider } from "./notImplemented.provider";

/**
 * Instagram professional accounts via the Instagram Graph API (content publishing).
 * Every post needs media — no text-only posts — and the API can't delete published media.
 */
export const createInstagramProvider = () =>
  new NotImplementedSocialProvider({
    platform: "INSTAGRAM",
    displayName: "Instagram",
    capabilities: ["IMAGE_POST", "CAROUSEL", "VIDEO_POST", "SHORT_VIDEO", "ANALYTICS", "READ_POST"],
    oauth: {
      scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
      usesPkce: false,
    },
    credentialEnv: ["META_APP_ID", "META_APP_SECRET"],
    docsUrl: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
  });
