import type { SocialOperations } from "./provider";
import type { VideoFormat } from "./types";

export const SOCIAL_CAPABILITIES = [
  "TEXT_POST",
  "IMAGE_POST",
  "VIDEO_POST",
  "SHORT_VIDEO",
  "CAROUSEL",
  "ANALYTICS",
  "READ_POST",
  "DELETE_POST",
  "TOKEN_REFRESH",
] as const;
export type SocialCapability = (typeof SOCIAL_CAPABILITIES)[number];

export const SocialCapability = {
  TEXT_POST: "TEXT_POST",
  IMAGE_POST: "IMAGE_POST",
  VIDEO_POST: "VIDEO_POST",
  SHORT_VIDEO: "SHORT_VIDEO",
  CAROUSEL: "CAROUSEL",
  ANALYTICS: "ANALYTICS",
  READ_POST: "READ_POST",
  DELETE_POST: "DELETE_POST",
  TOKEN_REFRESH: "TOKEN_REFRESH",
} as const satisfies Record<SocialCapability, SocialCapability>;

/**
 * The provider method behind each capability. The registry uses it to reject
 * providers that declare a capability without implementing the method.
 */
export const CAPABILITY_METHODS: Record<SocialCapability, keyof SocialOperations> = {
  TEXT_POST: "publishText",
  IMAGE_POST: "publishImage",
  CAROUSEL: "publishImage",
  VIDEO_POST: "publishVideo",
  SHORT_VIDEO: "publishVideo",
  ANALYTICS: "getAnalytics",
  READ_POST: "getPost",
  DELETE_POST: "deletePost",
  TOKEN_REFRESH: "refreshAccessToken",
};

/** Human-readable names for error messages. */
export const CAPABILITY_LABELS: Record<SocialCapability, string> = {
  TEXT_POST: "text posts",
  IMAGE_POST: "image posts",
  VIDEO_POST: "video posts",
  SHORT_VIDEO: "short-form video",
  CAROUSEL: "carousels",
  ANALYTICS: "analytics",
  READ_POST: "reading posts",
  DELETE_POST: "deleting posts",
  TOKEN_REFRESH: "token refresh",
};

/** One image is an image post; several make a carousel. */
export const requiredCapabilityForImages = (imageCount: number): SocialCapability =>
  imageCount > 1 ? SocialCapability.CAROUSEL : SocialCapability.IMAGE_POST;

export const requiredCapabilityForVideo = (format: VideoFormat): SocialCapability =>
  format === "short" ? SocialCapability.SHORT_VIDEO : SocialCapability.VIDEO_POST;
