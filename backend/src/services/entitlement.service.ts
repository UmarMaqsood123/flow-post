/**
 * Centralized entitlements: which plan applies, what it allows, how much is used,
 * and the checks every feature calls before doing something that counts.
 *
 * A workspace is covered by its billing owner's plan. The plan comes only from
 * the billing account we keep in sync with Stripe, never from the request.
 */
import type { Types } from "mongoose";
import { env } from "../config/env";
import { AIUsageStatus } from "../constants/ai.constant";
import {
  ENTITLED_STATUSES,
  FEATURE_LABELS,
  type FeatureKey,
  LIMIT_LABELS,
  type LimitKey,
  PLAN_DEFINITIONS,
  PLAN_RANK,
  PLANS,
  type PlanDefinition,
  type PlanValue,
} from "../constants/billing.constant";
import { ErrorCode, HttpStatus } from "../constants/http.constant";
import { SocialAccountStatus } from "../constants/social.constant";
import { InvitationStatus, WorkspaceStatus } from "../constants/workspace.constant";
import { AIUsage } from "../models/aiUsage.model";
import { BillingAccount, type IBillingAccount } from "../models/billingAccount.model";
import { StoredFile } from "../models/file.model";
import { Schedule } from "../models/schedule.model";
import { SocialAccount } from "../models/socialAccount.model";
import { Workspace, type WorkspaceDocument } from "../models/workspace.model";
import { WorkspaceInvitation } from "../models/workspaceInvitation.model";
import { WorkspaceMember } from "../models/workspaceMember.model";
import { AppError } from "../utils/appError.util";

const DAY_MS = 86_400_000;

// ── Which plan applies ─────────────────────────────────────

export interface PlanResolution {
  plan: PlanValue;
  /** Why this plan applies, for the billing page. */
  reason:
    | "default"
    | "subscription"
    | "grace_period"
    | "payment_overdue"
    | "subscription_inactive"
    | "override";
}

/**
 * The plan in force for a billing account right now:
 * - active or trialing: the subscribed plan;
 * - past due: the subscribed plan until the grace period ends, then Free;
 * - anything else (unpaid, canceled, incomplete, paused): Free;
 * - no subscription: the configured default plan.
 */
export const resolvePlan = (
  account:
    | (Pick<IBillingAccount, "subscription" | "graceUntil" | "paymentFailedAt"> & {
        planOverride?: IBillingAccount["planOverride"];
      })
    | null,
  now: Date = new Date(),
): PlanResolution => {
  const fromSubscription = resolveSubscriptionPlan(account, now);
  // A granted plan lifts the account while it lasts, but never lowers it.
  const override = account?.planOverride;
  if (
    override &&
    (!override.expiresAt || override.expiresAt > now) &&
    PLAN_RANK[override.plan] > PLAN_RANK[fromSubscription.plan]
  ) {
    return { plan: override.plan, reason: "override" };
  }
  return fromSubscription;
};

const resolveSubscriptionPlan = (
  account: Pick<IBillingAccount, "subscription" | "graceUntil" | "paymentFailedAt"> | null,
  now: Date,
): PlanResolution => {
  const subscription = account?.subscription;
  if (!subscription || !subscription.plan) {
    // A subscription we can't map to a plan (or none at all) never grants a paid plan.
    return subscription && !ENTITLED_STATUSES.includes(subscription.status)
      ? { plan: "FREE", reason: "subscription_inactive" }
      : { plan: env.BILLING_DEFAULT_PLAN, reason: "default" };
  }
  if (ENTITLED_STATUSES.includes(subscription.status)) {
    return { plan: subscription.plan, reason: "subscription" };
  }
  if (subscription.status === "past_due") {
    const graceUntil =
      account.graceUntil ??
      new Date((account.paymentFailedAt ?? now).getTime() + env.BILLING_GRACE_DAYS * DAY_MS);
    return now < graceUntil
      ? { plan: subscription.plan, reason: "grace_period" }
      : { plan: "FREE", reason: "payment_overdue" };
  }
  return { plan: "FREE", reason: "subscription_inactive" };
};

export const loadAccount = (userId: Types.ObjectId) => BillingAccount.findOne({ user: userId });

export const getUserPlan = async (userId: Types.ObjectId) =>
  resolvePlan(await loadAccount(userId)).plan;

export const billingOwnerOf = (workspace: Pick<WorkspaceDocument, "billingOwner" | "createdBy">) =>
  workspace.billingOwner ?? workspace.createdBy;

export interface WorkspaceEntitlements {
  plan: PlanValue;
  definition: PlanDefinition;
  billingOwner: Types.ObjectId;
  account: Awaited<ReturnType<typeof loadAccount>>;
}

export const getWorkspaceEntitlements = async (
  workspace: Pick<WorkspaceDocument, "billingOwner" | "createdBy">,
): Promise<WorkspaceEntitlements> => {
  const billingOwner = billingOwnerOf(workspace);
  const account = await loadAccount(billingOwner);
  const { plan } = resolvePlan(account);
  return { plan, definition: PLAN_DEFINITIONS[plan], billingOwner, account };
};

