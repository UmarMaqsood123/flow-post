/**
 * Super admin management: search and inspect users, workspaces, subscriptions,
 * social connections and publishing failures, and suspend or reactivate users.
 *
 * Every view of one person's or workspace's details, every usage inspection
 * and every change writes an AuditLog record. Lists and searches don't, since
 * they only show summary rows. Credentials never leave here: social account
 * tokens are never selected and user secrets are stripped by the model.
 */
import type { Request } from "express";
import { Types } from "mongoose";
import { logger } from "../config/logger";
import { AIUsageStatus } from "../constants/ai.constant";
import { RefreshTokenRevokeReason, UserRole, UserStatus } from "../constants/auth.constant";
import { PAID_PLANS, PLAN_DEFINITIONS, PLANS, type PlanValue } from "../constants/billing.constant";
import { PostStatus } from "../constants/post.constant";
import { ScheduleStatus } from "../constants/publishing.constant";
import { SocialAccountStatus } from "../constants/social.constant";
import { AIUsage } from "../models/aiUsage.model";
import { AuditLog } from "../models/auditLog.model";
import { AutopilotSettings } from "../models/autopilotSettings.model";
import { BillingAccount, type IBillingAccount } from "../models/billingAccount.model";
import { StoredFile } from "../models/file.model";
import { Post } from "../models/post.model";
import { RefreshToken } from "../models/refreshToken.model";
import { Schedule } from "../models/schedule.model";
import { SocialAccount } from "../models/socialAccount.model";
import { User, type UserDocument } from "../models/user.model";
import { Workspace } from "../models/workspace.model";
import { WorkspaceMember } from "../models/workspaceMember.model";
import { AppError } from "../utils/appError.util";
import type {
  InspectUsageQuery,
  ListAuditLogsQuery,
  ListPublishingFailuresQuery,
  ListSocialConnectionsQuery,
  ListSubscriptionsQuery,
  ListUsersQuery,
  ListWorkspacesQuery,
} from "../validators/admin.validator";
import * as AuditService from "./audit.service";
import { monthlyAmount } from "./adminMetrics.service";
import { configuredPrices } from "./billing.service";
import * as EntitlementService from "./entitlement.service";
import * as TokenService from "./token.service";

const DAY_MS = 86_400_000;
const unscoped = { skipWorkspaceScope: true } as const;

/** The acting super admin and the request, for audit records. */
export interface AdminActor {
  user: UserDocument;
  request: Request;
}

const searchPattern = (q: string | undefined) =>
  q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

const paged = <T>(items: T[], total: number, page: number, limit: number) => ({
  items,
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});

const oid = (id: string) => new Types.ObjectId(id);

// ── Users ──────────────────────────────────────────────────

const toAdminUser = (user: UserDocument) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status ?? UserStatus.ACTIVE,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt ?? null,
  lastActiveAt: user.lastActiveAt ?? null,
  suspendedAt: user.suspendedAt ?? null,
  suspensionReason: user.suspensionReason ?? null,
});

/** Users whose billing resolves to `plan`, as a query condition on `_id`. */
const planCondition = async (plan: PlanValue) => {
  const accounts = await BillingAccount.find({})
    .select("user subscription graceUntil paymentFailedAt")
    .lean();
  const matching: Types.ObjectId[] = [];
  const other: Types.ObjectId[] = [];
  for (const account of accounts) {
    (EntitlementService.resolvePlan(account).plan === plan ? matching : other).push(account.user);
  }
  // Users without a billing account are on the default plan.
  const defaultPlan = EntitlementService.resolvePlan(null).plan;
  return plan === defaultPlan ? { $nin: other } : { $in: matching };
};

