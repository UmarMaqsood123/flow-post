/**
 * Autopilot: plans posting times, picks a topic, writes platform posts, checks
 * them for repeats and quality, then holds them for approval or schedules them.
 *
 * Every step re-reads the settings, so pausing takes effect at the next step of
 * any run already in progress, and the publish worker checks again right before
 * calling a platform. Every decision is written to the audit trail.
 */
import type { Types } from "mongoose";
import { logger } from "../config/logger";
import {
  AUTOPILOT_FORMATS,
  AUTOPILOT_RULES as RULES,
  type AutopilotFormatValue,
  HOLD_REASONS,
  type HoldReasonValue,
} from "../constants/autopilot.constant";
import { ErrorCode, HttpStatus } from "../constants/http.constant";
import { PLATFORM_MEDIA_RULES } from "../constants/media.constant";
import { type CreatePlatformValue, PostStatus } from "../constants/post.constant";
import { UserStatus } from "../constants/auth.constant";
import { WorkspaceRole, WorkspaceStatus } from "../constants/workspace.constant";
import { PLATFORM_GUIDELINES } from "../integrations/ai/prompts/platforms";
import { leastRecentlyUsed, plannedTimes } from "../integrations/autopilot/planner";
import { checkQuality } from "../integrations/autopilot/quality";
import { findSimilar, openingOf, textSimilarity } from "../integrations/autopilot/similarity";
import { AutopilotEvent } from "../models/autopilotEvent.model";
import {
  AutopilotSettings,
  type AutopilotSettingsDocument,
} from "../models/autopilotSettings.model";
import { AutopilotSlot, type AutopilotSlotDocument } from "../models/autopilotSlot.model";
import { Post, type PostDocument } from "../models/post.model";
import { PostVersion } from "../models/postVersion.model";
import { SocialAccount } from "../models/socialAccount.model";
import { User } from "../models/user.model";
import { Workspace, type WorkspaceDocument } from "../models/workspace.model";
import { WorkspaceMember } from "../models/workspaceMember.model";
import { AppError } from "../utils/appError.util";
import { addDays, formatInZone, zonedTimeToUtc } from "../utils/timezone.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import { hasMinimumRole } from "../utils/workspaceRoles.util";
import type {
  ApproveAutopilotPostInput,
  ListAutopilotEventsQuery,
  RejectAutopilotPostInput,
  UpdateAutopilotSettingsInput,
} from "../validators/autopilot.validator";
import type { PostContent } from "../validators/post.validator";
import * as AIService from "./ai.service";
import { autoPause, holdPost, recordEvent } from "./autopilotAudit.service";
import * as ContentStrategyService from "./contentStrategy.service";
import * as EntitlementService from "./entitlement.service";
import * as PerformanceInsightsService from "./performanceInsights.service";
import * as PostService from "./post.service";
import * as PublishingService from "./publishing.service";
import * as NotificationEvents from "./notificationEvents.service";

const unscoped = { skipWorkspaceScope: true } as const;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A pipeline problem with a code for the audit trail. */
class AutopilotError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AutopilotError";
  }
}

const label = (platform: CreatePlatformValue) => PLATFORM_GUIDELINES[platform].label;
/** Autopilot's share of the plan covering this workspace (see EntitlementService). */
const limitsOf = async (workspace: WorkspaceDocument) => {
  const { plan, definition } = await EntitlementService.getWorkspaceEntitlements(workspace);
  return {
    plan,
    label: definition.label,
    included: definition.features.autopilot,
    autopilotPostsPerWeek: definition.autopilot.postsPerWeek,
    autopilotPlatforms: definition.autopilot.platforms,
    autopilotPostsPerDay: definition.autopilot.postsPerDay,
  };
};

// ── Public shapes ──────────────────────────────────────────

export interface PublicAutopilotSettings {
  status: AutopilotSettingsDocument["status"];
  platforms: CreatePlatformValue[];
  accounts: { platform: CreatePlatformValue; socialAccountId: string }[];
  postsPerWeek: number;
  postingDays: AutopilotSettingsDocument["postingDays"];
  postingTimes: string[];
  pillars: string[];
  formats: AutopilotFormatValue[];
  approvalRequired: boolean;
  maxPostsPerDay: number;
  startedAt: Date | null;
  pausedAt: Date | null;
  pausedBySystem: boolean;
  pauseReason: string | null;
  consecutiveGenerationFailures: number;
  consecutivePublishFailures: number;
  lastSweepAt: Date | null;
  updatedAt: Date | null;
}

const toPublicSettings = (settings: AutopilotSettingsDocument): PublicAutopilotSettings => ({
  status: settings.status,
  platforms: settings.platforms,
  accounts: settings.accounts.map((choice) => ({
    platform: choice.platform,
    socialAccountId: choice.socialAccount.toString(),
  })),
  postsPerWeek: settings.postsPerWeek,
  postingDays: settings.postingDays,
  postingTimes: settings.postingTimes,
  pillars: settings.pillars,
  formats: settings.formats,
  approvalRequired: settings.approvalRequired,
  maxPostsPerDay: settings.maxPostsPerDay,
  startedAt: settings.startedAt ?? null,
  pausedAt: settings.pausedAt ?? null,
  pausedBySystem: settings.status === "PAUSED" && !settings.pausedBy,
  pauseReason: settings.pauseReason ?? null,
  consecutiveGenerationFailures: settings.consecutiveGenerationFailures,
  consecutivePublishFailures: settings.consecutivePublishFailures,
  lastSweepAt: settings.lastSweepAt ?? null,
  updatedAt: settings.isNew ? null : settings.updatedAt,
});

export interface PublicSlot {
  id: string;
  scheduledAt: Date;
  localDay: string;
  status: AutopilotSlotDocument["status"];
  platforms: CreatePlatformValue[];
  pillar: string | null;
  format: AutopilotFormatValue | null;
  topic: string | null;
  angle: string | null;
  postIds: string[];
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: { code: string; message: string; occurredAt: Date } | null;
  skipReason: string | null;
}

const toPublicSlot = (slot: AutopilotSlotDocument): PublicSlot => ({
  id: slot._id.toString(),
  scheduledAt: slot.scheduledAt,
  localDay: slot.localDay,
  status: slot.status,
  platforms: slot.platforms,
  pillar: slot.pillar ?? null,
  format: slot.format ?? null,
  topic: slot.topic ?? null,
  angle: slot.angle ?? null,
  postIds: slot.posts.map(String),
  attempts: slot.attempts,
  nextAttemptAt: slot.nextAttemptAt ?? null,
  lastError: slot.lastError
    ? {
        code: slot.lastError.code,
        message: slot.lastError.message,
        occurredAt: slot.lastError.occurredAt,
      }
    : null,
  skipReason: slot.skipReason ?? null,
});

