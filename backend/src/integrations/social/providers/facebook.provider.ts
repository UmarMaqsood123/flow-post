import { NotImplementedSocialProvider } from "./notImplemented.provider";

/**
 * Facebook Pages via the Graph API.
 * Planned: Facebook Login, then long-lived Page access tokens (no refresh tokens —
 * users reconnect when a token is invalidated). Reels cover short-form video.
 */
export const createFacebookProvider = () =>
  new NotImplementedSocialProvider({
    platform: "FACEBOOK",
    displayName: "Facebook",
    capabilities: [
      "TEXT_POST",
      "IMAGE_POST",
      "CAROUSEL",
      "VIDEO_POST",
      "SHORT_VIDEO",
      "ANALYTICS",
      "READ_POST",
      "DELETE_POST",
    ],
    oauth: {
      scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
      usesPkce: false,
    },
    credentialEnv: ["META_APP_ID", "META_APP_SECRET"],
    docsUrl: "https://developers.facebook.com/docs/pages-api/posts",
  });