export const listUsers = async ({ page, limit, q, status, role, plan }: ListUsersQuery) => {
  const pattern = searchPattern(q);
  const filter: Record<string, unknown> = {};
  if (pattern) filter.$or = [{ email: pattern }, { name: pattern }];
  if (status) filter.status = status === UserStatus.ACTIVE ? { $ne: UserStatus.SUSPENDED } : status;
  if (role) filter.role = role;
  if (plan) filter._id = await planCondition(plan);

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  const ids = users.map((user) => user._id);
  const [accounts, memberships] = await Promise.all([
    BillingAccount.find({ user: { $in: ids } })
      .select("user subscription graceUntil paymentFailedAt")
      .lean(),
    WorkspaceMember.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { user: { $in: ids } } },
      { $group: { _id: "$user", count: { $sum: 1 } } },
    ]),
  ]);
  const accountByUser = new Map(accounts.map((account) => [account.user.toString(), account]));
  const workspaceCount = new Map(memberships.map((row) => [row._id.toString(), row.count]));

  return paged(
    users.map((user) => {
      const account = accountByUser.get(user.id) ?? null;
      return {
        ...toAdminUser(user),
        plan: EntitlementService.resolvePlan(account).plan,
        subscriptionStatus: account?.subscription?.status ?? null,
        workspaces: workspaceCount.get(user.id) ?? 0,
      };
    }),
    total,
    page,
    limit,
  );
};

const findUser = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound("User not found");
  return user;
};

const publicSubscription = (account: IBillingAccount | null) => {
  const subscription = account?.subscription;
  if (!subscription) return null;
  const monthly = monthlyAmount(subscription);
  return {
    plan: subscription.plan,
    interval: subscription.interval,
    status: subscription.status,
    unitAmount: subscription.unitAmount ?? null,
    currency: subscription.currency ?? null,
    monthlyAmount: monthly.amount,
    monthlyAmountEstimated: monthly.estimated,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    canceledAt: subscription.canceledAt,
    scheduledChange: subscription.scheduledChange,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    stripePriceId: subscription.stripePriceId,
  };
};

const recentAudit = (targetId: Types.ObjectId) =>
  AuditLog.find({ targetId }).sort({ createdAt: -1 }).limit(10).lean();

export const getUserDetails = async ({ user: actor, request }: AdminActor, userId: string) => {
  const user = await findUser(userId);
  const since = new Date(Date.now() - 30 * DAY_MS);

  const [account, memberships, activeSessions, suspendedBy] = await Promise.all([
    BillingAccount.findOne({ user: user._id }),
    // Across workspaces on purpose: the user's memberships everywhere.
    WorkspaceMember.find({ user: user._id }).setOptions(unscoped).lean(),
    RefreshToken.countDocuments({
      user: user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }),
    user.suspendedBy ? User.findById(user.suspendedBy).select("email").lean() : null,
  ]);
  const workspaces = await Workspace.find({
    _id: { $in: memberships.map((membership) => membership.workspace) },
  })
    .select("name status billingOwner createdBy")
    .lean();
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace._id.toString(), workspace]),
  );
  const [ai] = await AIUsage.aggregate<{ requests: number; cost: number }>([
    { $match: { user: user._id, createdAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        requests: { $sum: 1 },
        cost: { $sum: { $ifNull: ["$estimatedCostUsd", 0] } },
      },
    },
  ]);
  const resolution = EntitlementService.resolvePlan(account);

  // Written before the data is returned: no details leave without a record.
  await AuditService.record({
    action: "USER_VIEWED",
    actor,
    targetType: "USER",
    targetId: user._id,
    targetLabel: user.email,
    request,
  });

  return {
    user: {
      ...toAdminUser(user),
      suspendedBy: suspendedBy?.email ?? null,
      activeSessions,
    },
    billing: {
      plan: resolution.plan,
      planReason: resolution.reason,
      limits: PLAN_DEFINITIONS[resolution.plan].limits,
      stripeCustomerId: account?.stripeCustomerId ?? null,
      subscription: publicSubscription(account),
      paymentFailedAt: account?.paymentFailedAt ?? null,
      graceUntil: account?.graceUntil ?? null,
      lastPaymentError: account?.lastPaymentError ?? null,
    },
    usage: await EntitlementService.getAccountUsage(user._id, account),
    ai: { requestsLast30Days: ai?.requests ?? 0, estimatedCostUsdLast30Days: ai?.cost ?? 0 },
    memberships: memberships.map((membership) => {
      const workspace = workspaceById.get(membership.workspace.toString());
      return {
        workspaceId: membership.workspace.toString(),
        name: workspace?.name ?? "Deleted workspace",
        status: workspace?.status ?? null,
        role: membership.role,
        isBillingOwner: workspace
          ? EntitlementService.billingOwnerOf(workspace).equals(user._id)
          : false,
        joinedAt: membership.createdAt,
      };
    }),
    auditHistory: await recentAudit(user._id),
  };
};

