/** Mirrors backend/src/services/billing.service.ts and constants/billing.constant.ts. */
export type Plan = "FREE" | "CREATOR" | "PRO" | "AGENCY";
export type PaidPlan = Exclude<Plan, "FREE">;
export type BillingInterval = "month" | "year";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "paused";
export type PlanReason =
  | "default"
  | "subscription"
  | "grace_period"
  | "payment_overdue"
  | "subscription_inactive"
  | "override";

export interface PlanLimits {
  workspaces: number;
  socialAccountsPerWorkspace: number;
  aiGenerationsPerMonth: number;
  scheduledPostsPerMonth: number;
  teamMembersPerWorkspace: number;
  storageBytes: number;
}

export interface PlanFeatures {
  autopilot: boolean;
  analytics: boolean;
}

export interface PlanOption {
  plan: Plan;
  label: string;
  priceMonthlyUsd: number;
  limits: PlanLimits;
  features: PlanFeatures;
  autopilot: { postsPerWeek: number; platforms: number; postsPerDay: number };
  intervals: BillingInterval[];
}

export interface BillingSubscription {
  plan: PaidPlan | null;
  interval: BillingInterval | null;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  trialEnd: string | null;
  scheduledChange: { plan: PaidPlan; interval: BillingInterval; effectiveAt: string } | null;
}

export interface BillingOverview {
  configured: boolean;
  plan: Plan;
  planReason: PlanReason;
  /** A plan granted outside Stripe; applies only when higher than the subscription's. */
  planOverride: { plan: Plan; expiresAt: string | null } | null;
  subscription: BillingSubscription | null;
  payment: { failedAt: string | null; graceUntil: string | null; error: string | null };
  hasCustomer: boolean;
  usage: {
    periodStart: string;
    workspaces: number;
    aiGenerations: number;
    scheduledPosts: number;
    storageBytes: number;
  };
  workspaces: { id: string; name: string }[];
  plans: PlanOption[];
}

export interface PlanChangeResult {
  overview: BillingOverview;
  warnings: string[];
}

/** The plan covering one workspace, readable by any member. */
export interface WorkspaceEntitlements {
  plan: Plan;
  label: string;
  limits: PlanLimits;
  features: PlanFeatures;
  autopilot: { postsPerWeek: number; platforms: number; postsPerDay: number };
  usage: BillingOverview["usage"] & { socialAccounts: number; teamMembers: number };
  billingOwnerId: string;
  paymentIssue: boolean;
}