export interface ReviewQueueItem {
  postId: string;
  slotId: string;
  platform: CreatePlatformValue;
  topic: string;
  pillar: string | null;
  scheduledAt: Date | null;
  heldReason: HoldReasonValue;
  heldReasonLabel: string;
  heldMessage: string | null;
  preview: string;
  createdAt: Date;
}

// ── Settings ───────────────────────────────────────────────

/** The workspace's settings, created with safe defaults (off, approval on) on first read. */
const loadSettings = async (workspaceId: Types.ObjectId) => {
  const existing = await AutopilotSettings.findOne({ workspace: workspaceId });
  if (existing) return existing;
  try {
    return await AutopilotSettings.create({ workspace: workspaceId });
  } catch (error) {
    // Two first reads at once: the other one created it.
    if ((error as { code?: number }).code === 11000) {
      const created = await AutopilotSettings.findOne({ workspace: workspaceId });
      if (created) return created;
    }
    throw error;
  }
};

const planLimitError = (message: string) =>
  new AppError(message, HttpStatus.FORBIDDEN, { code: ErrorCode.PLAN_LIMIT_REACHED });

/** What the plan doesn't allow in these settings, as messages a person can act on. */
const planProblems = async (
  settings: Pick<UpdateAutopilotSettingsInput, "postsPerWeek" | "platforms" | "maxPostsPerDay">,
  workspace: WorkspaceDocument,
) => {
  const limits = await limitsOf(workspace);
  const problems: string[] = [];
  if (!limits.included) {
    return [`Autopilot isn't included in the ${limits.label} plan. Upgrade to use it.`];
  }
  if (settings.postsPerWeek > limits.autopilotPostsPerWeek) {
    problems.push(
      `The ${limits.label} plan allows ${limits.autopilotPostsPerWeek} Autopilot posts a week.`,
    );
  }
  if (settings.platforms.length > limits.autopilotPlatforms) {
    problems.push(
      `The ${limits.label} plan allows Autopilot on ${limits.autopilotPlatforms} platforms.`,
    );
  }
  if (settings.maxPostsPerDay > limits.autopilotPostsPerDay) {
    problems.push(
      `The ${limits.label} plan allows up to ${limits.autopilotPostsPerDay} Autopilot posts a day.`,
    );
  }
  return problems;
};

const readyProblems = (settings: AutopilotSettingsDocument) => {
  const problems: string[] = [];
  if (settings.platforms.length === 0) problems.push("Choose at least one platform.");
  if (settings.postingDays.length === 0) problems.push("Choose at least one posting day.");
  if (settings.postingTimes.length === 0) problems.push("Add at least one posting time.");
  if (settings.formats.length === 0) problems.push("Choose at least one content format.");
  return problems;
};

export const getOverview = async (context: WorkspaceContext) => {
  const { workspace } = context;
  const settings = await loadSettings(workspace._id);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [slots, queue, published, failed] = await Promise.all([
    AutopilotSlot.find({
      workspace: workspace._id,
      scheduledAt: { $gte: new Date(now.getTime() - 2 * DAY_MS) },
    })
      .sort({ scheduledAt: 1 })
      .limit(40),
    getReviewQueue(context),
    AutopilotEvent.countDocuments({
      workspace: workspace._id,
      type: "PUBLISHED",
      createdAt: { $gte: weekAgo },
    }),
    AutopilotEvent.countDocuments({
      workspace: workspace._id,
      type: { $in: ["PUBLISH_FAILED", "GENERATION_FAILED"] },
      createdAt: { $gte: weekAgo },
    }),
  ]);

  return {
    settings: toPublicSettings(settings),
    plan: await limitsOf(workspace),
    readyProblems: readyProblems(settings),
    slots: slots.map(toPublicSlot),
    queue,
    stats: {
      awaitingReview: queue.length,
      publishedLast7Days: published,
      failuresLast7Days: failed,
    },
  };
};

const settingsSnapshot = (settings: AutopilotSettingsDocument) => ({
  platforms: [...settings.platforms],
  accounts: settings.accounts.map((choice) => `${choice.platform}:${choice.socialAccount}`),
  postsPerWeek: settings.postsPerWeek,
  postingDays: [...settings.postingDays],
  postingTimes: [...settings.postingTimes],
  pillars: [...settings.pillars],
  formats: [...settings.formats],
  approvalRequired: settings.approvalRequired,
  maxPostsPerDay: settings.maxPostsPerDay,
});

const SETTING_LABELS: Record<keyof ReturnType<typeof settingsSnapshot>, string> = {
  platforms: "platforms",
  accounts: "accounts",
  postsPerWeek: "posts per week",
  postingDays: "posting days",
  postingTimes: "posting times",
  pillars: "content pillars",
  formats: "content formats",
  approvalRequired: "approval",
  maxPostsPerDay: "daily limit",
};

/** Removes future times that haven't been started, so new settings plan them afresh. */
const clearPlannedSlots = async (
  workspaceId: Types.ObjectId,
  actor: Types.ObjectId | null,
  reason: string,
) => {
  const { deletedCount } = await AutopilotSlot.deleteMany({
    workspace: workspaceId,
    status: "PLANNED",
    scheduledAt: { $gt: new Date() },
  });
  if (deletedCount > 0) {
    await recordEvent({
      workspace: workspaceId,
      type: "SLOTS_CLEARED",
      message: `Cleared ${deletedCount} planned posting ${deletedCount === 1 ? "time" : "times"}: ${reason}`,
      actor,
      details: { count: deletedCount },
    });
  }
  return deletedCount;
};