/**
 * Suspends a user: blocks sign-in, ends every session, and stops Autopilot
 * acting as them. Workspaces and their scheduled posts are left alone, since
 * they may belong to a whole team. The change and its audit record succeed or
 * fail together.
 */
export const suspendUser = async (
  { user: actor, request }: AdminActor,
  userId: string,
  reason: string,
) => {
  const target = await findUser(userId);
  if (target._id.equals(actor._id)) throw AppError.badRequest("You can't suspend your own account");
  if (target.role === UserRole.SUPER_ADMIN) {
    throw AppError.forbidden(
      "Super admins can't be suspended. Remove the role first with the admin script.",
    );
  }

  const suspended = await User.findOneAndUpdate(
    { _id: target._id, status: { $ne: UserStatus.SUSPENDED } },
    {
      $set: {
        status: UserStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendedBy: actor._id,
        suspensionReason: reason,
      },
      // Invalidates every access token immediately.
      $inc: { tokenVersion: 1 },
    },
    { returnDocument: "after" },
  );
  if (!suspended) throw AppError.conflict("This user is already suspended");

  const activeSessions = await RefreshToken.countDocuments({ user: target._id, revokedAt: null });
  try {
    await AuditService.record({
      action: "USER_SUSPENDED",
      actor,
      targetType: "USER",
      targetId: target._id,
      targetLabel: target.email,
      reason,
      metadata: {
        previousStatus: target.status ?? UserStatus.ACTIVE,
        sessionsEnded: activeSessions,
      },
      request,
    });
  } catch (error) {
    // No audit record, no suspension.
    await User.updateOne(
      { _id: target._id },
      {
        $set: {
          status: target.status ?? UserStatus.ACTIVE,
          suspendedAt: null,
          suspendedBy: null,
          suspensionReason: null,
        },
      },
    );
    throw error;
  }

  await TokenService.revokeAllUserRefreshTokens(target._id, RefreshTokenRevokeReason.SUSPENDED);
  logger.warn({ actorId: actor.id, userId: target.id }, "User suspended");
  return toAdminUser(suspended);
};

export const reactivateUser = async (
  { user: actor, request }: AdminActor,
  userId: string,
  reason: string,
) => {
  const target = await findUser(userId);
  const reactivated = await User.findOneAndUpdate(
    { _id: target._id, status: UserStatus.SUSPENDED },
    {
      $set: {
        status: UserStatus.ACTIVE,
        suspendedAt: null,
        suspendedBy: null,
        suspensionReason: null,
      },
    },
    { returnDocument: "after" },
  );
  if (!reactivated) throw AppError.conflict("This user isn't suspended");

  try {
    await AuditService.record({
      action: "USER_REACTIVATED",
      actor,
      targetType: "USER",
      targetId: target._id,
      targetLabel: target.email,
      reason,
      metadata: {
        suspendedAt: target.suspendedAt ?? null,
        suspensionReason: target.suspensionReason ?? null,
      },
      request,
    });
  } catch (error) {
    await User.updateOne(
      { _id: target._id },
      {
        $set: {
          status: UserStatus.SUSPENDED,
          suspendedAt: target.suspendedAt,
          suspendedBy: target.suspendedBy,
          suspensionReason: target.suspensionReason,
        },
      },
    );
    throw error;
  }
  logger.info({ actorId: actor.id, userId: target.id }, "User reactivated");
  return toAdminUser(reactivated);
};

// ── Workspaces ─────────────────────────────────────────────

