/**
 * Platform-wide numbers for the super admin dashboard and AI usage report.
 * Read-only aggregates across every workspace; nothing here returns content
 * or credentials.
 */
import { Types } from "mongoose";
import { AIUsageStatus } from "../constants/ai.constant";
import { UserRole, UserStatus } from "../constants/auth.constant";
import {
  ENTITLED_STATUSES,
  PLAN_DEFINITIONS,
  PLANS,
  type PlanValue,
  SUBSCRIPTION_STATUSES,
} from "../constants/billing.constant";
import { PostStatus } from "../constants/post.constant";
import { ScheduleStatus } from "../constants/publishing.constant";
import { SocialAccountStatus } from "../constants/social.constant";
import { WorkspaceStatus } from "../constants/workspace.constant";
import { AIUsage } from "../models/aiUsage.model";
import { BillingAccount, type IBillingAccount } from "../models/billingAccount.model";
import { Post } from "../models/post.model";
import { Schedule } from "../models/schedule.model";
import { SocialAccount } from "../models/socialAccount.model";
import { User } from "../models/user.model";
import { Workspace } from "../models/workspace.model";
import { AppError } from "../utils/appError.util";
import type { AIUsageQuery } from "../validators/admin.validator";
import { resolvePlan } from "./entitlement.service";

const DAY_MS = 86_400_000;
const unscoped = { skipWorkspaceScope: true } as const;
const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

// ── Revenue ────────────────────────────────────────────────

/**
 * Monthly recurring revenue from what Stripe charges. Yearly prices count as a
 * twelfth per month. A subscription synced before amounts were stored uses the
 * plan's list price and is counted in `estimatedFromListPrice`.
 */
export const monthlyAmount = (subscription: NonNullable<IBillingAccount["subscription"]>) => {
  const months = subscription.interval === "year" ? 12 : 1;
  if (subscription.unitAmount !== null && subscription.unitAmount !== undefined) {
    return {
      amount: (subscription.unitAmount * (subscription.quantity ?? 1)) / 100 / months,
      currency: subscription.currency ?? "usd",
      estimated: false,
    };
  }
  const listPrice = subscription.plan ? PLAN_DEFINITIONS[subscription.plan].priceMonthlyUsd : 0;
  return { amount: listPrice, currency: "usd", estimated: true };
};

const revenue = async () => {
  const accounts = await BillingAccount.find({
    "subscription.status": { $in: ["active", "trialing", "past_due", "unpaid"] },
  })
    .select("subscription graceUntil paymentFailedAt")
    .lean();

  const mrr: Record<string, number> = {};
  const atRiskMrr: Record<string, number> = {};
  let estimatedFromListPrice = 0;
  let trialing = 0;
  const payingByPlan: Partial<Record<PlanValue, number>> = {};
  let paidUsers = 0;

  for (const account of accounts) {
    const subscription = account.subscription!;
    const resolution = resolvePlan(account);
    if (
      resolution.plan !== "FREE" &&
      ["subscription", "grace_period"].includes(resolution.reason)
    ) {
      paidUsers += 1;
      payingByPlan[resolution.plan] = (payingByPlan[resolution.plan] ?? 0) + 1;
    }
    // Trials aren't revenue yet.
    if (subscription.status === "trialing") {
      trialing += 1;
      continue;
    }
    const { amount, currency, estimated } = monthlyAmount(subscription);
    if (estimated) estimatedFromListPrice += 1;
    const bucket = subscription.status === "active" ? mrr : atRiskMrr;
    bucket[currency] = round((bucket[currency] ?? 0) + amount);
  }
  return { mrr, atRiskMrr, estimatedFromListPrice, trialing, paidUsers, payingByPlan };
};

// ── Dashboard ──────────────────────────────────────────────

