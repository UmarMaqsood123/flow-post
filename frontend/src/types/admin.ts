/** Mirrors backend/src/services/admin.service.ts and adminMetrics.service.ts. */
import type {
  BillingInterval,
  Plan,
  PlanFeatures,
  PlanLimits,
  SubscriptionStatus,
} from "./billing";
import type { CreatePlatform } from "./post";

export interface Paged<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export type UserStatus = "active" | "suspended";
export type SystemRole = "user" | "super_admin";
type Money = Record<string, number>;

export interface AdminDashboard {
  generatedAt: string;
  windowDays: number;
  users: {
    total: number;
    active: number;
    new: number;
    suspended: number;
    superAdmins: number;
    paid: number;
  };
  workspaces: { active: number; archived: number };
  subscriptions: {
    byStatus: Record<SubscriptionStatus, number>;
    live: number;
    payingByPlan: Record<Plan, number>;
  };
  revenue: { mrr: Money; atRiskMrr: Money; trialing: number; estimatedFromListPrice: number };
  ai: {
    requests: number;
    failures: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    requestsWithUnknownCost: number;
  };
  socialAccounts: { connected: number; byStatus: Record<string, number> };
  posts: {
    published: number;
    publishedRecent: number;
    failed: number;
    failedPublishesRecent: number;
    needsReview: number;
  };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: SystemRole;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
}

export interface AdminUserRow extends AdminUser {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus | null;
  workspaces: number;
}

export interface AdminSubscription {
  plan: Exclude<Plan, "FREE"> | null;
  interval: BillingInterval | null;
  status: SubscriptionStatus;
  unitAmount: number | null;
  currency: string | null;
  monthlyAmount: number;
  monthlyAmountEstimated: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  scheduledChange: { plan: Plan; interval: BillingInterval; effectiveAt: string } | null;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
}

export interface AuditRecord {
  _id?: string;
  id?: string;
  action: string;
  actorEmail: string | null;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  source: "ADMIN_PANEL" | "CLI";
  ip: string | null;
  createdAt: string;
}

export interface AccountUsage {
  periodStart: string;
  workspaces: number;
  aiGenerations: number;
  scheduledPosts: number;
  storageBytes: number;
}

export interface AdminUserDetails {
  user: AdminUser & { suspendedBy: string | null; activeSessions: number };
  billing: {
    plan: Plan;
    planReason: string;
    limits: PlanLimits;
    stripeCustomerId: string | null;
    subscription: AdminSubscription | null;
    paymentFailedAt: string | null;
    graceUntil: string | null;
    lastPaymentError: string | null;
  };
  usage: AccountUsage;
  ai: { requestsLast30Days: number; estimatedCostUsdLast30Days: number };
  memberships: {
    workspaceId: string;
    name: string;
    status: string | null;
    role: string;
    isBillingOwner: boolean;
    joinedAt: string;
  }[];
  auditHistory: AuditRecord[];
}

export interface AdminWorkspaceRow {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  billingOwner: { id: string; name: string; email: string } | null;
  plan: Plan;
  members: number;
  socialAccounts: number;
}

export interface AdminSocialAccount {
  id: string;
  workspaceId: string;
  workspaceName?: string;
  platform: CreatePlatform;
  accountName: string;
  username: string | null;
  status: string;
  tokenExpiresAt: string | null;
  lastConnectedAt: string | null;
  lastCheckedAt: string | null;
  lastError: { code: string | null; message: string | null; occurredAt: string | null } | null;
  createdAt: string | null;
}

export interface PublishingFailure {
  scheduleId: string;
  postId: string;
  topic: string | null;
  fromAutopilot: boolean;
  workspaceId: string;
  workspaceName: string;
  platform: CreatePlatform;
  scheduledAt: string;
  failedAt: string;
  attempts: number;
  maxAttempts: number;
  needsReview: boolean;
  error: { code: string; message: string } | null;
}

export interface AdminWorkspaceDetails {
  workspace: {
    id: string;
    name: string;
    status: string;
    timezone: string;
    industry: string | null;
    website: string | null;
    createdAt: string;
    archivedAt: string | null;
  };
  billingOwner: { id: string; name: string; email: string; status: UserStatus } | null;
  entitlements: {
    plan: Plan;
    label: string;
    limits: PlanLimits;
    features: PlanFeatures;
    usage: AccountUsage & { socialAccounts: number; teamMembers: number };
  };
  members: {
    userId: string | null;
    name: string;
    email: string | null;
    status: UserStatus | null;
    role: string;
    joinedAt: string;
  }[];
  socialAccounts: AdminSocialAccount[];
  publishing: {
    published: number;
    scheduled: number;
    failed: number;
    failedPublishesLast30Days: number;
  };
  recentFailures: PublishingFailure[];
  autopilot: { status: string; pauseReason: string | null; pausedAt: string | null } | null;
  auditHistory: AuditRecord[];
}

export interface AdminSubscriptionRow {
  accountId: string;
  user: { id: string; name: string; email: string; status: UserStatus } | null;
  effectivePlan: Plan;
  subscription: AdminSubscription | null;
  paymentFailedAt: string | null;
  graceUntil: string | null;
  lastSyncedAt: string | null;
}

export interface AdminSubscriptionDetails extends AdminSubscriptionRow {
  planReason: string;
  stripeCustomerId: string | null;
  lastPaymentError: string | null;
  workspaces: { id: string; name: string; status: string }[];
}

export interface AdminPlans {
  defaultPlan: Plan;
  plans: {
    plan: Plan;
    label: string;
    priceMonthlyUsd: number;
    limits: PlanLimits;
    features: PlanFeatures;
    autopilot: { postsPerWeek: number; platforms: number; postsPerDay: number };
    stripePrices: { month: string | null; year: string | null } | null;
    subscribers: { entitled: number; gracePeriod: number; cancelling: number; pastDue: number };
  }[];
}

interface UsageNumbers {
  requests: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface AdminAIUsage {
  range: { from: string; to: string };
  totals: UsageNumbers;
  byOperation: (UsageNumbers & { operation: string })[];
  byDay: (UsageNumbers & { day: string })[];
  byModel: (UsageNumbers & { model: string })[];
  topWorkspaces: (UsageNumbers & { workspaceId: string; name: string })[];
  topUsers: (UsageNumbers & { userId: string; name: string; email: string | null })[];
  recentFailures: {
    createdAt: string;
    operation: string;
    errorCode: string | null;
    provider: string;
    model: string;
    workspaceId: string;
    workspaceName: string;
    userEmail: string | null;
  }[];
}

export interface WorkspaceUsageRow {
  workspaceId: string;
  name: string;
  status: string;
  aiRequests: number;
  aiGenerations: number;
  aiEstimatedCostUsd: number;
  scheduledPosts: number;
  storageBytes: number;
  files: number;
  socialAccounts: number;
  members: number;
}

export interface UsageInspection {
  scope: "user" | "workspace";
  plan: Plan;
  limits: PlanLimits;
  features: PlanFeatures;
  usage: AccountUsage & { socialAccounts?: number; teamMembers?: number };
  workspaces: WorkspaceUsageRow[];
}

export interface AuditLogRow {
  id: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  source: "ADMIN_PANEL" | "CLI";
  ip: string | null;
  createdAt: string;
}