export const listWorkspaces = async ({ page, limit, q, status }: ListWorkspacesQuery) => {
  const pattern = searchPattern(q);
  const filter: Record<string, unknown> = {};
  if (pattern) filter.name = pattern;
  if (status) filter.status = status;

  const [workspaces, total] = await Promise.all([
    Workspace.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Workspace.countDocuments(filter),
  ]);
  const ids = workspaces.map((workspace) => workspace._id);
  const ownerIds = workspaces.map((workspace) => EntitlementService.billingOwnerOf(workspace));
  const [owners, accounts, members, social] = await Promise.all([
    User.find({ _id: { $in: ownerIds } })
      .select("name email")
      .lean(),
    BillingAccount.find({ user: { $in: ownerIds } })
      .select("user subscription graceUntil paymentFailedAt")
      .lean(),
    WorkspaceMember.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { workspace: { $in: ids } } },
      { $group: { _id: "$workspace", count: { $sum: 1 } } },
    ]),
    SocialAccount.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { workspace: { $in: ids }, status: { $ne: SocialAccountStatus.DISCONNECTED } } },
      { $group: { _id: "$workspace", count: { $sum: 1 } } },
    ]),
  ]);
  const ownerById = new Map(owners.map((owner) => [owner._id.toString(), owner]));
  const accountByUser = new Map(accounts.map((account) => [account.user.toString(), account]));
  const memberCount = new Map(members.map((row) => [row._id.toString(), row.count]));
  const socialCount = new Map(social.map((row) => [row._id.toString(), row.count]));

  return paged(
    workspaces.map((workspace) => {
      const ownerId = EntitlementService.billingOwnerOf(workspace).toString();
      const owner = ownerById.get(ownerId);
      return {
        id: workspace.id,
        name: workspace.name,
        status: workspace.status,
        createdAt: workspace.createdAt,
        billingOwner: owner ? { id: ownerId, name: owner.name, email: owner.email } : null,
        plan: EntitlementService.resolvePlan(accountByUser.get(ownerId) ?? null).plan,
        members: memberCount.get(workspace.id) ?? 0,
        socialAccounts: socialCount.get(workspace.id) ?? 0,
      };
    }),
    total,
    page,
    limit,
  );
};

const findWorkspace = async (workspaceId: string) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw AppError.notFound("Workspace not found");
  return workspace;
};

/** Safe fields only. Token fields are never selected. */
const SOCIAL_FIELDS =
  "workspace platform accountName username status tokenExpiresAt lastConnectedAt lastCheckedAt lastError disconnectedAt createdAt";

const toAdminSocialAccount = (account: {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  platform: string;
  accountName: string;
  username?: string | null;
  status: string;
  tokenExpiresAt?: Date | null;
  lastConnectedAt?: Date | null;
  lastCheckedAt?: Date | null;
  lastError?: { code?: string; message?: string; occurredAt?: Date } | null;
  createdAt?: Date;
}) => ({
  id: account._id.toString(),
  workspaceId: account.workspace.toString(),
  platform: account.platform,
  accountName: account.accountName,
  username: account.username ?? null,
  status: account.status,
  tokenExpiresAt: account.tokenExpiresAt ?? null,
  lastConnectedAt: account.lastConnectedAt ?? null,
  lastCheckedAt: account.lastCheckedAt ?? null,
  lastError: account.lastError
    ? {
        code: account.lastError.code ?? null,
        message: account.lastError.message ?? null,
        occurredAt: account.lastError.occurredAt ?? null,
      }
    : null,
  createdAt: account.createdAt ?? null,
});

