import type { Types } from "mongoose";
import { logger } from "../config/logger";
import {
  ANALYTICS_METRICS,
  type AnalyticsMetric,
  AnalyticsScope,
  COLLECTION_INTERVAL_HOURS,
  ENGAGEMENT_METRICS,
  PLATFORM_ANALYTICS_NOTES,
  PLATFORM_METRICS,
  POST_COLLECTION_WINDOW_DAYS,
} from "../constants/analytics.constant";
import { type CreatePlatformValue, PostStatus } from "../constants/post.constant";
import { SocialAccountStatus } from "../constants/social.constant";
import { SocialProviderError } from "../integrations/social/errors";
import { getSocialProviderRegistry } from "../integrations/social/registry";
import { AnalyticsSnapshot } from "../models/analyticsSnapshot.model";
import { Post } from "../models/post.model";
import { Schedule } from "../models/schedule.model";
import { SocialAccount } from "../models/socialAccount.model";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import * as SocialAccountService from "./socialAccount.service";
import { Workspace } from "../models/workspace.model";
import * as EntitlementService from "./entitlement.service";
import { WorkspaceStatus } from "../constants/workspace.constant";

const DAY_MS = 86_400_000;
const unscoped = { skipWorkspaceScope: true } as const;

/** `YYYY-MM-DD` in UTC: the key that keeps one snapshot per entity per day. */
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const metricsOf = (snapshot: { metrics: unknown }): Partial<Record<AnalyticsMetric, number>> => {
  const metrics = snapshot.metrics;
  // Mongoose returns a Map for a Map-typed field, and a plain object from .lean().
  if (metrics instanceof Map) return Object.fromEntries(metrics) as Record<AnalyticsMetric, number>;
  return (metrics ?? {}) as Partial<Record<AnalyticsMetric, number>>;
};

/** Engagement counts only the interactions a platform actually reported. */
export const engagementOf = (metrics: Partial<Record<AnalyticsMetric, number>>): number =>
  ENGAGEMENT_METRICS.reduce((total, metric) => total + (metrics[metric] ?? 0), 0);

// ── Collection ─────────────────────────────────────────────

interface CollectionResult {
  collected: number;
  skipped: number;
  failed: number;
}

/**
 * Reads current metrics for one workspace and stores them as today's snapshot.
 *
 * Platforms report lifetime totals rather than per-day figures, so this is run
 * on a schedule and the series is built by comparing days. Re-running on the
 * same day overwrites that day's reading instead of adding another.
 */
export const collectWorkspaceAnalytics = async (
  workspaceId: Types.ObjectId,
  { now = new Date() }: { now?: Date } = {},
): Promise<CollectionResult> => {
  const registry = getSocialProviderRegistry();
  const accounts = await SocialAccount.find({
    workspace: workspaceId,
    status: SocialAccountStatus.CONNECTED,
  });

  const result: CollectionResult = { collected: 0, skipped: 0, failed: 0 };

  for (const account of accounts) {
    const platform = account.platform as CreatePlatformValue;
    if (!registry.has(platform) || !registry.get(platform).supports("ANALYTICS")) {
      result.skipped += 1;
      continue;
    }

    // Account-level first: the follower count is the same call for every post.
    const accountLevel = await capture(workspaceId, account.id, platform, null, null, now);
    if (accountLevel.ok) result.collected += 1;
    else result.failed += 1;
    // Throttled or disconnected: every post call would fail the same way and
    // spend more of the platform's rate limit, so this account waits for the next sweep.
    if (accountLevel.stopAccount) continue;

    const posts = await publishedPosts(workspaceId, account._id, now);
    for (const { postId, providerPostId } of posts) {
      const captured = await capture(
        workspaceId,
        account.id,
        platform,
        postId,
        providerPostId,
        now,
      );
      if (captured.ok) result.collected += 1;
      else result.failed += 1;
      if (captured.stopAccount) break;
    }
  }

  return result;
};

