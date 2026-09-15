import { formatRelativeTime } from "@/lib/format";
import type {
  ConnectablePlatform,
  SocialAccountStatus,
  SocialCapability,
} from "@/types/socialAccount";

interface PlatformDetails {
  /** False for platforms whose integration isn't built yet. */
  implemented: boolean;
  description: string;
  supported: string[];
  unsupported: string[];
  /** Shown to explain an unavailable (not configured) implemented platform. */
  setupHint?: string;
  /** Shown when disconnecting: how to remove FlowPost's access on the platform itself. */
  revokeHint?: string;
}

/** What each integration really supports — keep in sync with the backend providers. */
export const PLATFORM_DETAILS: Record<ConnectablePlatform, PlatformDetails> = {
  LINKEDIN: {
    implemented: true,
    description: "Publish to your personal LinkedIn profile.",
    supported: ["Text posts", "Posts with one JPG or PNG image"],
    unsupported: ["Company pages", "Videos and multi-image posts", "Post analytics"],
    setupHint:
      "LinkedIn isn't configured on this server yet. An administrator needs to add the LinkedIn app credentials.",
    revokeHint:
      "LinkedIn keeps FlowPost listed as a permitted app until you remove it in LinkedIn's Settings → Data privacy → Permitted services, or the access expires.",
  },
  FACEBOOK: {
    implemented: false,
    description: "Publish to Facebook Pages you manage.",
    supported: [],
    unsupported: [],
  },
  INSTAGRAM: {
    implemented: false,
    description: "Publish to Instagram professional accounts.",
    supported: [],
    unsupported: [],
  },
  TIKTOK: {
    implemented: false,
    description: "Publish videos and photo posts to TikTok.",
    supported: [],
    unsupported: [],
  },
  YOUTUBE: {
    implemented: false,
    description: "Upload videos and Shorts to your YouTube channel.",
    supported: [],
    unsupported: [],
  },
};

export type StatusTone = "success" | "warning" | "danger" | "neutral";

export const ACCOUNT_STATUS_DETAILS: Record<
  SocialAccountStatus,
  { label: string; tone: StatusTone; description: string }
> = {
  CONNECTED: { label: "Connected", tone: "success", description: "" },
  EXPIRED: {
    label: "Expired",
    tone: "warning",
    description: "Access has expired. Reconnect to keep publishing to this account.",
  },
  REAUTH_REQUIRED: {
    label: "Reconnect required",
    tone: "warning",
    description: "The platform needs you to sign in again and approve access.",
  },
  DISCONNECTED: { label: "Disconnected", tone: "neutral", description: "" },
  ERROR: {
    label: "Needs attention",
    tone: "danger",
    description:
      "The platform reported a problem with this account. Check the account on the platform, then reconnect.",
  },
};

const PUBLISH_LABELS: Partial<Record<SocialCapability, string>> = {
  TEXT_POST: "Text",
  IMAGE_POST: "Images",
  CAROUSEL: "Multiple images",
  VIDEO_POST: "Videos",
  SHORT_VIDEO: "Short videos",
};

export const publishCapabilityLabels = (capabilities: SocialCapability[]) =>
  capabilities.flatMap((capability) => PUBLISH_LABELS[capability] ?? []).join(", ");

const DAY_MS = 86_400_000;

export const describeTokenExpiry = (tokenExpiresAt: string | null) => {
  if (!tokenExpiresAt) return { label: "Doesn't expire", soon: false, expired: false };
  const remaining = new Date(tokenExpiresAt).getTime() - Date.now();
  if (remaining <= 0) return { label: "Expired", soon: true, expired: true };
  return {
    label: `Expires ${formatRelativeTime(tokenExpiresAt)}`,
    soon: remaining < 7 * DAY_MS,
    expired: false,
  };
};

/** Messages for `?error=` after the OAuth redirect (see backend socialAccount.controller.ts). */
export const CONNECT_ERROR_MESSAGES: Record<string, string> = {
  cancelled: "The connection was cancelled on the platform. Nothing was connected.",
  expired:
    "That connection request expired or was finished in a different browser. Please try again.",
  permission:
    "The platform didn't grant permission to post. Try again and approve all requested permissions.",
  forbidden: "You no longer have permission to connect accounts in this workspace.",
  unavailable: "This platform isn't available right now.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  failed: "Something went wrong while connecting. Please try again.",
};

export const platformNameFromSlug = (slug: string | null) => {
  const platform = slug?.toUpperCase() as ConnectablePlatform | undefined;
  return platform && platform in PLATFORM_DETAILS
    ? {
        LINKEDIN: "LinkedIn",
        FACEBOOK: "Facebook",
        INSTAGRAM: "Instagram",
        TIKTOK: "TikTok",
        YOUTUBE: "YouTube",
      }[platform]
    : "Social";
};
