/** Mirrors the social account API (backend/src/models/socialAccount.model.ts, services/socialAccount.service.ts). */

export type ConnectablePlatform = "LINKEDIN" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "YOUTUBE";

export type SocialAccountStatus =
  "CONNECTED" | "EXPIRED" | "REAUTH_REQUIRED" | "DISCONNECTED" | "ERROR";

export type SocialCapability =
  | "TEXT_POST"
  | "IMAGE_POST"
  | "VIDEO_POST"
  | "SHORT_VIDEO"
  | "CAROUSEL"
  | "ANALYTICS"
  | "READ_POST"
  | "DELETE_POST"
  | "TOKEN_REFRESH";

export interface SocialPlatformInfo {
  platform: ConnectablePlatform;
  displayName: string;
  /** Implemented and configured on the server. */
  available: boolean;
  capabilities: SocialCapability[];
}

/**
 * One account a pending authorization could connect. Platforms where a single
 * login covers several destinations (Facebook Pages, Instagram professional
 * accounts) ask the user to choose.
 */
export interface ConnectionTarget {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  description: string | null;
}

export interface ConnectionChoices {
  platform: ConnectablePlatform;
  targets: ConnectionTarget[];
}

/** Never contains tokens — the API only returns this public shape. */
export interface SocialAccount {
  id: string;
  workspaceId: string;
  platform: ConnectablePlatform;
  providerAccountId: string;
  accountName: string;
  username: string | null;
  profileImage: string | null;
  status: SocialAccountStatus;
  scopes: string[];
  capabilities: SocialCapability[];
  tokenExpiresAt: string | null;
  lastConnectedAt: string;
  lastRefreshedAt: string | null;
  lastCheckedAt: string | null;
  lastError: { code: string; message: string; occurredAt: string } | null;
  createdAt: string;
  updatedAt: string;
}
