import type { Types } from "mongoose";
import { logger } from "../config/logger";
import { AnalyticsScope } from "../constants/analytics.constant";
import {
  INSIGHT_CATEGORY_LABELS,
  INSIGHTS_LOOKBACK_DAYS,
  type InsightStatusValue,
  MAX_APPROVED_INSIGHTS_IN_PROMPT,
  MIN_POSTS_FOR_INSIGHTS,
} from "../constants/insights.constant";
import { PostStatus } from "../constants/post.constant";
import { WorkspaceRole, WorkspaceStatus } from "../constants/workspace.constant";
import {
  calculatePerformance,
  classifyFormat,
  type PostSample,
} from "../integrations/insights/calculate";
import { AnalyticsSnapshot } from "../models/analyticsSnapshot.model";
import {
  type IPerformanceFact,
  PerformanceInsightReport,
  type PerformanceInsightReportDocument,
} from "../models/performanceInsightReport.model";
import { Post } from "../models/post.model";
import { PostVersion } from "../models/postVersion.model";
import { StoredFile } from "../models/file.model";
import { User } from "../models/user.model";
import { Workspace } from "../models/workspace.model";
import { WorkspaceMember } from "../models/workspaceMember.model";
import { AppError } from "../utils/appError.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import * as AIService from "./ai.service";
import { engagementOf } from "./analytics.service";
import * as EntitlementService from "./entitlement.service";
import * as NotificationEvents from "./notificationEvents.service";

const DAY_MS = 86_400_000;
const unscoped = { skipWorkspaceScope: true } as const;

// ── Public shapes ──────────────────────────────────────────

export interface PublicInsight {
  id: string;
  category: IPerformanceFact["category"];
  title: string;
  interpretation: string;
  recommendation: string;
  factIds: string[];
  status: InsightStatusValue;
  decidedAt: Date | null;
}

export interface PublicInsightReport {
  id: string;
  weekStart: string;
  periodStart: Date;
  periodEnd: Date;
  status: PerformanceInsightReportDocument["status"];
  postsAnalyzed: number;
  minPostsNeeded: number;
  baseline: { avgEngagement: number; avgViews: number | null };
  facts: IPerformanceFact[];
  insights: PublicInsight[];
  generation: { provider: string; model: string; promptVersion: string } | null;
  aiError: string | null;
  rejectedInsights: number;
  automatic: boolean;
  createdAt: Date;
}

const toPublicReport = (report: PerformanceInsightReportDocument): PublicInsightReport => ({
  id: report._id.toString(),
  weekStart: report.weekStart,
  periodStart: report.periodStart,
  periodEnd: report.periodEnd,
  status: report.status,
  postsAnalyzed: report.postsAnalyzed,
  minPostsNeeded: MIN_POSTS_FOR_INSIGHTS,
  baseline: {
    avgEngagement: report.baseline.avgEngagement,
    avgViews: report.baseline.avgViews ?? null,
  },
  facts: report.facts.map((fact) => ({
    id: fact.id,
    category: fact.category,
    key: fact.key,
    label: fact.label,
    posts: fact.posts,
    totalEngagement: fact.totalEngagement,
    avgEngagement: fact.avgEngagement,
    avgViews: fact.avgViews ?? null,
    engagementRate: fact.engagementRate ?? null,
    liftVsAverage: fact.liftVsAverage ?? null,
    confidence: fact.confidence,
  })),
  insights: report.insights.map((insight) => ({
    id: insight._id.toString(),
    category: insight.category,
    title: insight.title,
    interpretation: insight.interpretation,
    recommendation: insight.recommendation,
    factIds: insight.factIds,
    status: insight.status,
    decidedAt: insight.decidedAt ?? null,
  })),
  generation: report.generation
    ? {
        provider: report.generation.provider,
        model: report.generation.model,
        promptVersion: report.generation.promptVersion,
      }
    : null,
  aiError: report.aiError ?? null,
  rejectedInsights: report.rejectedInsights,
  automatic: report.createdBy === null,
  createdAt: report.createdAt,
});