/**
 * Usage limits reset with the billing period. Without a paid period (Free, or a
 * lapsed subscription) they reset on the first of each UTC month.
 */
export const usagePeriodStart = (
  account: Pick<IBillingAccount, "subscription"> | null,
  now: Date = new Date(),
): Date => {
  const subscription = account?.subscription;
  if (
    subscription?.currentPeriodStart &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodStart <= now &&
    now < subscription.currentPeriodEnd &&
    subscription.status !== "canceled"
  ) {
    return subscription.currentPeriodStart;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

// ── Usage ──────────────────────────────────────────────────

/** Workspaces this user pays for. Archived ones still hold data, so usage counts them. */
export const billedWorkspaceIds = async (
  userId: Types.ObjectId,
  { activeOnly = false }: { activeOnly?: boolean } = {},
) => {
  const workspaces = await Workspace.find({
    $or: [{ billingOwner: userId }, { billingOwner: null, createdBy: userId }],
    ...(activeOnly ? { status: WorkspaceStatus.ACTIVE } : {}),
  })
    .select("_id")
    .lean();
  return workspaces.map((workspace) => workspace._id);
};

export const countWorkspaces = async (userId: Types.ObjectId) =>
  (await billedWorkspaceIds(userId, { activeOnly: true })).length;

export const countSocialAccounts = (workspaceId: Types.ObjectId) =>
  SocialAccount.countDocuments({
    workspace: workspaceId,
    status: { $ne: SocialAccountStatus.DISCONNECTED },
  });

/** Members plus invitations that could still be accepted. */
export const countTeamSeats = async (workspaceId: Types.ObjectId) => {
  const [members, pending] = await Promise.all([
    WorkspaceMember.countDocuments({ workspace: workspaceId }),
    WorkspaceInvitation.countDocuments({
      workspace: workspaceId,
      status: InvitationStatus.PENDING,
      expiresAt: { $gt: new Date() },
    }),
  ]);
  return members + pending;
};

export const countAIGenerations = async (workspaceIds: Types.ObjectId[], since: Date) =>
  workspaceIds.length === 0
    ? 0
    : AIUsage.countDocuments({
        workspace: { $in: workspaceIds },
        status: AIUsageStatus.SUCCESS,
        createdAt: { $gte: since },
      });

/** Posts, not schedules: moving a post to a new time doesn't use another one. */
export const scheduledPostIds = async (workspaceIds: Types.ObjectId[], since: Date) =>
  workspaceIds.length === 0
    ? []
    : ((await Schedule.distinct("post", {
        workspace: { $in: workspaceIds },
        createdAt: { $gte: since },
      })) as Types.ObjectId[]);

export const storageUsed = async (workspaceIds: Types.ObjectId[]) => {
  if (workspaceIds.length === 0) return 0;
  const [row] = await StoredFile.aggregate<{ total: number }>([
    // The tenancy plugin doesn't cover aggregation, so the workspace match is first.
    { $match: { workspace: { $in: workspaceIds } } },
    { $group: { _id: null, total: { $sum: "$size" } } },
  ]);
  return row?.total ?? 0;
};

// ── Checks ─────────────────────────────────────────────────

/** The cheapest plan that raises this limit above what's needed. */
const upgradeFor = (key: LimitKey, needed: number): PlanValue | null =>
  PLANS.find((plan) => PLAN_DEFINITIONS[plan].limits[key] >= needed) ?? null;

const formatAmount = (key: LimitKey, value: number) =>
  key === "storageBytes" ? `${Math.round((value / 1024 ** 3) * 100) / 100} GB` : String(value);

export const limitError = (
  key: LimitKey,
  plan: PlanValue,
  used: number,
  max: number,
  adding = 1,
) => {
  const upgradePlan = upgradeFor(key, used + adding);
  const upgradeHint =
    upgradePlan && PLAN_RANK[upgradePlan] > PLAN_RANK[plan]
      ? ` Upgrade to ${PLAN_DEFINITIONS[upgradePlan].label} for more.`
      : "";
  return new AppError(
    `Your ${PLAN_DEFINITIONS[plan].label} plan includes ${formatAmount(key, max)} ${LIMIT_LABELS[key]}, and ${formatAmount(key, used)} ${used === 1 ? "is" : "are"} in use.${upgradeHint}`,
    HttpStatus.FORBIDDEN,
    {
      code: ErrorCode.PLAN_LIMIT_REACHED,
      details: { kind: "limit", limit: key, plan, used, max, upgradePlan },
    },
  );
};

export const featureError = (feature: FeatureKey, plan: PlanValue) => {
  const upgradePlan =
    PLANS.find((candidate) => PLAN_DEFINITIONS[candidate].features[feature]) ?? null;
  return new AppError(
    `${FEATURE_LABELS[feature]} isn't included in the ${PLAN_DEFINITIONS[plan].label} plan.${
      upgradePlan ? ` Upgrade to ${PLAN_DEFINITIONS[upgradePlan].label} to use it.` : ""
    }`,
    HttpStatus.FORBIDDEN,
    {
      code: ErrorCode.PLAN_LIMIT_REACHED,
      details: { kind: "feature", feature, plan, upgradePlan },
    },
  );
};

const assertWithin = (key: LimitKey, plan: PlanValue, used: number, adding = 1) => {
  const max = PLAN_DEFINITIONS[plan].limits[key];
  if (used + adding > max) throw limitError(key, plan, used, max, adding);
};

export const assertCanCreateWorkspace = async (userId: Types.ObjectId) => {
  const plan = await getUserPlan(userId);
  assertWithin("workspaces", plan, await countWorkspaces(userId));
};

export const assertCanAddSocialAccount = async (workspace: WorkspaceDocument) => {
  const { plan } = await getWorkspaceEntitlements(workspace);
  assertWithin("socialAccountsPerWorkspace", plan, await countSocialAccounts(workspace._id));
};

export const assertCanAddTeamMember = async (
  workspace: WorkspaceDocument,
  { replacingPending = 0 }: { replacingPending?: number } = {},
) => {
  const { plan } = await getWorkspaceEntitlements(workspace);
  const used = (await countTeamSeats(workspace._id)) - replacingPending;
  assertWithin("teamMembersPerWorkspace", plan, used);
};

export const assertCanGenerateAI = async (workspace: WorkspaceDocument) => {
  const { plan, billingOwner, account } = await getWorkspaceEntitlements(workspace);
  const used = await countAIGenerations(
    await billedWorkspaceIds(billingOwner),
    usagePeriodStart(account),
  );
  assertWithin("aiGenerationsPerMonth", plan, used);
};

/** Rescheduling a post already counted this period is free. */
export const assertCanSchedulePost = async (
  workspace: WorkspaceDocument,
  postId: Types.ObjectId,
) => {
  const { plan, billingOwner, account } = await getWorkspaceEntitlements(workspace);
  const posts = await scheduledPostIds(
    await billedWorkspaceIds(billingOwner),
    usagePeriodStart(account),
  );
  if (posts.some((id) => id.equals(postId))) return;
  assertWithin("scheduledPostsPerMonth", plan, posts.length);
};

/** For publishes that bypass scheduling: allowed only while the period's quota has room. */
export const assertPublishQuota = async (workspace: WorkspaceDocument) => {
  const { plan, billingOwner, account } = await getWorkspaceEntitlements(workspace);
  const posts = await scheduledPostIds(
    await billedWorkspaceIds(billingOwner),
    usagePeriodStart(account),
  );
  assertWithin("scheduledPostsPerMonth", plan, posts.length);
};

export const assertStorageAvailable = async (workspace: WorkspaceDocument, bytes: number) => {
  const { plan, billingOwner } = await getWorkspaceEntitlements(workspace);
  const used = await storageUsed(await billedWorkspaceIds(billingOwner));
  assertWithin("storageBytes", plan, used, bytes);
};

export const hasFeature = async (workspace: WorkspaceDocument, feature: FeatureKey) =>
  (await getWorkspaceEntitlements(workspace)).definition.features[feature];

export const assertFeature = async (workspace: WorkspaceDocument, feature: FeatureKey) => {
  const { plan, definition } = await getWorkspaceEntitlements(workspace);
  if (!definition.features[feature]) throw featureError(feature, plan);
};

// ── Summaries ──────────────────────────────────────────────

export interface UsageSummary {
  periodStart: Date;
  workspaces: number;
  aiGenerations: number;
  scheduledPosts: number;
  storageBytes: number;
}

export const getAccountUsage = async (
  userId: Types.ObjectId,
  account: Pick<IBillingAccount, "subscription"> | null,
): Promise<UsageSummary> => {
  const periodStart = usagePeriodStart(account);
  const ids = await billedWorkspaceIds(userId);
  const [workspaces, aiGenerations, scheduled, storageBytes] = await Promise.all([
    countWorkspaces(userId),
    countAIGenerations(ids, periodStart),
    scheduledPostIds(ids, periodStart),
    storageUsed(ids),
  ]);
  return { periodStart, workspaces, aiGenerations, scheduledPosts: scheduled.length, storageBytes };
};

/** What a workspace member sees: the plan covering it, its limits and current usage. */
export const getWorkspaceSummary = async (workspace: WorkspaceDocument) => {
  const { plan, definition, billingOwner, account } = await getWorkspaceEntitlements(workspace);
  const [usage, socialAccounts, teamMembers] = await Promise.all([
    getAccountUsage(billingOwner, account),
    countSocialAccounts(workspace._id),
    countTeamSeats(workspace._id),
  ]);
  return {
    plan,
    label: definition.label,
    limits: definition.limits,
    features: definition.features,
    autopilot: definition.autopilot,
    usage: { ...usage, socialAccounts, teamMembers },
    billingOwnerId: billingOwner.toString(),
    paymentIssue: resolvePlan(account).reason === "grace_period",
  };
};