export const updateSettings = async (
  context: WorkspaceContext,
  input: UpdateAutopilotSettingsInput,
) => {
  const { workspace, user } = context;
  const problems = await planProblems(input, workspace);
  if (problems.length > 0) throw planLimitError(problems.join(" "));

  // Account choices must be connected accounts of a chosen platform in this workspace.
  const accounts = [];
  for (const choice of input.accounts) {
    if (!input.platforms.includes(choice.platform)) continue;
    const account = await SocialAccount.findOne({
      _id: choice.socialAccountId,
      workspace: workspace._id,
    });
    if (!account || account.platform !== choice.platform) {
      throw AppError.badRequest(`That ${label(choice.platform)} account isn't in this workspace`);
    }
    accounts.push({ platform: choice.platform, socialAccount: account._id });
  }

  const settings = await loadSettings(workspace._id);
  const before = settingsSnapshot(settings);
  settings.set({
    platforms: input.platforms,
    accounts,
    postsPerWeek: input.postsPerWeek,
    postingDays: input.postingDays,
    postingTimes: [...input.postingTimes].sort(),
    pillars: input.pillars,
    formats: input.formats,
    approvalRequired: input.approvalRequired,
    maxPostsPerDay: input.maxPostsPerDay,
    updatedBy: user._id,
  });
  const after = settingsSnapshot(settings);
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  await settings.save();

  if (changed.length > 0) {
    await recordEvent({
      workspace: workspace._id,
      type: "SETTINGS_UPDATED",
      message: `Changed ${changed.map((key) => SETTING_LABELS[key]).join(", ")}.`,
      actor: user._id,
      details: {
        changes: Object.fromEntries(
          changed.map((key) => [key, { from: before[key], to: after[key] }]),
        ),
      },
    });
    await clearPlannedSlots(workspace._id, user._id, "the settings changed.");
    if (settings.status === "ACTIVE") await planSlots(settings, workspace, new Date());
  }
  return toPublicSettings(settings);
};

/** Starts or resumes. Autopilot writes as the person who starts it. */
export const start = async (context: WorkspaceContext) => {
  const { workspace, user } = context;
  const settings = await loadSettings(workspace._id);
  const problems = [...readyProblems(settings), ...(await planProblems(settings, workspace))];
  if (problems.length > 0) {
    throw AppError.badRequest(`Autopilot can't start yet. ${problems.join(" ")}`);
  }
  if (settings.status === "ACTIVE") return toPublicSettings(settings);

  const resuming = settings.status === "PAUSED";
  settings.set({
    status: "ACTIVE",
    startedBy: user._id,
    startedAt: new Date(),
    pausedAt: null,
    pausedBy: null,
    pauseReason: null,
    consecutiveGenerationFailures: 0,
    consecutivePublishFailures: 0,
    updatedBy: user._id,
  });
  await settings.save();
  await recordEvent({
    workspace: workspace._id,
    type: "STARTED",
    message: resuming ? "Autopilot resumed." : "Autopilot started.",
    actor: user._id,
    details: { settings: settingsSnapshot(settings) },
  });
  await planSlots(settings, workspace, new Date());
  return toPublicSettings(settings);
};

/**
 * Pauses immediately. The status flips in one atomic update, so nothing new is
 * written or scheduled from this moment; then posts Autopilot scheduled on its
 * own are taken off the queue. Posts a person approved are left alone.
 */
export const pause = async (context: WorkspaceContext, reason?: string) => {
  const { workspace, user } = context;
  const paused = await AutopilotSettings.findOneAndUpdate(
    { workspace: workspace._id, status: "ACTIVE" },
    {
      $set: {
        status: "PAUSED",
        pausedAt: new Date(),
        pausedBy: user._id,
        pauseReason: reason?.trim() || null,
      },
    },
    { returnDocument: "after" },
  );
  if (!paused) {
    const settings = await loadSettings(workspace._id);
    if (settings.status === "PAUSED") return toPublicSettings(settings);
    throw AppError.conflict("Autopilot isn't running");
  }

  await recordEvent({
    workspace: workspace._id,
    type: "PAUSED",
    message: reason?.trim() ? `Autopilot paused: ${reason.trim()}` : "Autopilot paused.",
    actor: user._id,
  });
  await unscheduleForPause(workspace._id, user._id);
  return toPublicSettings(paused);
};

const unscheduleForPause = async (workspaceId: Types.ObjectId, actor: Types.ObjectId | null) => {
  const posts = await Post.find({
    workspace: workspaceId,
    "autopilot.slot": { $exists: true },
    "autopilot.approvedBy": null,
    status: PostStatus.SCHEDULED,
  });
  for (const post of posts) {
    try {
      await PublishingService.cancelLiveSchedule(post, actor);
    } catch (error) {
      // Already being sent: it can't be stopped now, so leave it and move on.
      if (error instanceof AppError && error.statusCode === 409) continue;
      throw error;
    }
    await holdPost(post, "PAUSED");
    await recordEvent({
      workspace: workspaceId,
      type: "UNSCHEDULED",
      message: "Taken off the schedule because Autopilot was paused.",
      actor,
      slot: post.autopilot?.slot ?? null,
      post: post._id,
      platform: post.platform,
    });
  }
  return posts.length;
};

// ── Planning ───────────────────────────────────────────────