// ── Loading real data ──────────────────────────────────────

/**
 * Published posts from the window with the latest metrics we hold for each.
 * A post without any collected metrics is left out rather than counted as zero:
 * no reading isn't the same as no engagement.
 */
export const loadSamples = async (
  workspaceId: Types.ObjectId,
  from: Date,
  to: Date,
): Promise<PostSample[]> => {
  const posts = await Post.find({
    workspace: workspaceId,
    status: PostStatus.PUBLISHED,
    publishedAt: { $gte: from, $lte: to },
  })
    .select("platform pillar brief.topic publishedAt currentVersion")
    .lean();
  if (posts.length === 0) return [];

  // The tenancy plugin doesn't cover aggregation, so the workspace match is first.
  const latest = await AnalyticsSnapshot.aggregate<{
    _id: Types.ObjectId;
    metrics: Record<string, number>;
  }>([
    {
      $match: {
        workspace: workspaceId,
        scope: AnalyticsScope.POST,
        post: { $in: posts.map((post) => post._id) },
      },
    },
    { $sort: { capturedAt: -1 } },
    { $group: { _id: "$post", metrics: { $first: "$metrics" } } },
  ]);
  const metricsByPost = new Map(latest.map((row) => [row._id.toString(), row.metrics]));

  const versions = await PostVersion.find({
    workspace: workspaceId,
    _id: { $in: posts.flatMap((post) => (post.currentVersion ? [post.currentVersion] : [])) },
  })
    .select("content media videoFormat")
    .lean();
  const versionById = new Map(versions.map((version) => [version._id.toString(), version]));

  const fileIds = versions.flatMap((version) => version.media ?? []);
  const files = fileIds.length
    ? await StoredFile.find({ workspace: workspaceId, _id: { $in: fileIds } })
        .select("kind")
        .lean()
    : [];
  const kindById = new Map(files.map((file) => [file._id.toString(), file.kind]));

  return posts.flatMap((post): PostSample[] => {
    const metrics = metricsByPost.get(post._id.toString());
    const version = post.currentVersion ? versionById.get(post.currentVersion.toString()) : null;
    if (!metrics || !version || !post.publishedAt) return [];
    const media = (version.media ?? []).flatMap((id) => {
      const kind = kindById.get(id.toString());
      return kind ? [{ kind }] : [];
    });
    return [
      {
        postId: post._id.toString(),
        platform: post.platform,
        pillar: post.pillar ?? null,
        topic: post.brief?.topic ?? "",
        publishedAt: new Date(post.publishedAt),
        hook: version.content.hook ?? null,
        text: version.content.text ?? "",
        cta: version.content.cta ?? null,
        format: classifyFormat(media, version.videoFormat ?? null),
        engagement: engagementOf(metrics),
        views: typeof metrics.views === "number" ? metrics.views : null,
      },
    ];
  });
};

// ── Generating ─────────────────────────────────────────────

/** Monday of the week containing `date`, as `YYYY-MM-DD` on the workspace's clock. */
export const weekStartFor = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(value("weekday"));
  const local = Date.UTC(Number(value("year")), Number(value("month")) - 1, Number(value("day")));
  return new Date(local - Math.max(0, weekday) * DAY_MS).toISOString().slice(0, 10);
};

/**
 * Calculates this period's facts and, when there's enough data, asks the AI to
 * interpret them. The calculation is saved even when the AI step fails, so the
 * numbers are never held hostage by an AI outage.
 */