export const getDashboard = async (now: Date = new Date()) => {
  const since = new Date(now.getTime() - 30 * DAY_MS);

  const [
    totalUsers,
    activeUsers,
    newUsers,
    suspendedUsers,
    superAdmins,
    activeWorkspaces,
    archivedWorkspaces,
    subscriptionStatuses,
    money,
    aiTotals,
    socialStatuses,
    publishedTotal,
    publishedRecent,
    failedPosts,
    failedSchedulesRecent,
    needsReview,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({
      $or: [{ lastActiveAt: { $gte: since } }, { lastLoginAt: { $gte: since } }],
    }),
    User.countDocuments({ createdAt: { $gte: since } }),
    User.countDocuments({ status: UserStatus.SUSPENDED }),
    User.countDocuments({ role: UserRole.SUPER_ADMIN }),
    Workspace.countDocuments({ status: WorkspaceStatus.ACTIVE }),
    Workspace.countDocuments({ status: WorkspaceStatus.ARCHIVED }),
    BillingAccount.aggregate<{ _id: string; count: number }>([
      { $match: { "subscription.status": { $exists: true } } },
      { $group: { _id: "$subscription.status", count: { $sum: 1 } } },
    ]),
    revenue(),
    AIUsage.aggregate<{
      requests: number;
      failures: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
      unknownCost: number;
    }>([
      // Every workspace on purpose: this is the platform-wide report.
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          failures: { $sum: { $cond: [{ $eq: ["$status", AIUsageStatus.FAILURE] }, 1, 0] } },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
          cost: { $sum: { $ifNull: ["$estimatedCostUsd", 0] } },
          unknownCost: { $sum: { $cond: [{ $eq: ["$estimatedCostUsd", null] }, 1, 0] } },
        },
      },
    ]),
    SocialAccount.aggregate<{ _id: string; count: number }>([
      { $match: {} },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Post.countDocuments({ status: PostStatus.PUBLISHED }).setOptions(unscoped),
    Post.countDocuments({ status: PostStatus.PUBLISHED, publishedAt: { $gte: since } }).setOptions(
      unscoped,
    ),
    Post.countDocuments({ status: PostStatus.FAILED }).setOptions(unscoped),
    Schedule.countDocuments({
      status: ScheduleStatus.FAILED,
      updatedAt: { $gte: since },
    }).setOptions(unscoped),
    Schedule.countDocuments({ status: ScheduleStatus.FAILED, needsReview: true }).setOptions(
      unscoped,
    ),
  ]);

  const byStatus = Object.fromEntries(SUBSCRIPTION_STATUSES.map((status) => [status, 0]));
  for (const row of subscriptionStatuses) byStatus[row._id] = row.count;
  const social = Object.fromEntries(
    Object.values(SocialAccountStatus).map((status) => [status, 0]),
  );
  for (const row of socialStatuses) social[row._id] = row.count;
  const ai = aiTotals[0];

  return {
    generatedAt: now,
    windowDays: 30,
    users: {
      total: totalUsers,
      active: activeUsers,
      new: newUsers,
      suspended: suspendedUsers,
      superAdmins,
      paid: money.paidUsers,
    },
    workspaces: { active: activeWorkspaces, archived: archivedWorkspaces },
    subscriptions: {
      byStatus,
      live: ENTITLED_STATUSES.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0),
      payingByPlan: Object.fromEntries(PLANS.map((plan) => [plan, money.payingByPlan[plan] ?? 0])),
    },
    revenue: {
      mrr: money.mrr,
      atRiskMrr: money.atRiskMrr,
      trialing: money.trialing,
      estimatedFromListPrice: money.estimatedFromListPrice,
    },
    ai: {
      requests: ai?.requests ?? 0,
      failures: ai?.failures ?? 0,
      inputTokens: ai?.inputTokens ?? 0,
      outputTokens: ai?.outputTokens ?? 0,
      estimatedCostUsd: round(ai?.cost ?? 0, 4),
      requestsWithUnknownCost: ai?.unknownCost ?? 0,
    },
    socialAccounts: {
      connected: social[SocialAccountStatus.CONNECTED] ?? 0,
      byStatus: social,
    },
    posts: {
      published: publishedTotal,
      publishedRecent,
      failed: failedPosts,
      failedPublishesRecent: failedSchedulesRecent,
      needsReview,
    },
  };
};

// ── AI usage report ────────────────────────────────────────

const MAX_RANGE_DAYS = 366;