/** Published posts still worth asking about: recent enough that counters move. */
const publishedPosts = async (
  workspaceId: Types.ObjectId,
  socialAccountId: Types.ObjectId,
  now: Date,
) => {
  const since = new Date(now.getTime() - POST_COLLECTION_WINDOW_DAYS * DAY_MS);
  const schedules = await Schedule.find({
    workspace: workspaceId,
    socialAccount: socialAccountId,
    publishedAt: { $gte: since },
    "result.providerPostId": { $ne: null },
  })
    .select("post result publishedAt")
    .lean();

  return schedules.flatMap((schedule) => {
    const providerPostId = schedule.result?.providerPostId;
    return providerPostId ? [{ postId: schedule.post, providerPostId }] : [];
  });
};

/** Failures that apply to the whole account, not just one post. */
const ACCOUNT_STOPPING_KINDS = new Set([
  "RATE_LIMITED",
  "TOKEN_EXPIRED",
  "REAUTH_REQUIRED",
  "PERMISSION_DENIED",
  "ACCOUNT_RESTRICTED",
]);

/** One provider call, stored as today's snapshot. */
const capture = async (
  workspaceId: Types.ObjectId,
  accountId: string,
  platform: CreatePlatformValue,
  postId: Types.ObjectId | null,
  providerPostId: string | null,
  now: Date,
): Promise<{ ok: boolean; stopAccount: boolean }> => {
  try {
    const result = await SocialAccountService.getAnalyticsForAccount(workspaceId, accountId, {
      providerPostId: providerPostId ?? undefined,
    });

    await AnalyticsSnapshot.findOneAndUpdate(
      {
        workspace: workspaceId,
        socialAccount: accountId,
        scope: postId ? AnalyticsScope.POST : AnalyticsScope.ACCOUNT,
        providerPostId,
        capturedOn: dayKey(now),
      },
      {
        $set: {
          platform,
          post: postId,
          metrics: result.metrics,
          raw: result.raw,
          capturedAt: result.fetchedAt,
          periodStart: result.periodStart,
          periodEnd: result.periodEnd,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    return { ok: true, stopAccount: false };
  } catch (error) {
    // One unavailable account or deleted post must not stop the rest.
    logger.warn(
      {
        err: error,
        workspaceId: workspaceId.toString(),
        platform,
        providerPostId,
        kind: error instanceof SocialProviderError ? error.kind : undefined,
      },
      "Analytics collection failed for one entity",
    );
    const code =
      error instanceof SocialProviderError
        ? error.kind
        : (error as { cause?: unknown }).cause instanceof SocialProviderError
          ? ((error as { cause: SocialProviderError }).cause.kind as string)
          : null;
    return { ok: false, stopAccount: code !== null && ACCOUNT_STOPPING_KINDS.has(code) };
  }
};

/** Workspaces with a connected account on a platform that reports analytics. */
export const workspacesToCollect = async (): Promise<Types.ObjectId[]> => {
  const registry = getSocialProviderRegistry();
  const platforms = registry
    .list()
    .filter((provider) => provider.supports("ANALYTICS"))
    .map((provider) => provider.platform);
  if (platforms.length === 0) return [];

  const ids = (await SocialAccount.distinct("workspace", {
    status: SocialAccountStatus.CONNECTED,
    platform: { $in: platforms },
  }).setOptions(unscoped)) as Types.ObjectId[];
  // Archived workspaces aren't collected: nobody can see the numbers.
  return (await Workspace.distinct("_id", {
    _id: { $in: ids },
    status: WorkspaceStatus.ACTIVE,
  })) as Types.ObjectId[];
};

/**
 * Collects every workspace whose metrics are stale.
 *
 * This reuses the worker's existing sweep loop rather than adding a second
 * scheduler: there is no per-workspace timing to honour, only "this hasn't been
 * read for a while", so a queue of delayed jobs would buy nothing.
 */
export const collectDueAnalytics = async ({ now = new Date() }: { now?: Date } = {}): Promise<
  CollectionResult & { workspaces: number }
> => {
  const due = new Date(now.getTime() - COLLECTION_INTERVAL_HOURS * 3_600_000);
  const workspaces = await workspacesToCollect();
  const total: CollectionResult & { workspaces: number } = {
    workspaces: 0,
    collected: 0,
    skipped: 0,
    failed: 0,
  };

  for (const workspaceId of workspaces) {
    const latest = await AnalyticsSnapshot.findOne({ workspace: workspaceId })
      .sort({ capturedAt: -1 })
      .select("capturedAt")
      .lean();
    if (latest && latest.capturedAt > due) continue;
    // Plans without analytics aren't collected: it spends platform rate limits for nothing.
    const workspace = await Workspace.findById(workspaceId).select("billingOwner createdBy");
    if (!workspace || !(await EntitlementService.hasFeature(workspace, "analytics"))) continue;

    const result = await collectWorkspaceAnalytics(workspaceId, { now });
    total.workspaces += 1;
    total.collected += result.collected;
    total.skipped += result.skipped;
    total.failed += result.failed;
  }
  return total;
};

// ── Reporting ──────────────────────────────────────────────

export interface AnalyticsQueryInput {
  from: Date;
  to: Date;
  platform?: CreatePlatformValue[];
}

export interface MetricTotals {
  /** Only metrics at least one connected platform reported. */
  totals: Partial<Record<AnalyticsMetric, number>>;
  engagement: number;
}

export interface AnalyticsReport {
  range: { from: string; to: string };
  totals: MetricTotals;
  /** Which metrics are reported by the platforms this workspace has connected. */
  availableMetrics: AnalyticsMetric[];
  /** Metrics the user asked about that no connected platform reports. */
  unavailableMetrics: AnalyticsMetric[];
  followerGrowth: {
    platform: CreatePlatformValue;
    accountName: string;
    first: number | null;
    last: number | null;
    change: number | null;
  }[];
  series: { date: string; engagement: number; views: number }[];
  topPosts: {
    postId: string;
    platform: CreatePlatformValue;
    topic: string;
    pillar: string | null;
    publishedAt: string | null;
    url: string | null;
    engagement: number;
    metrics: Partial<Record<AnalyticsMetric, number>>;
  }[];
  bestPlatform: { platform: CreatePlatformValue; engagement: number; posts: number } | null;
  bestPillar: { pillar: string; engagement: number; posts: number } | null;
  bestTimes: { weekday: number; hour: number; engagement: number; posts: number }[];
  platformNotes: { platform: CreatePlatformValue; note: string }[];
  /** True when nothing has been collected yet, so the page can say so. */
  isEmpty: boolean;
}

/**
 * The latest snapshot per post within a range, which is what "performance over
 * this period" means for lifetime counters: the most recent reading we have.
 */
const latestPostSnapshots = async (
  workspaceId: Types.ObjectId,
  { from, to, platform }: AnalyticsQueryInput,
) =>
  AnalyticsSnapshot.aggregate<{
    _id: Types.ObjectId;
    platform: CreatePlatformValue;
    metrics: Record<string, number>;
    capturedAt: Date;
  }>([
    // The tenancy plugin doesn't cover aggregation, so the workspace match is first.
    {
      $match: {
        workspace: workspaceId,
        scope: AnalyticsScope.POST,
        post: { $ne: null },
        capturedAt: { $gte: from, $lte: to },
        ...(platform?.length ? { platform: { $in: platform } } : {}),
      },
    },
    { $sort: { capturedAt: -1 } },
    {
      $group: {
        _id: "$post",
        platform: { $first: "$platform" },
        metrics: { $first: "$metrics" },
        capturedAt: { $first: "$capturedAt" },
      },
    },
  ]);

const emptyReport = (from: Date, to: Date, available: AnalyticsMetric[]): AnalyticsReport => ({
  range: { from: from.toISOString(), to: to.toISOString() },
  totals: { totals: {}, engagement: 0 },
  availableMetrics: available,
  unavailableMetrics: ANALYTICS_METRICS.filter((metric) => !available.includes(metric)),
  followerGrowth: [],
  series: [],
  topPosts: [],
  bestPlatform: null,
  bestPillar: null,
  bestTimes: [],
  platformNotes: [],
  isEmpty: true,
});

export const getReport = async (
  { workspace }: WorkspaceContext,
  input: AnalyticsQueryInput,
): Promise<AnalyticsReport> => {
  const accounts = await SocialAccount.find({
    workspace: workspace._id,
    status: { $ne: SocialAccountStatus.DISCONNECTED },
  })
    .select("platform accountName")
    .lean();

  const connectedPlatforms = [
    ...new Set(accounts.map((account) => account.platform as CreatePlatformValue)),
  ];
  const availableMetrics = ANALYTICS_METRICS.filter((metric) =>
    connectedPlatforms.some((platform) => PLATFORM_METRICS[platform].includes(metric)),
  );

  const snapshots = await latestPostSnapshots(workspace._id, input);
  if (snapshots.length === 0) {
    return {
      ...emptyReport(input.from, input.to, availableMetrics),
      platformNotes: notesFor(connectedPlatforms),
      followerGrowth: await followerGrowth(workspace._id, input),
    };
  }

  const posts = await Post.find({
    workspace: workspace._id,
    _id: { $in: snapshots.map((snapshot) => snapshot._id) },
  })
    .select("platform pillar publishedAt brief.topic")
    .lean();
  const postById = new Map(posts.map((post) => [post._id.toString(), post]));

  const urls = await Schedule.find({
    workspace: workspace._id,
    post: { $in: snapshots.map((snapshot) => snapshot._id) },
  })
    .select("post result")
    .lean();
  const urlByPost = new Map(
    urls.flatMap((schedule) =>
      schedule.result?.url ? [[schedule.post.toString(), schedule.result.url]] : [],
    ),
  );

  const totals: Partial<Record<AnalyticsMetric, number>> = {};
  const byPlatform = new Map<CreatePlatformValue, { engagement: number; posts: number }>();
  const byPillar = new Map<string, { engagement: number; posts: number }>();
  const byTime = new Map<string, { engagement: number; posts: number }>();
  const ranked: AnalyticsReport["topPosts"] = [];

  for (const snapshot of snapshots) {
    const post = postById.get(snapshot._id.toString());
    if (!post) continue;
    const metrics = metricsOf(snapshot);
    const engagement = engagementOf(metrics);

    for (const metric of ANALYTICS_METRICS) {
      const value = metrics[metric];
      // Followers are an account total, not something to add up across posts.
      if (value === undefined || metric === "followers") continue;
      totals[metric] = (totals[metric] ?? 0) + value;
    }

    const platformStats = byPlatform.get(snapshot.platform) ?? { engagement: 0, posts: 0 };
    byPlatform.set(snapshot.platform, {
      engagement: platformStats.engagement + engagement,
      posts: platformStats.posts + 1,
    });

    if (post.pillar) {
      const pillarStats = byPillar.get(post.pillar) ?? { engagement: 0, posts: 0 };
      byPillar.set(post.pillar, {
        engagement: pillarStats.engagement + engagement,
        posts: pillarStats.posts + 1,
      });
    }

    if (post.publishedAt) {
      // Bucketed in UTC; the frontend renders them in the workspace's zone.
      const published = new Date(post.publishedAt);
      const key = `${published.getUTCDay()}:${published.getUTCHours()}`;
      const timeStats = byTime.get(key) ?? { engagement: 0, posts: 0 };
      byTime.set(key, {
        engagement: timeStats.engagement + engagement,
        posts: timeStats.posts + 1,
      });
    }

    ranked.push({
      postId: post._id.toString(),
      platform: snapshot.platform,
      topic: post.brief?.topic ?? "",
      pillar: post.pillar ?? null,
      publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
      url: urlByPost.get(post._id.toString()) ?? null,
      engagement,
      metrics,
    });
  }

  const best = <T>(entries: [T, { engagement: number; posts: number }][]) =>
    entries.sort((left, right) => right[1].engagement - left[1].engagement)[0] ?? null;

  const bestPlatformEntry = best([...byPlatform.entries()]);
  const bestPillarEntry = best([...byPillar.entries()]);

  return {
    range: { from: input.from.toISOString(), to: input.to.toISOString() },
    totals: { totals, engagement: engagementOf(totals) },
    availableMetrics,
    unavailableMetrics: ANALYTICS_METRICS.filter((metric) => !availableMetrics.includes(metric)),
    followerGrowth: await followerGrowth(workspace._id, input),
    series: await engagementSeries(workspace._id, input),
    topPosts: ranked.sort((left, right) => right.engagement - left.engagement).slice(0, 10),
    bestPlatform: bestPlatformEntry
      ? { platform: bestPlatformEntry[0], ...bestPlatformEntry[1] }
      : null,
    bestPillar: bestPillarEntry ? { pillar: bestPillarEntry[0], ...bestPillarEntry[1] } : null,
    bestTimes: [...byTime.entries()]
      .map(([key, stats]) => {
        const [weekday, hour] = key.split(":").map(Number);
        return { weekday, hour, ...stats };
      })
      .sort((left, right) => right.engagement - left.engagement)
      .slice(0, 5),
    platformNotes: notesFor(connectedPlatforms),
    isEmpty: false,
  };
};

const notesFor = (platforms: CreatePlatformValue[]) =>
  platforms.flatMap((platform) => {
    const note = PLATFORM_ANALYTICS_NOTES[platform];
    return note ? [{ platform, note }] : [];
  });

/**
 * Follower counts at the start and end of the range. No platform reports
 * "followers gained", only the total right now, so growth is the difference
 * between the earliest and latest snapshots we hold.
 */
const followerGrowth = async (workspaceId: Types.ObjectId, { from, to }: AnalyticsQueryInput) => {
  const rows = await AnalyticsSnapshot.aggregate<{
    _id: Types.ObjectId;
    platform: CreatePlatformValue;
    first: number | null;
    last: number | null;
  }>([
    {
      $match: {
        workspace: workspaceId,
        scope: AnalyticsScope.ACCOUNT,
        capturedAt: { $gte: from, $lte: to },
      },
    },
    { $sort: { capturedAt: 1 } },
    {
      $group: {
        _id: "$socialAccount",
        platform: { $first: "$platform" },
        first: { $first: "$metrics.followers" },
        last: { $last: "$metrics.followers" },
      },
    },
  ]);
  if (rows.length === 0) return [];

  const accounts = await SocialAccount.find({
    workspace: workspaceId,
    _id: { $in: rows.map((row) => row._id) },
  })
    .select("accountName")
    .lean();
  const nameById = new Map(
    accounts.map((account) => [account._id.toString(), account.accountName]),
  );

  return rows.map((row) => ({
    platform: row.platform,
    accountName: nameById.get(row._id.toString()) ?? "",
    first: row.first ?? null,
    last: row.last ?? null,
    change: row.first != null && row.last != null ? row.last - row.first : null,
  }));
};

/** Daily totals across posts, for the trend line. */
const engagementSeries = async (
  workspaceId: Types.ObjectId,
  { from, to, platform }: AnalyticsQueryInput,
) => {
  const rows = await AnalyticsSnapshot.aggregate<{
    _id: string;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    views: number;
  }>([
    {
      $match: {
        workspace: workspaceId,
        scope: AnalyticsScope.POST,
        capturedAt: { $gte: from, $lte: to },
        ...(platform?.length ? { platform: { $in: platform } } : {}),
      },
    },
    {
      $group: {
        _id: "$capturedOn",
        likes: { $sum: { $ifNull: ["$metrics.likes", 0] } },
        comments: { $sum: { $ifNull: ["$metrics.comments", 0] } },
        shares: { $sum: { $ifNull: ["$metrics.shares", 0] } },
        saves: { $sum: { $ifNull: ["$metrics.saves", 0] } },
        views: { $sum: { $ifNull: ["$metrics.views", 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((row) => ({
    date: row._id,
    engagement: row.likes + row.comments + row.shares + row.saves,
    views: row.views,
  }));
};

/** Deletes a workspace's analytics along with the rest of its data. */
export const deleteWorkspaceAnalytics = async (workspaceId: Types.ObjectId): Promise<void> => {
  await AnalyticsSnapshot.deleteMany({ workspace: workspaceId });
};

/** Posts that have been published but have no metrics yet, for the empty state. */
export const publishedPostCount = (workspaceId: Types.ObjectId) =>
  Post.countDocuments({ workspace: workspaceId, status: PostStatus.PUBLISHED });

// ── Dashboard ──────────────────────────────────────────────

export interface DashboardSummary {
  stats: {
    connectedAccounts: number;
    postsThisMonth: { value: number; previous: number };
    scheduledPosts: number;
    publishedPosts: { value: number; previous: number };
    /** Total engagement over the last 30 days, against the 30 before it. */
    engagement: { value: number; previous: number };
  };
  engagement: {
    totals: Partial<Record<AnalyticsMetric, number>>;
    daily: { date: string; engagement: number }[];
  };
  upcomingPosts: {
    id: string;
    platform: CreatePlatformValue;
    topic: string;
    scheduledAt: string;
  }[];
  recentPosts: {
    id: string;
    platform: CreatePlatformValue;
    topic: string;
    publishedAt: string | null;
    url: string | null;
    engagement: number | null;
  }[];
  /** Metrics the connected platforms report, so widgets can hide the rest. */
  availableMetrics: AnalyticsMetric[];
  /** True when no metrics have been collected yet. */
  awaitingMetrics: boolean;
}

/**
 * The dashboard's numbers, all of them real. Counts come from our own records
 * and engagement from collected snapshots; nothing is estimated.
 */
export const getDashboardSummary = async (
  context: WorkspaceContext,
  { now = new Date() }: { now?: Date } = {},
): Promise<DashboardSummary> => {
  const workspaceId = context.workspace._id;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * DAY_MS);

  const [
    connectedAccounts,
    postsThisMonth,
    postsLastMonth,
    scheduledPosts,
    publishedThisMonth,
    publishedLastMonth,
    current,
    previous,
    upcoming,
    recent,
  ] = await Promise.all([
    SocialAccount.countDocuments({
      workspace: workspaceId,
      status: SocialAccountStatus.CONNECTED,
    }),
    Post.countDocuments({ workspace: workspaceId, createdAt: { $gte: monthStart } }),
    Post.countDocuments({
      workspace: workspaceId,
      createdAt: { $gte: previousMonthStart, $lt: monthStart },
    }),
    Post.countDocuments({ workspace: workspaceId, status: PostStatus.SCHEDULED }),
    Post.countDocuments({
      workspace: workspaceId,
      status: PostStatus.PUBLISHED,
      publishedAt: { $gte: monthStart },
    }),
    Post.countDocuments({
      workspace: workspaceId,
      status: PostStatus.PUBLISHED,
      publishedAt: { $gte: previousMonthStart, $lt: monthStart },
    }),
    getReport(context, { from: thirtyDaysAgo, to: now }),
    getReport(context, { from: sixtyDaysAgo, to: thirtyDaysAgo }),
    Post.find({
      workspace: workspaceId,
      status: { $in: [PostStatus.SCHEDULED, PostStatus.APPROVED, PostStatus.READY] },
      scheduledAt: { $gte: now },
    })
      .sort({ scheduledAt: 1 })
      .limit(5)
      .select("platform brief.topic scheduledAt")
      .lean(),
    Post.find({ workspace: workspaceId, status: PostStatus.PUBLISHED })
      .sort({ publishedAt: -1 })
      .limit(5)
      .select("platform brief.topic publishedAt")
      .lean(),
  ]);

  const engagementByPost = new Map(
    current.topPosts.map((post) => [post.postId, post.engagement] as const),
  );
  const urlByPost = new Map(current.topPosts.map((post) => [post.postId, post.url] as const));

  return {
    stats: {
      connectedAccounts,
      postsThisMonth: { value: postsThisMonth, previous: postsLastMonth },
      scheduledPosts,
      publishedPosts: { value: publishedThisMonth, previous: publishedLastMonth },
      engagement: { value: current.totals.engagement, previous: previous.totals.engagement },
    },
    engagement: {
      totals: current.totals.totals,
      daily: current.series.map(({ date, engagement }) => ({ date, engagement })),
    },
    upcomingPosts: upcoming.map((post) => ({
      id: post._id.toString(),
      platform: post.platform,
      topic: post.brief?.topic ?? "",
      scheduledAt: new Date(post.scheduledAt as Date).toISOString(),
    })),
    recentPosts: recent.map((post) => ({
      id: post._id.toString(),
      platform: post.platform,
      topic: post.brief?.topic ?? "",
      publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
      url: urlByPost.get(post._id.toString()) ?? null,
      // Null, not zero: metrics may simply not have been collected yet.
      engagement: engagementByPost.get(post._id.toString()) ?? null,
    })),
    availableMetrics: current.availableMetrics,
    awaitingMetrics: current.isEmpty,
  };
};
