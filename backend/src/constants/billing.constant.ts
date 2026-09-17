/**
 * Plans and what each one allows. This is the single source of truth for
 * entitlements: every limit the backend enforces is read from here, through
 * EntitlementService, never from anything the client sends.
 */
export const PLANS = ["FREE", "CREATOR", "PRO", "AGENCY"] as const;
export type PlanValue = (typeof PLANS)[number];
export const PAID_PLANS = ["CREATOR", "PRO", "AGENCY"] as const;
export type PaidPlanValue = (typeof PAID_PLANS)[number];

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingIntervalValue = (typeof BILLING_INTERVALS)[number];

/** Higher is more. Used to tell an upgrade from a downgrade. */
export const PLAN_RANK: Record<PlanValue, number> = { FREE: 0, CREATOR: 1, PRO: 2, AGENCY: 3 };

const MB = 1024 * 1024;
const GB = 1024 * MB;

export interface PlanLimits {
  /** Active workspaces the billing owner can own. */
  workspaces: number;
  /** Connected social accounts per workspace. */
  socialAccountsPerWorkspace: number;
  /** Successful AI generations per billing period, across the owner's workspaces. */
  aiGenerationsPerMonth: number;
  /** Posts scheduled to publish per billing period, across the owner's workspaces. */
  scheduledPostsPerMonth: number;
  /** Members plus pending invitations per workspace, owner included. */
  teamMembersPerWorkspace: number;
  /** Media library storage across the owner's workspaces. */
  storageBytes: number;
}

export interface PlanFeatures {
  autopilot: boolean;
  analytics: boolean;
}

export interface AutopilotLimits {
  postsPerWeek: number;
  platforms: number;
  postsPerDay: number;
}

export interface PlanDefinition {
  label: string;
  /** Display only. Stripe prices are the source of truth for what's charged. */
  priceMonthlyUsd: number;
  limits: PlanLimits;
  features: PlanFeatures;
  autopilot: AutopilotLimits;
}

export const PLAN_DEFINITIONS: Record<PlanValue, PlanDefinition> = {
  FREE: {
    label: "Free",
    priceMonthlyUsd: 0,
    limits: {
      workspaces: 1,
      socialAccountsPerWorkspace: 3,
      aiGenerationsPerMonth: 30,
      scheduledPostsPerMonth: 30,
      teamMembersPerWorkspace: 1,
      storageBytes: 500 * MB,
    },
    features: { autopilot: false, analytics: false },
    autopilot: { postsPerWeek: 0, platforms: 0, postsPerDay: 0 },
  },
  CREATOR: {
    label: "Creator",
    priceMonthlyUsd: 19,
    limits: {
      workspaces: 1,
      socialAccountsPerWorkspace: 5,
      aiGenerationsPerMonth: 300,
      scheduledPostsPerMonth: 150,
      teamMembersPerWorkspace: 2,
      storageBytes: 5 * GB,
    },
    features: { autopilot: true, analytics: true },
    autopilot: { postsPerWeek: 3, platforms: 2, postsPerDay: 3 },
  },
  PRO: {
    label: "Pro",
    priceMonthlyUsd: 49,
    limits: {
      workspaces: 3,
      socialAccountsPerWorkspace: 15,
      aiGenerationsPerMonth: 1500,
      scheduledPostsPerMonth: 1000,
      teamMembersPerWorkspace: 5,
      storageBytes: 25 * GB,
    },
    features: { autopilot: true, analytics: true },
    autopilot: { postsPerWeek: 14, platforms: 5, postsPerDay: 10 },
  },
  AGENCY: {
    label: "Agency",
    priceMonthlyUsd: 149,
    limits: {
      workspaces: 25,
      socialAccountsPerWorkspace: 50,
      aiGenerationsPerMonth: 10_000,
      scheduledPostsPerMonth: 10_000,
      teamMembersPerWorkspace: 25,
      storageBytes: 200 * GB,
    },
    features: { autopilot: true, analytics: true },
    autopilot: { postsPerWeek: 50, platforms: 5, postsPerDay: 30 },
  },
};

export type LimitKey = keyof PlanLimits;
export type FeatureKey = keyof PlanFeatures;

export const LIMIT_LABELS: Record<LimitKey, string> = {
  workspaces: "workspaces",
  socialAccountsPerWorkspace: "connected social accounts in this workspace",
  aiGenerationsPerMonth: "AI generations this billing period",
  scheduledPostsPerMonth: "scheduled posts this billing period",
  teamMembersPerWorkspace: "team members in this workspace",
  storageBytes: "media storage",
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  autopilot: "Autopilot",
  analytics: "Analytics and insights",
};

/** Stripe subscription statuses, as Stripe names them. */
export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const;
export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUSES)[number];

/** Statuses where the subscription is paid up and its plan applies. */
export const ENTITLED_STATUSES: SubscriptionStatusValue[] = ["active", "trialing"];
/** Statuses that will never become active again. */
export const TERMINAL_STATUSES: SubscriptionStatusValue[] = ["canceled", "incomplete_expired"];

export const WEBHOOK_EVENT_STATUSES = ["PROCESSING", "PROCESSED", "FAILED"] as const;
export type WebhookEventStatusValue = (typeof WEBHOOK_EVENT_STATUSES)[number];
