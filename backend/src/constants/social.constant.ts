/** Platforms FlowPost integrates with (each needs a provider in integrations/social/providers). */
export const SOCIAL_PLATFORMS = ["LINKEDIN", "FACEBOOK", "INSTAGRAM", "TIKTOK", "YOUTUBE"] as const;
export type SocialPlatformValue = (typeof SOCIAL_PLATFORMS)[number];

/** URL slug for a platform, e.g. LINKEDIN → "linkedin". */
export const platformSlug = (platform: SocialPlatformValue) => platform.toLowerCase();

/** Frontend page that shows OAuth results. Keep in sync with frontend/src/routing/paths.ts. */
export const FRONTEND_SOCIAL_ACCOUNTS_PATH = "/social-accounts";

export const SocialAccountStatus = {
  /** Tokens are valid (or can be refreshed) and the account can be used. */
  CONNECTED: "CONNECTED",
  /** The access token expired; a refresh will be attempted on next use when supported. */
  EXPIRED: "EXPIRED",
  /** The user must reconnect through OAuth (revoked, refresh failed, scopes changed). */
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  /** Disconnected by a workspace admin; tokens have been deleted. */
  DISCONNECTED: "DISCONNECTED",
  /** The platform reported a problem with the account itself (e.g. restricted). */
  ERROR: "ERROR",
} as const;
export type SocialAccountStatusValue =
  (typeof SocialAccountStatus)[keyof typeof SocialAccountStatus];
export const SOCIAL_ACCOUNT_STATUSES = Object.values(SocialAccountStatus);
