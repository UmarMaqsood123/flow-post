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
    implemented: true,
    description: "Publish to a Facebook Page you manage.",
    supported: [
      "Text posts",
      "Posts with one or several photos",
      "Videos and Reels",
      "Deleting posts FlowPost published",
    ],
    unsupported: ["Personal profiles and groups", "Custom link previews", "Post analytics"],
    setupHint:
      "Facebook isn't configured on this server yet. An administrator needs to add the Meta app credentials.",
    revokeHint:
      "Facebook keeps FlowPost listed until you remove it in Settings → Business integrations, or the access is invalidated.",
  },
  INSTAGRAM: {
    implemented: true,
    description: "Publish to an Instagram professional account linked to a Facebook Page.",
    supported: ["Photo posts", "Carousels of up to 10 items", "Reels"],
    unsupported: [
      "Text-only posts — Instagram needs an image or video",
      "Personal accounts, and scheduling without media",
      "Stories, and deleting published posts",
    ],
    setupHint:
      "Instagram isn't configured on this server yet. An administrator needs to add the Meta app credentials.",
    revokeHint:
      "Access comes from the linked Facebook Page. Remove FlowPost in Facebook's Settings → Business integrations to revoke it.",
  },
  TIKTOK: {
    implemented: true,
    description: "Publish videos to your TikTok account.",
    supported: ["Videos up to 10 minutes"],
    unsupported: [
      "Text-only posts",
      "Photo posts \u2014 they need a verified media domain",
      "Deleting posts",
      "Public posts until TikTok audits the app",
    ],
    setupHint:
      "TikTok isn't configured on this server yet. An administrator needs to add the TikTok app credentials.",
    revokeHint:
      "Remove FlowPost under TikTok's Settings \u2192 Security and permissions \u2192 Manage app permissions to revoke access.",
  },
  YOUTUBE: {
    implemented: true,
    description: "Upload videos and Shorts to your YouTube channel.",
    supported: ["Videos", "Shorts (vertical, three minutes or less)"],
    unsupported: [
      "Text-only posts and images",
      "Deleting videos",
      "Public videos until YouTube audits the app",
    ],
    setupHint:
      "YouTube isn't configured on this server yet. An administrator needs to add the Google OAuth credentials.",
    revokeHint:
      "Remove FlowPost at myaccount.google.com \u2192 Security \u2192 Third-party apps with account access.",
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