const publishingCounts = async (workspaceIds: Types.ObjectId[], since: Date) => {
  const [rows] = await Post.aggregate<{ published: number; scheduled: number; failed: number }>([
    { $match: { workspace: { $in: workspaceIds } } },
    {
      $group: {
        _id: null,
        published: { $sum: { $cond: [{ $eq: ["$status", PostStatus.PUBLISHED] }, 1, 0] } },
        scheduled: { $sum: { $cond: [{ $eq: ["$status", PostStatus.SCHEDULED] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$status", PostStatus.FAILED] }, 1, 0] } },
      },
    },
  ]);
  const failedRecently = await Schedule.countDocuments({
    workspace: { $in: workspaceIds },
    status: ScheduleStatus.FAILED,
    updatedAt: { $gte: since },
  });
  return {
    published: rows?.published ?? 0,
    scheduled: rows?.scheduled ?? 0,
    failed: rows?.failed ?? 0,
    failedPublishesLast30Days: failedRecently,
  };
};

export const getWorkspaceDetails = async (
  { user: actor, request }: AdminActor,
  workspaceId: string,
) => {
  const workspace = await findWorkspace(workspaceId);
  const since = new Date(Date.now() - 30 * DAY_MS);
  const ownerId = EntitlementService.billingOwnerOf(workspace);

  const [owner, members, social, autopilot, failures, publishing, summary] = await Promise.all([
    User.findById(ownerId).select("name email status").lean(),
    WorkspaceMember.find({ workspace: workspace._id })
      .populate<{ user: UserDocument | null }>("user", "name email status")
      .lean(),
    SocialAccount.find({ workspace: workspace._id }).select(SOCIAL_FIELDS).lean(),
    AutopilotSettings.findOne({ workspace: workspace._id })
      .select("status pauseReason pausedAt")
      .lean(),
    recentFailures({ workspaceIds: [workspace._id], limit: 10 }),
    publishingCounts([workspace._id], since),
    EntitlementService.getWorkspaceSummary(workspace),
  ]);

  await AuditService.record({
    action: "WORKSPACE_VIEWED",
    actor,
    targetType: "WORKSPACE",
    targetId: workspace._id,
    targetLabel: workspace.name,
    request,
  });

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      status: workspace.status,
      timezone: workspace.timezone,
      industry: workspace.industry ?? null,
      website: workspace.website ?? null,
      createdAt: workspace.createdAt,
      archivedAt: workspace.archivedAt ?? null,
    },
    billingOwner: owner
      ? { id: ownerId.toString(), name: owner.name, email: owner.email, status: owner.status }
      : null,
    entitlements: summary,
    members: members.map((member) => ({
      userId: member.user?._id.toString() ?? null,
      name: member.user?.name ?? "Deleted user",
      email: member.user?.email ?? null,
      status: member.user?.status ?? null,
      role: member.role,
      joinedAt: member.createdAt,
    })),
    socialAccounts: social.map(toAdminSocialAccount),
    publishing,
    recentFailures: failures,
    autopilot: autopilot
      ? {
          status: autopilot.status,
          pauseReason: autopilot.pauseReason ?? null,
          pausedAt: autopilot.pausedAt ?? null,
        }
      : null,
    auditHistory: await recentAudit(workspace._id),
  };
};

// ── Subscriptions and plans ────────────────────────────────

export const listSubscriptions = async ({
  page,
  limit,
  q,
  status,
  plan,
  paymentIssue,
}: ListSubscriptionsQuery) => {
  const filter: Record<string, unknown> = { subscription: { $ne: null } };
  if (status) filter["subscription.status"] = status;
  if (plan && plan !== "FREE") filter["subscription.plan"] = plan;
  if (paymentIssue !== undefined) filter.paymentFailedAt = paymentIssue ? { $ne: null } : null;
  const pattern = searchPattern(q);
  if (pattern) {
    const users = await User.find({ $or: [{ email: pattern }, { name: pattern }] })
      .select("_id")
      .limit(500)
      .lean();
    filter.user = { $in: users.map((user) => user._id) };
  }

  const [accounts, total] = await Promise.all([
    BillingAccount.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    BillingAccount.countDocuments(filter),
  ]);
  const users = await User.find({ _id: { $in: accounts.map((account) => account.user) } })
    .select("name email status")
    .lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));

  return paged(
    accounts.map((account) => {
      const user = userById.get(account.user.toString());
      return {
        accountId: account._id.toString(),
        user: user
          ? { id: account.user.toString(), name: user.name, email: user.email, status: user.status }
          : null,
        effectivePlan: EntitlementService.resolvePlan(account).plan,
        subscription: publicSubscription(account),
        paymentFailedAt: account.paymentFailedAt ?? null,
        graceUntil: account.graceUntil ?? null,
        lastSyncedAt: account.lastSyncedAt ?? null,
      };
    }),
    total,
    page,
    limit,
  );
};