export const getAIUsageReport = async (query: AIUsageQuery, now: Date = new Date()) => {
  const to = query.to ?? now;
  const from = query.from ?? new Date(to.getTime() - 30 * DAY_MS);
  if (from >= to) throw AppError.badRequest("The start date must be before the end date");
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw AppError.badRequest(`Choose a range of at most ${MAX_RANGE_DAYS} days`);
  }

  const match: Record<string, unknown> = { createdAt: { $gte: from, $lt: to } };
  if (query.operation) match.operation = query.operation;
  if (query.status) match.status = query.status;
  if (query.workspaceId) match.workspace = new Types.ObjectId(query.workspaceId);
  if (query.userId) match.user = new Types.ObjectId(query.userId);

  const sums = {
    requests: { $sum: 1 },
    failures: { $sum: { $cond: [{ $eq: ["$status", AIUsageStatus.FAILURE] }, 1, 0] } },
    inputTokens: { $sum: "$inputTokens" },
    outputTokens: { $sum: "$outputTokens" },
    cost: { $sum: { $ifNull: ["$estimatedCostUsd", 0] } },
  };
  type Row = {
    _id: unknown;
    requests: number;
    failures: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };

  const [facet] = await AIUsage.aggregate<{
    totals: Row[];
    byOperation: Row[];
    byDay: Row[];
    byModel: Row[];
    topWorkspaces: Row[];
    topUsers: Row[];
    recentFailures: {
      createdAt: Date;
      operation: string;
      errorCode: string | null;
      provider: string;
      model: string;
      workspace: Types.ObjectId;
      user: Types.ObjectId;
    }[];
  }>([
    { $match: match },
    {
      $facet: {
        totals: [{ $group: { _id: null, ...sums } }],
        byOperation: [{ $group: { _id: "$operation", ...sums } }, { $sort: { cost: -1 } }],
        byDay: [
          {
            $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, ...sums },
          },
          { $sort: { _id: 1 } },
        ],
        byModel: [{ $group: { _id: "$model", ...sums } }, { $sort: { cost: -1 } }],
        topWorkspaces: [
          { $group: { _id: "$workspace", ...sums } },
          { $sort: { cost: -1, requests: -1 } },
          { $limit: 10 },
        ],
        topUsers: [
          { $group: { _id: "$user", ...sums } },
          { $sort: { cost: -1, requests: -1 } },
          { $limit: 10 },
        ],
        recentFailures: [
          { $match: { status: AIUsageStatus.FAILURE } },
          { $sort: { createdAt: -1 } },
          { $limit: 20 },
          {
            $project: {
              createdAt: 1,
              operation: 1,
              errorCode: 1,
              provider: 1,
              model: 1,
              workspace: 1,
              user: 1,
            },
          },
        ],
      },
    },
  ]);

  const workspaceIds = [
    ...facet.topWorkspaces.map((row) => row._id),
    ...facet.recentFailures.map((row) => row.workspace),
  ];
  const userIds = [
    ...facet.topUsers.map((row) => row._id),
    ...facet.recentFailures.map((row) => row.user),
  ];
  const [workspaces, users] = await Promise.all([
    Workspace.find({ _id: { $in: workspaceIds } })
      .select("name")
      .lean(),
    User.find({ _id: { $in: userIds } })
      .select("name email")
      .lean(),
  ]);
  const workspaceName = new Map(workspaces.map((item) => [item._id.toString(), item.name]));
  const userById = new Map(users.map((item) => [item._id.toString(), item]));

  const shape = (row: Row) => ({
    requests: row.requests,
    failures: row.failures,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    estimatedCostUsd: round(row.cost, 4),
  });

  return {
    range: { from, to },
    totals: facet.totals[0]
      ? shape(facet.totals[0])
      : { requests: 0, failures: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    byOperation: facet.byOperation.map((row) => ({ operation: row._id as string, ...shape(row) })),
    byDay: facet.byDay.map((row) => ({ day: row._id as string, ...shape(row) })),
    byModel: facet.byModel.map((row) => ({ model: row._id as string, ...shape(row) })),
    topWorkspaces: facet.topWorkspaces.map((row) => ({
      workspaceId: String(row._id),
      name: workspaceName.get(String(row._id)) ?? "Deleted workspace",
      ...shape(row),
    })),
    topUsers: facet.topUsers.map((row) => {
      const user = userById.get(String(row._id));
      return {
        userId: String(row._id),
        name: user?.name ?? "Deleted user",
        email: user?.email ?? null,
        ...shape(row),
      };
    }),
    recentFailures: facet.recentFailures.map((row) => ({
      createdAt: row.createdAt,
      operation: row.operation,
      errorCode: row.errorCode,
      provider: row.provider,
      model: row.model,
      workspaceId: row.workspace.toString(),
      workspaceName: workspaceName.get(row.workspace.toString()) ?? "Deleted workspace",
      userEmail: userById.get(row.user.toString())?.email ?? null,
    })),
  };
};
