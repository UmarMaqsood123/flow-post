import type { SocialProvider } from "../provider";
import { createFacebookProvider } from "./facebook.provider";
import { createInstagramProvider } from "./instagram.provider";
import { createLinkedInProvider } from "./linkedin.provider";
import { createTikTokProvider } from "./tiktok.provider";
import { createYouTubeProvider } from "./youtube.provider";

/** One provider per platform. Swap a factory's return value when its integration is built. */
export const createDefaultSocialProviders = (): SocialProvider[] => [
  createLinkedInProvider(),
  createFacebookProvider(),
  createInstagramProvider(),
  createTikTokProvider(),
  createYouTubeProvider(),
];