export const getSubscriptionDetails = async (
  { user: actor, request }: AdminActor,
  accountId: string,
) => {
  const account = await BillingAccount.findById(accountId);
  if (!account) throw AppError.notFound("Billing account not found");
  const user = await User.findById(account.user).select("name email status").lean();
  const workspaces = await Workspace.find({
    _id: { $in: await EntitlementService.billedWorkspaceIds(account.user) },
  })
    .select("name status")
    .lean();
  const resolution = EntitlementService.resolvePlan(account);

  await AuditService.record({
    action: "SUBSCRIPTION_VIEWED",
    actor,
    targetType: "SUBSCRIPTION",
    targetId: account._id,
    targetLabel: user?.email ?? null,
    request,
  });

  return {
    accountId: account.id,
    user: user
      ? { id: account.user.toString(), name: user.name, email: user.email, status: user.status }
      : null,
    effectivePlan: resolution.plan,
    planReason: resolution.reason,
    stripeCustomerId: account.stripeCustomerId,
    subscription: publicSubscription(account),
    paymentFailedAt: account.paymentFailedAt,
    graceUntil: account.graceUntil,
    lastPaymentError: account.lastPaymentError,
    lastSyncedAt: account.lastSyncedAt,
    workspaces: workspaces.map((workspace) => ({
      id: workspace._id.toString(),
      name: workspace.name,
      status: workspace.status,
    })),
  };
};

export const listPlans = async () => {
  const accounts = await BillingAccount.find({ subscription: { $ne: null } })
    .select("subscription graceUntil paymentFailedAt")
    .lean();
  const counts = Object.fromEntries(
    PLANS.map((plan) => [plan, { entitled: 0, gracePeriod: 0, cancelling: 0, pastDue: 0 }]),
  );
  for (const account of accounts) {
    const resolution = EntitlementService.resolvePlan(account);
    const subscribed = account.subscription?.plan;
    if (resolution.reason === "subscription") counts[resolution.plan].entitled += 1;
    if (resolution.reason === "grace_period") counts[resolution.plan].gracePeriod += 1;
    if (subscribed && account.subscription?.cancelAtPeriodEnd) counts[subscribed].cancelling += 1;
    if (subscribed && account.subscription?.status === "past_due") counts[subscribed].pastDue += 1;
  }
  const prices = configuredPrices();
  const defaultPlan = EntitlementService.resolvePlan(null).plan;

  return {
    defaultPlan,
    plans: PLANS.map((plan) => ({
      plan,
      ...PLAN_DEFINITIONS[plan],
      stripePrices: (PAID_PLANS as readonly string[]).includes(plan)
        ? {
            month: prices[plan as (typeof PAID_PLANS)[number]].month ?? null,
            year: prices[plan as (typeof PAID_PLANS)[number]].year ?? null,
          }
        : null,
      subscribers: counts[plan],
    })),
  };
};

// ── Social connections and publishing ─────────────────────

const workspaceNames = async (ids: Types.ObjectId[]) => {
  const workspaces = await Workspace.find({ _id: { $in: ids } })
    .select("name")
    .lean();
  return new Map(workspaces.map((workspace) => [workspace._id.toString(), workspace.name]));
};

export const listSocialConnections = async ({
  page,
  limit,
  q,
  platform,
  status,
}: ListSocialConnectionsQuery) => {
  const filter: Record<string, unknown> = {};
  const pattern = searchPattern(q);
  if (pattern) filter.$or = [{ accountName: pattern }, { username: pattern }];
  if (platform) filter.platform = platform;
  if (status) filter.status = status;

  const [accounts, total] = await Promise.all([
    SocialAccount.find(filter)
      .select(SOCIAL_FIELDS)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .setOptions(unscoped)
      .lean(),
    SocialAccount.countDocuments(filter).setOptions(unscoped),
  ]);
  const names = await workspaceNames(accounts.map((account) => account.workspace));
  return paged(
    accounts.map((account) => ({
      ...toAdminSocialAccount(account),
      workspaceName: names.get(account.workspace.toString()) ?? "Deleted workspace",
    })),
    total,
    page,
    limit,
  );
};