export const generateReport = async (
  context: WorkspaceContext,
  { now = new Date(), automatic = false }: { now?: Date; automatic?: boolean } = {},
): Promise<PublicInsightReport> => {
  const workspace = context.workspace;
  const timeZone = workspace.timezone ?? "UTC";
  const periodEnd = now;
  const periodStart = new Date(now.getTime() - INSIGHTS_LOOKBACK_DAYS * DAY_MS);

  const samples = await loadSamples(workspace._id, periodStart, periodEnd);
  const calculated = calculatePerformance(samples, timeZone);

  const report = new PerformanceInsightReport({
    workspace: workspace._id,
    weekStart: weekStartFor(now, timeZone),
    periodStart,
    periodEnd,
    status: samples.length >= MIN_POSTS_FOR_INSIGHTS ? "READY" : "INSUFFICIENT_DATA",
    postsAnalyzed: calculated.postsAnalyzed,
    baseline: calculated.baseline,
    facts: calculated.facts,
    insights: [],
    generation: null,
    aiError: null,
    rejectedInsights: 0,
    createdBy: automatic ? null : context.user._id,
  });

  // Too few posts to say anything: store the numbers, skip the AI entirely.
  if (report.status === "READY") {
    try {
      const result = await AIService.generatePerformanceInsights(context, {
        postsAnalyzed: calculated.postsAnalyzed,
        periodDays: INSIGHTS_LOOKBACK_DAYS,
        baseline: calculated.baseline,
        facts: calculated.facts,
      });
      report.set({
        insights: result.data.insights.map((insight) => ({ ...insight, status: "PENDING" })),
        rejectedInsights: result.data.rejected,
        generation: {
          provider: result.provider,
          model: result.model,
          promptVersion: result.promptVersion,
        },
      });
    } catch (error) {
      report.aiError =
        error instanceof AppError
          ? error.message.slice(0, 300)
          : "The AI couldn't interpret the results this time.";
      logger.warn({ err: error, workspaceId: workspace.id }, "Insight interpretation failed");
    }
  }

  await report.save();
  logger.info(
    {
      workspaceId: workspace.id,
      status: report.status,
      posts: report.postsAnalyzed,
      insights: report.insights.length,
      rejected: report.rejectedInsights,
      automatic,
    },
    "Performance insight report generated",
  );
  return toPublicReport(report);
};

// ── Reading and deciding ───────────────────────────────────

export const listReports = async ({ workspace }: WorkspaceContext) => {
  const reports = await PerformanceInsightReport.find({ workspace: workspace._id })
    .sort({ createdAt: -1 })
    .limit(26)
    .select("weekStart status postsAnalyzed insights.status createdAt createdBy");
  return reports.map((report) => ({
    id: report._id.toString(),
    weekStart: report.weekStart,
    status: report.status,
    postsAnalyzed: report.postsAnalyzed,
    insights: report.insights.length,
    approved: report.insights.filter((insight) => insight.status === "APPROVED").length,
    automatic: report.createdBy === null,
    createdAt: report.createdAt,
  }));
};

export const getLatestReport = async ({ workspace }: WorkspaceContext) => {
  const report = await PerformanceInsightReport.findOne({ workspace: workspace._id }).sort({
    createdAt: -1,
  });
  return report ? toPublicReport(report) : null;
};

export const getReport = async ({ workspace }: WorkspaceContext, reportId: string) => {
  const report = await PerformanceInsightReport.findOne({
    _id: reportId,
    workspace: workspace._id,
  });
  if (!report) throw AppError.notFound("Insight report not found");
  return toPublicReport(report);
};

/**
 * Approving an insight lets it steer future AI writing for the whole workspace,
 * which is why the route limits it to admins. Dismissing or resetting it stops that.
 */
export const decideInsight = async (
  { workspace, user }: WorkspaceContext,
  reportId: string,
  insightId: string,
  status: InsightStatusValue,
) => {
  const report = await PerformanceInsightReport.findOne({
    _id: reportId,
    workspace: workspace._id,
  });
  const insight = report?.insights.find((item) => item._id.toString() === insightId);
  if (!report || !insight) throw AppError.notFound("Insight not found");

  insight.status = status;
  insight.decidedBy = status === "PENDING" ? null : user._id;
  insight.decidedAt = status === "PENDING" ? null : new Date();
  await report.save();
  return toPublicReport(report);
};

