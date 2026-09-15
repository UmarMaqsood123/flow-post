import { NotImplementedSocialProvider } from "./notImplemented.provider";

/**
 * YouTube via Google OAuth and the YouTube Data API.
 * Video only (Shorts are vertical videos under the Shorts length limit); analytics via
 * the YouTube Analytics API.
 */
export const createYouTubeProvider = () =>
  new NotImplementedSocialProvider({
    platform: "YOUTUBE",
    displayName: "YouTube",
    capabilities: [
      "VIDEO_POST",
      "SHORT_VIDEO",
      "ANALYTICS",
      "READ_POST",
      "DELETE_POST",
      "TOKEN_REFRESH",
    ],
    oauth: {
      scopes: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
      ],
      usesPkce: true,
    },
    credentialEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    docsUrl: "https://developers.google.com/youtube/v3/guides/uploading_a_video",
  });