const recentFailures = async ({
  workspaceIds,
  platform,
  needsReview,
  from,
  to,
  skip = 0,
  limit,
}: {
  workspaceIds?: Types.ObjectId[];
  platform?: string;
  needsReview?: boolean;
  from?: Date;
  to?: Date;
  skip?: number;
  limit: number;
}) => {
  const filter = failureFilter({ workspaceIds, platform, needsReview, from, to });
  const schedules = await Schedule.find(filter)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .setOptions(unscoped)
    .lean();
  const [posts, names] = await Promise.all([
    Post.find({ _id: { $in: schedules.map((schedule) => schedule.post) } })
      .select("brief.topic autopilot")
      .setOptions(unscoped)
      .lean(),
    workspaceNames(schedules.map((schedule) => schedule.workspace)),
  ]);
  const postById = new Map(posts.map((post) => [post._id.toString(), post]));
  return schedules.map((schedule) => {
    const post = postById.get(schedule.post.toString());
    return {
      scheduleId: schedule._id.toString(),
      postId: schedule.post.toString(),
      topic: post?.brief?.topic ?? null,
      fromAutopilot: Boolean(post?.autopilot),
      workspaceId: schedule.workspace.toString(),
      workspaceName: names.get(schedule.workspace.toString()) ?? "Deleted workspace",
      platform: schedule.platform,
      scheduledAt: schedule.scheduledAt,
      failedAt: schedule.updatedAt,
      attempts: schedule.attempts,
      maxAttempts: schedule.maxAttempts,
      needsReview: schedule.needsReview,
      error: schedule.lastError
        ? { code: schedule.lastError.code, message: schedule.lastError.message }
        : null,
    };
  });
};

const failureFilter = ({
  workspaceIds,
  platform,
  needsReview,
  from,
  to,
}: {
  workspaceIds?: Types.ObjectId[];
  platform?: string;
  needsReview?: boolean;
  from?: Date;
  to?: Date;
}) => {
  const filter: Record<string, unknown> = { status: ScheduleStatus.FAILED };
  if (workspaceIds) filter.workspace = { $in: workspaceIds };
  if (platform) filter.platform = platform;
  if (needsReview !== undefined) filter.needsReview = needsReview;
  if (from || to) {
    filter.updatedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  }
  return filter;
};

export const listPublishingFailures = async ({
  page,
  limit,
  platform,
  needsReview,
  workspaceId,
  from,
  to,
}: ListPublishingFailuresQuery) => {
  const scope = {
    workspaceIds: workspaceId ? [oid(workspaceId)] : undefined,
    platform,
    needsReview,
    from,
    to,
  };
  const [items, total] = await Promise.all([
    recentFailures({ ...scope, skip: (page - 1) * limit, limit }),
    Schedule.countDocuments(failureFilter(scope)).setOptions(unscoped),
  ]);
  return paged(items, total, page, limit);
};

// ── Usage inspection ───────────────────────────────────────

const workspaceUsage = async (workspaceIds: Types.ObjectId[], since: Date) => {
  if (workspaceIds.length === 0) return [];
  const [workspaces, ai, scheduled, storage, social, members] = await Promise.all([
    Workspace.find({ _id: { $in: workspaceIds } })
      .select("name status")
      .lean(),
    AIUsage.aggregate<{ _id: Types.ObjectId; requests: number; successes: number; cost: number }>([
      { $match: { workspace: { $in: workspaceIds }, createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$workspace",
          requests: { $sum: 1 },
          successes: { $sum: { $cond: [{ $eq: ["$status", AIUsageStatus.SUCCESS] }, 1, 0] } },
          cost: { $sum: { $ifNull: ["$estimatedCostUsd", 0] } },
        },
      },
    ]),
    Schedule.aggregate<{ _id: Types.ObjectId; posts: number }>([
      { $match: { workspace: { $in: workspaceIds }, createdAt: { $gte: since } } },
      { $group: { _id: { workspace: "$workspace", post: "$post" } } },
      { $group: { _id: "$_id.workspace", posts: { $sum: 1 } } },
    ]),
    StoredFile.aggregate<{ _id: Types.ObjectId; bytes: number; files: number }>([
      { $match: { workspace: { $in: workspaceIds } } },
      { $group: { _id: "$workspace", bytes: { $sum: "$size" }, files: { $sum: 1 } } },
    ]),
    SocialAccount.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          workspace: { $in: workspaceIds },
          status: { $ne: SocialAccountStatus.DISCONNECTED },
        },
      },
      { $group: { _id: "$workspace", count: { $sum: 1 } } },
    ]),
    WorkspaceMember.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { workspace: { $in: workspaceIds } } },
      { $group: { _id: "$workspace", count: { $sum: 1 } } },
    ]),
  ]);
  const byId = <T extends { _id: Types.ObjectId }>(rows: T[]) =>
    new Map(rows.map((row) => [row._id.toString(), row]));
  const aiById = byId(ai);
  const scheduledById = byId(scheduled);
  const storageById = byId(storage);
  const socialById = byId(social);
  const membersById = byId(members);

  return workspaces.map((workspace) => {
    const id = workspace._id.toString();
    return {
      workspaceId: id,
      name: workspace.name,
      status: workspace.status,
      aiRequests: aiById.get(id)?.requests ?? 0,
      aiGenerations: aiById.get(id)?.successes ?? 0,
      aiEstimatedCostUsd: aiById.get(id)?.cost ?? 0,
      scheduledPosts: scheduledById.get(id)?.posts ?? 0,
      storageBytes: storageById.get(id)?.bytes ?? 0,
      files: storageById.get(id)?.files ?? 0,
      socialAccounts: socialById.get(id)?.count ?? 0,
      members: membersById.get(id)?.count ?? 0,
    };
  });
};