export const planSlots = async (
  settings: AutopilotSettingsDocument,
  workspace: WorkspaceDocument,
  now: Date,
) => {
  if (settings.status !== "ACTIVE") return 0;
  const limits = await limitsOf(workspace);
  if (!limits.included) return 0;
  const times = plannedTimes(
    {
      postingDays: settings.postingDays,
      postingTimes: settings.postingTimes,
      postsPerWeek: Math.min(settings.postsPerWeek, limits.autopilotPostsPerWeek),
      timeZone: workspace.timezone ?? "UTC",
    },
    new Date(now.getTime() + RULES.minimumLeadMinutes * MINUTE_MS),
    new Date(now.getTime() + RULES.planningHorizonDays * DAY_MS),
  );

  const planned: Date[] = [];
  for (const time of times) {
    try {
      const result = await AutopilotSlot.updateOne(
        { workspace: workspace._id, scheduledAt: time.scheduledAt },
        {
          $setOnInsert: {
            localDay: time.localDay,
            weekStart: time.weekStart,
            status: "PLANNED",
            platforms: settings.platforms,
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount > 0) planned.push(time.scheduledAt);
    } catch (error) {
      // Another worker planned the same time first.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  if (planned.length > 0) {
    await recordEvent({
      workspace: workspace._id,
      type: "SLOTS_PLANNED",
      message: `Planned ${planned.length} posting ${planned.length === 1 ? "time" : "times"}.`,
      details: { times: planned.map((date) => date.toISOString()) },
    });
  }
  return planned.length;
};

// ── Review queue and decisions ─────────────────────────────

export const getReviewQueue = async ({
  workspace,
}: WorkspaceContext): Promise<ReviewQueueItem[]> => {
  const posts = await Post.find({
    workspace: workspace._id,
    status: PostStatus.READY,
    "autopilot.heldReason": { $ne: null },
  })
    .sort({ scheduledAt: 1 })
    .limit(100);
  const versions = await PostVersion.find({
    workspace: workspace._id,
    _id: { $in: posts.flatMap((post) => (post.currentVersion ? [post.currentVersion] : [])) },
  }).select("content");
  const textById = new Map(
    versions.map((version) => [version._id.toString(), version.content.text]),
  );

  return posts.flatMap((post) => {
    const reason = post.autopilot?.heldReason;
    if (!post.autopilot || !reason) return [];
    return [
      {
        postId: post._id.toString(),
        slotId: post.autopilot.slot.toString(),
        platform: post.platform,
        topic: post.brief.topic,
        pillar: post.pillar ?? null,
        scheduledAt: post.scheduledAt ?? null,
        heldReason: reason,
        heldReasonLabel: HOLD_REASONS[reason],
        heldMessage: post.autopilot.heldMessage ?? null,
        preview: (textById.get(post.currentVersion?.toString() ?? "") ?? "").slice(0, 280),
        createdAt: post.createdAt,
      },
    ];
  });
};

const findAutopilotPost = async ({ workspace }: WorkspaceContext, postId: string) => {
  const post = await Post.findOne({ _id: postId, workspace: workspace._id });
  if (!post || !post.autopilot) throw AppError.notFound("Autopilot post not found");
  return post;
};

/** Posts going out on a local day: scheduled, publishing or already published. */
const postsOnDay = async (
  workspace: WorkspaceDocument,
  day: string,
  excludePost?: Types.ObjectId,
) => {
  const timeZone = workspace.timezone ?? "UTC";
  const range = {
    $gte: zonedTimeToUtc(day, "00:00", timeZone),
    $lt: zonedTimeToUtc(addDays(day, 1), "00:00", timeZone),
  };
  return Post.countDocuments({
    workspace: workspace._id,
    ...(excludePost ? { _id: { $ne: excludePost } } : {}),
    $or: [
      { status: { $in: [PostStatus.SCHEDULED, PostStatus.PUBLISHING] }, scheduledAt: range },
      { status: PostStatus.PUBLISHED, publishedAt: range },
    ],
  });
};

const dailyCap = async (settings: AutopilotSettingsDocument, workspace: WorkspaceDocument) =>
  Math.min(settings.maxPostsPerDay, (await limitsOf(workspace)).autopilotPostsPerDay);

const localDayOf = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const accountFor = (settings: AutopilotSettingsDocument, platform: CreatePlatformValue) =>
  settings.accounts.find((choice) => choice.platform === platform)?.socialAccount.toString();

/** Approving schedules the post at its planned time, or a new one if that has passed. */
export const approvePost = async (
  context: WorkspaceContext,
  postId: string,
  input: ApproveAutopilotPostInput,
) => {
  const { workspace } = context;
  const post = await findAutopilotPost(context, postId);
  if (post.status !== PostStatus.READY || !post.autopilot?.heldReason) {
    throw AppError.conflict("This post isn't waiting for approval");
  }
  const scheduledAt = input.scheduledAt ?? post.scheduledAt;
  if (!scheduledAt || scheduledAt.getTime() < Date.now() + MINUTE_MS) {
    throw AppError.badRequest("The planned time has passed. Choose a new time to publish.", [
      { path: "scheduledAt", message: "Choose a time in the future" },
    ]);
  }

  const settings = await loadSettings(workspace._id);
  const day = localDayOf(scheduledAt, workspace.timezone ?? "UTC");
  if ((await postsOnDay(workspace, day, post._id)) >= (await dailyCap(settings, workspace))) {
    throw AppError.conflict(
      `The daily limit of ${await dailyCap(settings, workspace)} posts is already reached on ${day}. Choose another day.`,
    );
  }

  // Scheduling records the approval in the audit trail (see PostService.schedulePost).
  return PostService.schedulePost(context, postId, {
    scheduledAt,
    publish: true,
    socialAccountId: accountFor(settings, post.platform),
  });
};

export const rejectPost = async (
  context: WorkspaceContext,
  postId: string,
  { reason }: RejectAutopilotPostInput,
) => {
  const post = await findAutopilotPost(context, postId);
  if (post.status !== PostStatus.READY && post.status !== PostStatus.SCHEDULED) {
    throw AppError.conflict("Only posts that haven't started publishing can be rejected");
  }
  await PublishingService.cancelLiveSchedule(post, context.user._id);
  post.set({
    status: PostStatus.DRAFT,
    scheduledAt: null,
    updatedBy: context.user._id,
    "autopilot.heldReason": null,
    "autopilot.heldMessage": null,
  });
  await post.save();
  await recordEvent({
    workspace: post.workspace,
    type: "REJECTED",
    message: reason?.trim() ? `Rejected: ${reason.trim()}` : "Rejected. Moved to drafts.",
    actor: context.user._id,
    slot: post.autopilot?.slot ?? null,
    post: post._id,
    platform: post.platform,
  });
  return PostService.getPost(context, postId);
};

/** Puts a failed or skipped slot back in line, if its time is still far enough away. */
export const retrySlot = async (context: WorkspaceContext, slotId: string) => {
  const slot = await AutopilotSlot.findOne({ _id: slotId, workspace: context.workspace._id });
  if (!slot) throw AppError.notFound("Posting slot not found");
  if (slot.status !== "FAILED" && slot.status !== "SKIPPED") {
    throw AppError.conflict("Only failed or skipped slots can be retried");
  }
  if (slot.scheduledAt.getTime() < Date.now() + RULES.minimumLeadMinutes * MINUTE_MS) {
    throw AppError.badRequest("This posting time is too close or has passed");
  }
  slot.set({
    status: "PLANNED",
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    skipReason: null,
  });
  await slot.save();
  await recordEvent({
    workspace: slot.workspace,
    type: "SLOTS_PLANNED",
    message: "A person put this posting time back in line.",
    actor: context.user._id,
    slot: slot._id,
  });
  return toPublicSlot(slot);
};

export const listEvents = async (
  { workspace }: WorkspaceContext,
  { type, post, before, limit }: ListAutopilotEventsQuery,
) => {
  const events = await AutopilotEvent.find({
    workspace: workspace._id,
    ...(type ? { type } : {}),
    ...(post ? { post } : {}),
    ...(before ? { createdAt: { $lt: before } } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .populate({ path: "actor", select: "name" });

  const page = events.slice(0, limit);
  return {
    events: page.map((event) => {
      const actor = event.actor as unknown as { _id: Types.ObjectId; name: string } | null;
      return {
        id: event._id.toString(),
        type: event.type,
        message: event.message,
        actor: actor && "name" in actor ? { id: actor._id.toString(), name: actor.name } : null,
        slotId: event.slot?.toString() ?? null,
        postId: event.post?.toString() ?? null,
        platform: event.platform ?? null,
        details: event.details ?? null,
        createdAt: event.createdAt,
      };
    }),
    nextBefore: events.length > limit ? page[page.length - 1].createdAt : null,
  };
};

// ── The pipeline ───────────────────────────────────────────

/** Autopilot acts as the person who started it, while they can still edit. */
const actingContext = async (
  settings: AutopilotSettingsDocument,
  workspace: WorkspaceDocument,
): Promise<WorkspaceContext | null> => {
  if (!settings.startedBy) return null;
  const [member, user] = await Promise.all([
    WorkspaceMember.findOne({ workspace: workspace._id, user: settings.startedBy }),
    User.findById(settings.startedBy),
  ]);
  if (!member || !user || !hasMinimumRole(member.role, WorkspaceRole.EDITOR)) return null;
  // A suspended person's access is gone everywhere, including what runs on their behalf.
  if (user.status === UserStatus.SUSPENDED) return null;
  return { workspace, member, user };
};

const skipSlot = async (slot: AutopilotSlotDocument, code: string, message: string) => {
  slot.set({ status: "SKIPPED", skipReason: message, lockedAt: null });
  await slot.save();
  await recordEvent({
    workspace: slot.workspace,
    type: "SLOT_SKIPPED",
    message,
    slot: slot._id,
    details: { code, scheduledAt: slot.scheduledAt.toISOString() },
  });
};

interface RecentContent {
  topics: string[];
  hooks: string[];
  textsByPlatform: Map<CreatePlatformValue, string[]>;
}

/** What the workspace has already posted or planned, to compare new writing against. */
const loadRecentContent = async (workspaceId: Types.ObjectId): Promise<RecentContent> => {
  const since = new Date(Date.now() - RULES.duplicateLookbackDays * DAY_MS);
  const [posts, slots] = await Promise.all([
    Post.find({ workspace: workspaceId, createdAt: { $gte: since } })
      .select("platform brief.topic currentVersion")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    AutopilotSlot.find({ workspace: workspaceId, topic: { $ne: null }, createdAt: { $gte: since } })
      .select("topic")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
  ]);
  const versions = await PostVersion.find({
    workspace: workspaceId,
    _id: { $in: posts.flatMap((post) => (post.currentVersion ? [post.currentVersion] : [])) },
  })
    .select("post content.hook content.text")
    .lean();
  const platformByPost = new Map(posts.map((post) => [post._id.toString(), post.platform]));

  const textsByPlatform = new Map<CreatePlatformValue, string[]>();
  const hooks: string[] = [];
  for (const version of versions) {
    const text = version.content?.text ?? "";
    hooks.push(openingOf(version.content?.hook, text));
    const platform = platformByPost.get(version.post.toString());
    if (platform) textsByPlatform.set(platform, [...(textsByPlatform.get(platform) ?? []), text]);
  }
  const topics = [
    ...new Set([
      ...posts.map((post) => post.brief?.topic ?? ""),
      ...slots.map((slot) => slot.topic ?? ""),
    ]),
  ].filter(Boolean);
  return { topics, hooks: hooks.filter(Boolean), textsByPlatform };
};

const chooseTopic = async (
  context: WorkspaceContext,
  slot: AutopilotSlotDocument,
  recent: RecentContent,
  prompts: { strategy: string | null; insights: string | null },
) => {
  const format = slot.format ? AUTOPILOT_FORMATS[slot.format] : AUTOPILOT_FORMATS.TIPS;
  const rejected: string[] = [];

  for (let round = 1; round <= 2; round += 1) {
    const result = await AIService.selectAutopilotTopics(context, {
      pillar: slot.pillar,
      formatLabel: format.label,
      formatBrief: format.brief,
      platforms: slot.platforms,
      strategy: prompts.strategy,
      insights: prompts.insights,
      recentTopics: recent.topics.slice(0, RULES.topicsInPrompt),
      rejectedTopics: rejected,
      count: RULES.topicCandidates,
    });
    for (const candidate of result.data.topics) {
      const similar = findSimilar(
        candidate.topic,
        [...recent.topics, ...rejected],
        RULES.topicSimilarity,
      );
      if (!similar) return candidate;
      rejected.push(candidate.topic);
      await recordEvent({
        workspace: slot.workspace,
        type: "DUPLICATE_REJECTED",
        message: `Topic "${candidate.topic}" was too close to "${similar.match}".`,
        slot: slot._id,
        details: {
          kind: "topic",
          candidate: candidate.topic,
          match: similar.match,
          score: similar.score,
        },
      });
    }
  }
  throw new AutopilotError(
    "DUPLICATE_TOPIC",
    "Every suggested topic was too close to something already posted.",
  );
};

interface AcceptedDraft {
  platform: CreatePlatformValue;
  content: PostContent;
  review: string[];
}

/**
 * Writes every platform in one request, then checks each draft. A draft that
 * repeats earlier content or fails the quality check is rewritten once; if it
 * still fails, that platform is dropped for this slot.
 */
const writeDrafts = async (
  context: WorkspaceContext,
  slot: AutopilotSlotDocument,
  topic: { topic: string; angle: string },
  instructions: string,
  recent: RecentContent,
  prompts: { strategy: string | null; insights: string | null },
) => {
  const accepted: AcceptedDraft[] = [];
  const usedHooks = [...recent.hooks];
  let pending = [...slot.platforms];
  let generation: ReturnType<typeof PostService.toGeneration> | null = null;

  for (let round = 1; round <= 2 && pending.length > 0; round += 1) {
    const result = await AIService.createPosts(context, {
      topic: topic.topic,
      platforms: pending,
      instructions,
      strategy: prompts.strategy,
      insights: prompts.insights,
      avoidHooks: usedHooks.slice(-RULES.hooksInPrompt),
    });
    generation = PostService.toGeneration(result);
    const retry: CreatePlatformValue[] = [];
    const reject = async (
      platform: CreatePlatformValue,
      type: "DUPLICATE_REJECTED" | "QUALITY_REJECTED",
      message: string,
      details: Record<string, unknown>,
    ) => {
      retry.push(platform);
      await recordEvent({
        workspace: slot.workspace,
        type,
        message: `${label(platform)}: ${message}${round === 2 ? " Dropped for this slot." : " Rewriting."}`,
        slot: slot._id,
        platform,
        details: { ...details, round, final: round === 2 },
      });
    };

    for (const platform of pending) {
      const draft = result.data.drafts.find((item) => item.platform === platform);
      if (!draft) {
        await reject(platform, "QUALITY_REJECTED", "No version was written.", {});
        continue;
      }
      const quality = checkQuality(platform, draft.content);
      if (quality.blocking.length > 0) {
        await reject(platform, "QUALITY_REJECTED", quality.blocking.join(" "), {
          problems: quality.blocking,
        });
        continue;
      }
      const opening = openingOf(draft.content.hook, draft.content.text);
      const repeatedHook = findSimilar(opening, usedHooks, RULES.hookSimilarity);
      if (repeatedHook) {
        usedHooks.push(opening);
        await reject(
          platform,
          "DUPLICATE_REJECTED",
          `The opening repeats "${repeatedHook.match}".`,
          {
            kind: "hook",
            candidate: opening,
            match: repeatedHook.match,
            score: repeatedHook.score,
          },
        );
        continue;
      }
      const repeatedPost = findSimilar(
        draft.content.text,
        recent.textsByPlatform.get(platform) ?? [],
        RULES.postSimilarity,
        textSimilarity,
      );
      if (repeatedPost) {
        await reject(platform, "DUPLICATE_REJECTED", "The post repeats an earlier post.", {
          kind: "post",
          match: repeatedPost.match.slice(0, 200),
          score: repeatedPost.score,
        });
        continue;
      }
      // Later platforms in the same slot mustn't open the same way either.
      usedHooks.push(opening);
      accepted.push({ platform, content: draft.content, review: quality.review });
    }
    pending = retry;
  }
  return { accepted, generation };
};

/** Why an approval-off post can't be scheduled automatically, if anything stops it. */
const autoScheduleBlocker = async (
  settings: AutopilotSettingsDocument,
  workspace: WorkspaceDocument,
  post: PostDocument,
  review: string[],
): Promise<{ reason: HoldReasonValue; message: string | null } | null> => {
  if (settings.approvalRequired) return { reason: "APPROVAL_REQUIRED", message: null };
  if (PLATFORM_MEDIA_RULES[post.platform].required) {
    return { reason: "NEEDS_MEDIA", message: PLATFORM_MEDIA_RULES[post.platform].summary };
  }
  if (review.length > 0) return { reason: "QUALITY_REVIEW", message: review.join(" ") };
  const day = localDayOf(post.scheduledAt ?? new Date(), workspace.timezone ?? "UTC");
  if ((await postsOnDay(workspace, day, post._id)) >= (await dailyCap(settings, workspace))) {
    return {
      reason: "DAILY_LIMIT",
      message: `The limit is ${await dailyCap(settings, workspace)} a day.`,
    };
  }
  return null;
};

const routePost = async (context: WorkspaceContext, post: PostDocument, review: string[]) => {
  const settings = await loadSettings(post.workspace);
  const blocker =
    settings.status === "ACTIVE"
      ? await autoScheduleBlocker(settings, context.workspace, post, review)
      : { reason: "PAUSED" as const, message: null };

  if (!blocker) {
    try {
      await PublishingService.schedulePublish(context, {
        post,
        scheduledAt: post.scheduledAt ?? new Date(),
        socialAccountId: accountFor(settings, post.platform),
      });
      post.set({
        status: PostStatus.SCHEDULED,
        "autopilot.heldReason": null,
        "autopilot.heldMessage": null,
      });
      await post.save();
      await recordEvent({
        workspace: post.workspace,
        type: "SCHEDULED",
        message: `Scheduled for ${formatInZone(post.scheduledAt ?? new Date(), context.workspace.timezone ?? "UTC")}.`,
        details: { scheduledAt: post.scheduledAt?.toISOString() ?? null },
        slot: post.autopilot?.slot ?? null,
        post: post._id,
        platform: post.platform,
      });
      return;
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Scheduling failed.";
      if (!(error instanceof AppError)) {
        logger.error({ err: error, postId: post.id }, "Autopilot scheduling failed unexpectedly");
      }
      // The schedule row may exist even though queueing failed (Redis outage).
      // A post held for review must not still be scheduled to go out.
      await PublishingService.cancelLiveSchedule(post, null).catch((cancelError: unknown) =>
        logger.error({ err: cancelError, postId: post.id }, "Couldn't cancel a failed schedule"),
      );
      await holdPost(post, "SCHEDULING_FAILED", message.slice(0, 500));
      await recordEvent({
        workspace: post.workspace,
        type: "HELD_FOR_REVIEW",
        message: `${HOLD_REASONS.SCHEDULING_FAILED}: ${message}`,
        slot: post.autopilot?.slot ?? null,
        post: post._id,
        platform: post.platform,
        details: { reason: "SCHEDULING_FAILED" },
      });
      if (post.autopilot) {
        await NotificationEvents.autopilotNeedsReview(
          post.workspace,
          post.autopilot.slot,
          `${HOLD_REASONS.SCHEDULING_FAILED}: ${message}`,
        );
      }
      return;
    }
  }

  await holdPost(post, blocker.reason, blocker.message);
  await recordEvent({
    workspace: post.workspace,
    type: "HELD_FOR_REVIEW",
    message: blocker.message
      ? `${HOLD_REASONS[blocker.reason]}: ${blocker.message}`
      : `${HOLD_REASONS[blocker.reason]}.`,
    slot: post.autopilot?.slot ?? null,
    post: post._id,
    platform: post.platform,
    details: { reason: blocker.reason },
  });
  // A paused Autopilot already told people why; each held post would just add noise.
  if (post.autopilot && blocker.reason !== "PAUSED") {
    await NotificationEvents.autopilotNeedsReview(
      post.workspace,
      post.autopilot.slot,
      blocker.message
        ? `${HOLD_REASONS[blocker.reason]}: ${blocker.message}`
        : `${HOLD_REASONS[blocker.reason]}.`,
    );
  }
};

const handleGenerationFailure = async (slot: AutopilotSlotDocument, error: unknown, now: Date) => {
  const code =
    error instanceof AutopilotError
      ? error.code
      : error instanceof AppError
        ? error.code
        : "GENERATION_ERROR";
  const message =
    error instanceof AutopilotError || error instanceof AppError
      ? error.message
      : "Something went wrong while writing.";
  if (!(error instanceof AutopilotError || error instanceof AppError)) {
    logger.error({ err: error, slotId: slot._id.toString() }, "Autopilot generation crashed");
  }

  const retryAt = new Date(now.getTime() + RULES.generationRetryBaseMs * 2 ** (slot.attempts - 1));
  const latestUsefulRetry = slot.scheduledAt.getTime() - RULES.minimumLeadMinutes * MINUTE_MS;
  const final =
    slot.attempts >= RULES.maxGenerationAttempts || retryAt.getTime() > latestUsefulRetry;

  slot.set({
    status: final ? "FAILED" : "PLANNED",
    lockedAt: null,
    nextAttemptAt: final ? null : retryAt,
    lastError: { code, message: message.slice(0, 500), occurredAt: now },
  });
  await slot.save();
  await recordEvent({
    workspace: slot.workspace,
    type: "GENERATION_FAILED",
    message: final
      ? `Writing failed and won't be retried: ${message}`
      : `Writing failed (attempt ${slot.attempts}); retrying later: ${message}`,
    slot: slot._id,
    details: { code, attempt: slot.attempts, final, nextAttemptAt: final ? null : retryAt },
  });

  const settings = await AutopilotSettings.findOneAndUpdate(
    { workspace: slot.workspace },
    { $inc: { consecutiveGenerationFailures: 1 } },
    { returnDocument: "after" },
  );
  if (
    settings &&
    settings.consecutiveGenerationFailures >= RULES.autoPauseAfterGenerationFailures
  ) {
    await autoPause(
      slot.workspace,
      `Writing failed ${settings.consecutiveGenerationFailures} times in a row (last error: ${message})`,
    );
  }
};

export type SlotOutcome = "generated" | "skipped" | "failed" | "released" | "not-claimed";

/** Runs one slot through the pipeline. Safe to call concurrently: only one caller claims it. */
export const processSlot = async (
  slotToRun: AutopilotSlotDocument,
  now: Date = new Date(),
): Promise<SlotOutcome> => {
  const slot = await AutopilotSlot.findOneAndUpdate(
    { _id: slotToRun._id, workspace: slotToRun.workspace, status: "PLANNED" },
    { $set: { status: "GENERATING", lockedAt: now }, $inc: { attempts: 1 } },
    { returnDocument: "after" },
  );
  if (!slot) return "not-claimed";

  const release = async () => {
    slot.set({ status: "PLANNED", lockedAt: null, attempts: Math.max(0, slot.attempts - 1) });
    await slot.save();
    return "released" as const;
  };

  const [settings, workspace] = await Promise.all([
    loadSettings(slot.workspace),
    Workspace.findById(slot.workspace),
  ]);
  if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE || settings.status !== "ACTIVE") {
    return release();
  }
  const context = await actingContext(settings, workspace);
  if (!context) {
    await release();
    await autoPause(
      workspace._id,
      "The person who started Autopilot can no longer edit this workspace. An admin needs to resume it.",
    );
    return "released";
  }

  if (slot.scheduledAt.getTime() <= now.getTime() + RULES.minimumLeadMinutes * MINUTE_MS) {
    await skipSlot(
      slot,
      "MISSED",
      "Skipped: the posting time was too close to write and schedule safely.",
    );
    return "skipped";
  }

  const limits = await limitsOf(workspace);
  if (!limits.included) {
    await release();
    await autoPause(
      workspace._id,
      `Autopilot isn't included in the ${limits.label} plan. Upgrade, then resume it.`,
    );
    return "released";
  }
  const weeklyLimit = Math.min(settings.postsPerWeek, limits.autopilotPostsPerWeek);
  const writtenThisWeek = await AutopilotSlot.countDocuments({
    workspace: workspace._id,
    weekStart: slot.weekStart,
    status: "GENERATED",
  });
  if (writtenThisWeek >= weeklyLimit) {
    await skipSlot(
      slot,
      "WEEKLY_LIMIT",
      `Skipped: ${writtenThisWeek} posts were already written this week (limit ${weeklyLimit}).`,
    );
    return "skipped";
  }

  // Crash recovery: a previous run saved posts but died before finishing.
  const existing = await Post.find({ workspace: workspace._id, "autopilot.slot": slot._id });
  if (existing.length > 0) {
    slot.set({ status: "GENERATED", posts: existing.map((post) => post._id), lockedAt: null });
    await slot.save();
    for (const post of existing.filter(
      (item) => item.autopilot?.heldReason === "APPROVAL_REQUIRED",
    )) {
      await routePost(context, post, []);
    }
    return "generated";
  }

  let platforms = settings.platforms.slice(0, limits.autopilotPlatforms);
  const capacity =
    (await dailyCap(settings, workspace)) - (await postsOnDay(workspace, slot.localDay));
  if (capacity <= 0) {
    await skipSlot(
      slot,
      "DAILY_LIMIT",
      `Skipped: the daily limit for ${slot.localDay} is already reached.`,
    );
    return "skipped";
  }
  if (platforms.length > capacity) {
    await recordEvent({
      workspace: workspace._id,
      type: "SLOT_SKIPPED",
      message: `Only ${capacity} more ${capacity === 1 ? "post fits" : "posts fit"} on ${slot.localDay}; skipping ${platforms
        .slice(capacity)
        .map(label)
        .join(", ")}.`,
      slot: slot._id,
      details: { code: "DAILY_LIMIT_PARTIAL", dropped: platforms.slice(capacity) },
    });
    platforms = platforms.slice(0, capacity);
  }

  const history = await AutopilotSlot.find({
    workspace: workspace._id,
    status: "GENERATED",
  })
    .select("pillar format")
    .sort({ scheduledAt: -1 })
    .limit(20)
    .lean();
  slot.set({
    platforms,
    pillar: leastRecentlyUsed(
      settings.pillars,
      history.map((item) => item.pillar ?? null),
    ),
    format: leastRecentlyUsed(
      settings.formats,
      history.map((item) => item.format ?? null),
    ),
  });
  await slot.save();

  let created: { post: PostDocument; review: string[] }[];
  try {
    const [recent, strategy, insights] = await Promise.all([
      loadRecentContent(workspace._id),
      ContentStrategyService.getActiveStrategyContext(context),
      PerformanceInsightsService.getApprovedInsightsContext(context),
    ]);
    const prompts = { strategy, insights };

    const topic = await chooseTopic(context, slot, recent, prompts);
    slot.set({ topic: topic.topic, angle: topic.angle });
    await slot.save();
    await recordEvent({
      workspace: workspace._id,
      type: "TOPIC_SELECTED",
      message: `Topic: "${topic.topic}"${slot.pillar ? ` (pillar: ${slot.pillar})` : ""}.`,
      slot: slot._id,
      details: { topic: topic.topic, angle: topic.angle, pillar: slot.pillar, format: slot.format },
    });

    const format = AUTOPILOT_FORMATS[slot.format ?? "TIPS"];
    const instructions = [
      `Write this as ${format.brief}.`,
      topic.angle && `The point to make: ${topic.angle}`,
      slot.pillar && `Content pillar: ${slot.pillar}.`,
      "This will publish without a person rewriting it, so don't use placeholders like [link] or [name].",
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 1000);

    const { accepted, generation } = await writeDrafts(
      context,
      slot,
      topic,
      instructions,
      recent,
      prompts,
    );
    if (accepted.length === 0 || !generation) {
      throw new AutopilotError(
        "NO_USABLE_DRAFTS",
        "No platform version passed the repeat and quality checks.",
      );
    }

    // Written, but a pause while writing means nothing gets saved or scheduled.
    if ((await loadSettings(workspace._id)).status !== "ACTIVE") {
      await recordEvent({
        workspace: workspace._id,
        type: "GENERATION_DISCARDED",
        message: "Autopilot was paused while writing, so the result was thrown away.",
        slot: slot._id,
      });
      await release();
      return "released";
    }

    const written: { post: PostDocument; review: string[] }[] = [];
    for (const draft of accepted) {
      const post = await PostService.createAutopilotPost(context, {
        platform: draft.platform,
        topic: topic.topic,
        instructions,
        pillar: slot.pillar,
        content: draft.content,
        scheduledAt: slot.scheduledAt,
        slot: slot._id,
        generation,
      });
      written.push({ post, review: draft.review });
      await recordEvent({
        workspace: workspace._id,
        type: "CONTENT_GENERATED",
        message: `${label(draft.platform)} post written.`,
        slot: slot._id,
        post: post._id,
        platform: draft.platform,
        details: {
          promptVersion: generation.promptVersion,
          model: generation.model,
          reviewNotes: draft.review,
        },
      });
    }

    slot.set({
      status: "GENERATED",
      posts: written.map(({ post }) => post._id),
      lockedAt: null,
      nextAttemptAt: null,
      lastError: null,
    });
    await slot.save();
    await AutopilotSettings.updateOne(
      { workspace: workspace._id },
      { $set: { consecutiveGenerationFailures: 0 } },
    );

    created = written;
  } catch (error) {
    await handleGenerationFailure(slot, error, now);
    return "failed";
  }

  // Outside the generation try: the slot is already written, so a routing
  // problem must not be counted as a failed generation or retried.
  for (const { post, review } of created) {
    try {
      await routePost(context, post, review);
    } catch (error) {
      logger.error({ err: error, postId: post.id }, "Autopilot couldn't route a written post");
    }
  }
  return "generated";
};

/** Approvals whose time came and went are marked, once, so the queue says so. */
const expireApprovals = async (workspaceId: Types.ObjectId, now: Date) => {
  const posts = await Post.find({
    workspace: workspaceId,
    status: PostStatus.READY,
    "autopilot.heldReason": { $nin: [null, "EXPIRED"] },
    scheduledAt: { $lt: now },
  });
  for (const post of posts) {
    const previous = post.autopilot?.heldReason;
    await holdPost(post, "EXPIRED");
    await recordEvent({
      workspace: workspaceId,
      type: "APPROVAL_EXPIRED",
      message:
        "Its posting time passed before anyone approved it. Approve it with a new time, or reject it.",
      slot: post.autopilot?.slot ?? null,
      post: post._id,
      platform: post.platform,
      details: { previousReason: previous },
    });
  }
};

const runWorkspace = async (settings: AutopilotSettingsDocument, now: Date) => {
  const workspace = await Workspace.findById(settings.workspace);
  if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) return 0;

  await expireApprovals(workspace._id, now);
  if (settings.status !== "ACTIVE") return 0;

  // A worker that crashed mid-write left its slot locked; put it back in line.
  await AutopilotSlot.updateMany(
    {
      workspace: workspace._id,
      status: "GENERATING",
      lockedAt: { $lt: new Date(now.getTime() - RULES.generationLockTimeoutMs) },
    },
    { $set: { status: "PLANNED", lockedAt: null } },
  );

  const missed = await AutopilotSlot.find({
    workspace: workspace._id,
    status: "PLANNED",
    scheduledAt: { $lte: new Date(now.getTime() + RULES.minimumLeadMinutes * MINUTE_MS) },
  });
  for (const slot of missed) {
    await skipSlot(slot, "MISSED", "Skipped: the posting time passed before it could be written.");
  }

  await planSlots(settings, workspace, now);

  const leadHours = settings.approvalRequired ? RULES.approvalLeadHours : RULES.autoLeadHours;
  const due = await AutopilotSlot.find({
    workspace: workspace._id,
    status: "PLANNED",
    scheduledAt: { $lte: new Date(now.getTime() + leadHours * HOUR_MS) },
    $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
  })
    .sort({ scheduledAt: 1 })
    .limit(RULES.maxSlotsPerSweep);

  let processed = 0;
  for (const slot of due) {
    const outcome = await processSlot(slot, now);
    if (outcome !== "not-claimed") processed += 1;
    if (outcome === "released") break;
  }
  await AutopilotSettings.updateOne({ workspace: workspace._id }, { $set: { lastSweepAt: now } });
  return processed;
};

/** The worker's periodic run over every workspace with Autopilot on or paused. */
export const runAutopilotSweep = async ({ now = new Date() }: { now?: Date } = {}) => {
  const all = await AutopilotSettings.find({ status: { $in: ["ACTIVE", "PAUSED"] } }).setOptions(
    unscoped,
  );
  let processed = 0;
  for (const settings of all) {
    try {
      processed += await runWorkspace(settings, now);
    } catch (error) {
      // One workspace failing must not stop the rest.
      logger.error(
        { err: error, workspaceId: settings.workspace.toString() },
        "Autopilot sweep failed for workspace",
      );
    }
  }
  return { workspaces: all.length, processed };
};

export const deleteWorkspaceAutopilot = async (workspaceId: Types.ObjectId) => {
  await Promise.all([
    AutopilotSettings.deleteMany({ workspace: workspaceId }),
    AutopilotSlot.deleteMany({ workspace: workspaceId }),
    AutopilotEvent.deleteMany({ workspace: workspaceId }),
  ]);
};