/** Approved insights, newest decision first. */
export const listApprovedInsights = async (workspaceId: Types.ObjectId) => {
  const reports = await PerformanceInsightReport.find({
    workspace: workspaceId,
    "insights.status": "APPROVED",
  })
    .select("insights weekStart")
    .sort({ createdAt: -1 })
    .limit(20);
  return reports
    .flatMap((report) =>
      report.insights
        .filter((insight) => insight.status === "APPROVED")
        .map((insight) => ({ insight, reportId: report._id.toString() })),
    )
    .sort(
      (left, right) =>
        (right.insight.decidedAt?.getTime() ?? 0) - (left.insight.decidedAt?.getTime() ?? 0),
    )
    .slice(0, MAX_APPROVED_INSIGHTS_IN_PROMPT);
};

/**
 * Prompt-ready approved insights for AI writing, or null when there are none.
 * Only the interpretation and advice go in: they contain no numbers, so nothing
 * here can be mistaken by the model for a fact to repeat.
 */
export const getApprovedInsightsContext = async ({
  workspace,
}: WorkspaceContext): Promise<string | null> => {
  const approved = await listApprovedInsights(workspace._id);
  if (approved.length === 0) return null;
  return approved
    .map(
      ({ insight }) =>
        `- ${INSIGHT_CATEGORY_LABELS[insight.category]}: ${insight.recommendation} (Why: ${insight.interpretation})`,
    )
    .join("\n");
};

/** Approved insights currently fed into generation, for display. */
export const getApprovedInsights = async ({ workspace }: WorkspaceContext) =>
  (await listApprovedInsights(workspace._id)).map(({ insight, reportId }) => ({
    reportId,
    id: insight._id.toString(),
    category: insight.category,
    title: insight.title,
    recommendation: insight.recommendation,
    decidedAt: insight.decidedAt ?? null,
  }));

// ── Weekly run ─────────────────────────────────────────────

/** The owner stands in as the acting user for automatic runs, so AI usage is still attributed. */
const ownerContext = async (workspaceId: Types.ObjectId): Promise<WorkspaceContext | null> => {
  const [workspace, member] = await Promise.all([
    Workspace.findById(workspaceId),
    WorkspaceMember.findOne({ workspace: workspaceId, role: WorkspaceRole.OWNER }),
  ]);
  if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE || !member) return null;
  const user = await User.findById(member.user);
  return user ? { workspace, member, user } : null;
};

/**
 * Writes this week's report for every workspace that has metrics and doesn't
 * have one yet. Runs on the worker's existing sweep, so it isn't a second
 * scheduler: missing a tick just means the next one catches up.
 */
export const generateDueReports = async ({ now = new Date() }: { now?: Date } = {}) => {
  const workspaceIds = (await AnalyticsSnapshot.distinct("workspace").setOptions(
    unscoped,
  )) as Types.ObjectId[];
  let generated = 0;

  for (const workspaceId of workspaceIds) {
    const context = await ownerContext(workspaceId);
    if (!context || !(await EntitlementService.hasFeature(context.workspace, "analytics")))
      continue;
    const weekStart = weekStartFor(now, context.workspace.timezone ?? "UTC");
    const existing = await PerformanceInsightReport.exists({
      workspace: workspaceId,
      weekStart,
      createdBy: null,
    });
    if (existing) continue;

    try {
      await generateReport(context, { now, automatic: true });
      generated += 1;
      await NotificationEvents.insightsReady(workspaceId, weekStart);
    } catch (error) {
      // Another worker saved this week's report first.
      if ((error as { code?: number }).code === 11000) continue;
      // One workspace failing must not stop the rest.
      logger.error(
        { err: error, workspaceId: workspaceId.toString() },
        "Weekly insight report failed",
      );
    }
  }
  return { generated };
};

export const deleteWorkspaceInsights = async (workspaceId: Types.ObjectId) => {
  await PerformanceInsightReport.deleteMany({ workspace: workspaceId });
};