/**
 * Current usage against the plan, broken down by workspace, for one user
 * (everything they pay for) or one workspace (and its billing owner's totals).
 */
export const inspectUsage = async (
  { user: actor, request }: AdminActor,
  query: InspectUsageQuery,
) => {
  if (query.userId) {
    const user = await findUser(query.userId);
    const account = await BillingAccount.findOne({ user: user._id });
    const resolution = EntitlementService.resolvePlan(account);
    const usage = await EntitlementService.getAccountUsage(user._id, account);
    const breakdown = await workspaceUsage(
      await EntitlementService.billedWorkspaceIds(user._id),
      usage.periodStart,
    );
    await AuditService.record({
      action: "USAGE_INSPECTED",
      actor,
      targetType: "USER",
      targetId: user._id,
      targetLabel: user.email,
      request,
    });
    return {
      scope: "user" as const,
      user: { id: user.id, name: user.name, email: user.email },
      plan: resolution.plan,
      limits: PLAN_DEFINITIONS[resolution.plan].limits,
      features: PLAN_DEFINITIONS[resolution.plan].features,
      usage,
      workspaces: breakdown,
    };
  }

  const workspace = await findWorkspace(query.workspaceId!);
  const summary = await EntitlementService.getWorkspaceSummary(workspace);
  const [breakdown] = await workspaceUsage([workspace._id], summary.usage.periodStart);
  await AuditService.record({
    action: "USAGE_INSPECTED",
    actor,
    targetType: "WORKSPACE",
    targetId: workspace._id,
    targetLabel: workspace.name,
    request,
  });
  return {
    scope: "workspace" as const,
    workspace: { id: workspace.id, name: workspace.name },
    plan: summary.plan,
    limits: summary.limits,
    features: summary.features,
    usage: summary.usage,
    billingOwnerId: summary.billingOwnerId,
    workspaces: breakdown ? [breakdown] : [],
  };
};

// ── Audit log ──────────────────────────────────────────────

export const listAuditLogs = async ({
  page,
  limit,
  action,
  targetType,
  targetId,
  actorId,
}: ListAuditLogsQuery) => {
  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;
  if (targetType) filter.targetType = targetType;
  if (targetId) filter.targetId = oid(targetId);
  if (actorId) filter.actor = oid(actorId);
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  return paged(
    items.map((item) => ({
      id: item._id.toString(),
      action: item.action,
      actorId: item.actor?.toString() ?? null,
      actorEmail: item.actorEmail,
      targetType: item.targetType,
      targetId: item.targetId.toString(),
      targetLabel: item.targetLabel,
      reason: item.reason,
      metadata: item.metadata,
      source: item.source,
      ip: item.ip,
      createdAt: item.createdAt,
    })),
    total,
    page,
    limit,
  );
};
