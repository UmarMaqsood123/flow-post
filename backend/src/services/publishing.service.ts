import { hostname } from "node:os";
import type { Types } from "mongoose";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ErrorCode, HttpStatus } from "../constants/http.constant";
import { type CreatePlatformValue, PostStatus } from "../constants/post.constant";
import {
  NEEDS_REVIEW_MESSAGE,
  PublishAttemptStatus,
  PublishJobStatus,
  PUBLISHING_LIMITS as LIMITS,
  ScheduleStatus,
} from "../constants/publishing.constant";
import { SocialAccountStatus } from "../constants/social.constant";
import { SocialProviderError } from "../integrations/social/errors";
import { PLATFORM_GUIDELINES } from "../integrations/ai/prompts/platforms";
import { getSocialProviderRegistry } from "../integrations/social/registry";
import { Post, type PostDocument } from "../models/post.model";
import { PostVersion } from "../models/postVersion.model";
import { PublishAttempt, type PublishAttemptDocument } from "../models/publishAttempt.model";
import { PublishJob, type PublishJobDocument } from "../models/publishJob.model";
import { Schedule, type ScheduleDocument } from "../models/schedule.model";
import { SocialAccount } from "../models/socialAccount.model";
import type { StoredFileDocument } from "../models/file.model";
import type { VideoFormatValue } from "../constants/media.constant";
import type { SocialCapability } from "../integrations/social/capabilities";
import * as AutopilotAudit from "./autopilotAudit.service";
import * as EntitlementService from "./entitlement.service";
import * as PostMediaService from "./postMedia.service";
import { getPublishQueue } from "../queues/publish.queue";
import { AppError } from "../utils/appError.util";
import { createSemaphore } from "../utils/semaphore.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import * as SocialAccountService from "./socialAccount.service";
import { Workspace } from "../models/workspace.model";
import { WorkspaceStatus } from "../constants/workspace.constant";
import * as NotificationEvents from "./notificationEvents.service";

const WORKER_ID = `${hostname()}:${process.pid}`;
const withVideoSlot = createSemaphore(env.PUBLISH_VIDEO_CONCURRENCY);
const unscoped = { skipWorkspaceScope: true } as const;

// ── Public shapes ──────────────────────────────────────────

export interface PublicSchedule {
  id: string;
  postId: string;
  platform: string;
  socialAccountId: string;
  scheduledAt: Date;
  status: string;
  attempts: number;
  maxAttempts: number;
  publishedAt: Date | null;
  result: { providerPostId: string; url: string | null } | null;
  lastError: { code: string; message: string; occurredAt: Date } | null;
  /** The platform was called but never answered: a person must check before retrying. */
  needsReview: boolean;
  createdAt: Date;
}

export interface PublicPublishAttempt {
  attempt: number;
  status: string;
  requestSent: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

export interface PublicPublishJob {
  id: string;
  status: string;
  runAt: Date;
  attempts: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  outcomeUnknown: boolean;
  error: { code: string; message: string; retryable: boolean } | null;
  attemptHistory: PublicPublishAttempt[];
}

const toPublicSchedule = (schedule: ScheduleDocument): PublicSchedule => ({
  id: schedule._id.toString(),
  postId: schedule.post.toString(),
  platform: schedule.platform,
  socialAccountId: schedule.socialAccount.toString(),
  scheduledAt: schedule.scheduledAt,
  status: schedule.status,
  attempts: schedule.attempts,
  maxAttempts: schedule.maxAttempts,
  publishedAt: schedule.publishedAt ?? null,
  // Subdocuments are mapped field by field: spreading one copies Mongoose internals, not the data.
  result: schedule.result
    ? { providerPostId: schedule.result.providerPostId, url: schedule.result.url ?? null }
    : null,
  lastError: schedule.lastError
    ? {
        code: schedule.lastError.code,
        message: schedule.lastError.message,
        occurredAt: schedule.lastError.occurredAt,
      }
    : null,
  needsReview: schedule.needsReview,
  createdAt: schedule.createdAt,
});

// ── Validation ─────────────────────────────────────────────

const clip = (value: string) => value.slice(0, LIMITS.errorMessage);

/** Everything a publish needs from the post's current version. */
interface PublishPlan {
  text: string;
  title: string | null;
  files: StoredFileDocument[];
  videoFormat: VideoFormatValue | null;
  capability: SocialCapability;
}

/**
 * What the post would publish, or why it can't yet. Text posts need text;
 * media posts need the media their platform requires, and the caption is
 * optional because every media platform allows posting without one.
 */
const loadPublishPlan = async (
  post: PostDocument,
): Promise<{ plan: PublishPlan } | { problem: { code: string; message: string } }> => {
  const version = post.currentVersion
    ? await PostVersion.findOne({
        _id: post.currentVersion,
        post: post._id,
        workspace: post.workspace,
      })
    : null;
  if (!version) {
    return {
      problem: { code: "POST_EMPTY", message: "Write the post before scheduling it to publish" },
    };
  }

  const mediaIds = version.media ?? [];
  const files = await PostMediaService.loadAttachments(post.workspace, mediaIds);
  if (files.length < mediaIds.length) {
    return {
      problem: {
        code: "MEDIA_MISSING",
        message: "An attached file was deleted from the media library. Attach it again to publish.",
      },
    };
  }
  const mediaProblem = PostMediaService.attachmentProblem(post.platform, files, {
    requireMedia: true,
  });
  if (mediaProblem) return { problem: { code: "MEDIA_INVALID", message: mediaProblem } };

  const text = version.content.text.trim();
  if (files.length === 0 && text.length === 0) {
    return {
      problem: { code: "POST_EMPTY", message: "Write the post before scheduling it to publish" },
    };
  }

  const videoFormat = version.videoFormat ?? null;
  return {
    plan: {
      text,
      title: version.content.title?.trim() || null,
      files,
      videoFormat,
      capability: PostMediaService.requiredCapability(files, videoFormat),
    },
  };
};

/** Platform names reach users as "LinkedIn", not "LINKEDIN". */
const label = (platform: CreatePlatformValue) => PLATFORM_GUIDELINES[platform].label;

/**
 * Picks the account to publish to: the one asked for, or the only connected
 * account for that platform. Several accounts means the user has to choose.
 */
const resolveAccount = async (
  workspaceId: Types.ObjectId,
  platform: CreatePlatformValue,
  socialAccountId?: string,
) => {
  if (socialAccountId) {
    const account = await SocialAccount.findOne({ _id: socialAccountId, workspace: workspaceId });
    if (!account) throw AppError.notFound("Social account not found");
    if (account.platform !== platform) {
      throw AppError.badRequest(`That account isn't a ${label(platform)} account`);
    }
    if (account.status !== SocialAccountStatus.CONNECTED) {
      throw new AppError(
        "That account needs reconnecting before it can publish.",
        HttpStatus.CONFLICT,
        { code: ErrorCode.SOCIAL_REAUTH_REQUIRED },
      );
    }
    return account;
  }

  const connected = await SocialAccount.find({
    workspace: workspaceId,
    platform,
    status: SocialAccountStatus.CONNECTED,
  }).limit(2);

  if (connected.length === 0) {
    throw new AppError(
      `Connect a ${label(platform)} account before scheduling this post.`,
      HttpStatus.CONFLICT,
      { code: ErrorCode.SOCIAL_ACCOUNT_DISCONNECTED },
    );
  }
  if (connected.length > 1) {
    throw AppError.badRequest("Choose which account this post should publish to");
  }
  return connected[0];
};

/** Fails unless the platform's provider can publish this kind of post. */
const assertPublishable = (platform: CreatePlatformValue, capability: SocialCapability) => {
  const registry = getSocialProviderRegistry();
  if (!registry.has(platform)) {
    throw new AppError(
      `${label(platform)} publishing isn't supported yet`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { code: ErrorCode.SOCIAL_CAPABILITY_UNSUPPORTED },
    );
  }
  const provider = registry.get(platform);
  SocialAccountService.assertCapability(provider, capability);
  return provider;
};

/** True when a post can be published at all (content and a provider that supports it). */
export const canQueueForPublishing = async (post: PostDocument): Promise<boolean> => {
  const loaded = await loadPublishPlan(post);
  if ("problem" in loaded) return false;
  const registry = getSocialProviderRegistry();
  return (
    registry.has(post.platform) && registry.get(post.platform).supports(loaded.plan.capability)
  );
};

// ── Scheduling ─────────────────────────────────────────────

const isDuplicateKey = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

const nextJobNumber = async (schedule: ScheduleDocument) =>
  (await PublishJob.countDocuments({ schedule: schedule._id }).setOptions(unscoped)) + 1;

/** Creates the job record, then queues it. The queue id is derived, so re-adding is a no-op. */
const createJob = async (schedule: ScheduleDocument, runAt: Date) => {
  const scheduleId = schedule._id.toString();
  let job: PublishJobDocument | null = null;
  // Numbering by count can collide when two jobs are created at once; the unique
  // index catches it and the next number is tried.
  for (let attempt = 0; !job; attempt += 1) {
    const sequence = (await nextJobNumber(schedule)) + attempt;
    try {
      job = await PublishJob.create({
        workspace: schedule.workspace,
        schedule: schedule._id,
        post: schedule.post,
        socialAccount: schedule.socialAccount,
        platform: schedule.platform,
        queueJobId: `publish:${scheduleId}:${sequence}`,
        idempotencyKey: `${scheduleId}:${sequence}`,
        status: PublishJobStatus.QUEUED,
        runAt,
        maxAttempts: schedule.maxAttempts,
      });
    } catch (error) {
      if (!isDuplicateKey(error) || attempt >= 4) throw error;
    }
  }

  await Schedule.updateOne({ _id: schedule._id }, { $set: { currentJob: job._id } }).setOptions(
    unscoped,
  );
  schedule.currentJob = job._id;

  await getPublishQueue().add(
    {
      publishJobId: job._id.toString(),
      scheduleId,
      postId: schedule.post.toString(),
      workspaceId: schedule.workspace.toString(),
    },
    {
      jobId: job.queueJobId,
      delayMs: runAt.getTime() - Date.now(),
      attempts: schedule.maxAttempts,
      backoffMs: env.PUBLISH_BACKOFF_MS,
    },
  );

  logger.info(
    {
      scheduleId,
      publishJobId: job._id.toString(),
      postId: schedule.post.toString(),
      platform: schedule.platform,
      runAt,
    },
    "Publish job queued",
  );
  return job;
};

/** Ends the live schedule for a post (if any) and takes its job out of the queue. */
export const cancelLiveSchedule = async (
  post: PostDocument,
  cancelledBy: Types.ObjectId | null,
): Promise<boolean> => {
  // Atomic, and never while a worker is sending it: cancelling mid-publish and
  // scheduling again could post twice.
  const schedule = await Schedule.findOneAndUpdate(
    {
      post: post._id,
      workspace: post.workspace,
      isLive: true,
      status: { $ne: ScheduleStatus.PROCESSING },
    },
    {
      $set: {
        status: ScheduleStatus.CANCELLED,
        isLive: null,
        cancelledAt: new Date(),
        cancelledBy,
      },
    },
    { returnDocument: "after" },
  );
  if (!schedule) {
    if (await Schedule.exists({ post: post._id, workspace: post.workspace, isLive: true })) {
      throw AppError.conflict(
        "This post is being published right now. Wait for it to finish, then try again.",
      );
    }
    return false;
  }

  const jobs = await PublishJob.find({
    schedule: schedule._id,
    status: PublishJobStatus.QUEUED,
  }).setOptions(unscoped);
  for (const job of jobs) {
    const cancelled = await PublishJob.updateOne(
      { _id: job._id, status: PublishJobStatus.QUEUED },
      { $set: { status: PublishJobStatus.CANCELLED, finishedAt: new Date() } },
    ).setOptions(unscoped);
    if (cancelled.modifiedCount > 0) await getPublishQueue().remove(job.queueJobId);
  }

  logger.info(
    { scheduleId: schedule._id.toString(), postId: post._id.toString() },
    "Schedule cancelled",
  );
  return true;
};

export interface SchedulePublishInput {
  post: PostDocument;
  scheduledAt: Date;
  socialAccountId?: string;
}

/**
 * Validates the post and account, replaces any live schedule, and queues a
 * delayed job. Nothing is queued until the database row exists, so a restart
 * can always find the work again.
 */
export const schedulePublish = async (
  { workspace, user }: WorkspaceContext,
  { post, scheduledAt, socialAccountId }: SchedulePublishInput,
): Promise<PublicSchedule> => {
  const loaded = await loadPublishPlan(post);
  if ("problem" in loaded) {
    throw AppError.badRequest(loaded.problem.message, [
      { path: "media", message: loaded.problem.message },
    ]);
  }
  const maxAhead = Date.now() + LIMITS.maxScheduleDays * 86_400_000;
  if (scheduledAt.getTime() > maxAhead) {
    throw AppError.badRequest(`Schedule posts within the next ${LIMITS.maxScheduleDays} days`);
  }

  assertPublishable(post.platform, loaded.plan.capability);
  const account = await resolveAccount(workspace._id, post.platform, socialAccountId);
  await EntitlementService.assertCanSchedulePost(workspace, post._id);

  await cancelLiveSchedule(post, user._id);

  let schedule: ScheduleDocument;
  try {
    schedule = await Schedule.create({
      workspace: workspace._id,
      post: post._id,
      socialAccount: account._id,
      platform: post.platform,
      scheduledAt,
      status: ScheduleStatus.SCHEDULED,
      isLive: true,
      maxAttempts: env.PUBLISH_MAX_ATTEMPTS,
      createdBy: user._id,
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw AppError.conflict("This post is already scheduled. Reload and try again.");
    }
    throw error;
  }

  await createJob(schedule, scheduledAt);
  return toPublicSchedule(schedule);
};

export const getScheduleForPost = async (
  { workspace }: WorkspaceContext,
  postId: string,
): Promise<{ schedule: PublicSchedule | null; jobs: PublicPublishJob[] }> => {
  const schedule = await Schedule.findOne({ post: postId, workspace: workspace._id }).sort({
    createdAt: -1,
  });
  if (!schedule) return { schedule: null, jobs: [] };

  const jobs = await PublishJob.find({ schedule: schedule._id, workspace: workspace._id }).sort({
    createdAt: 1,
  });
  const attempts = await PublishAttempt.find({
    schedule: schedule._id,
    workspace: workspace._id,
  }).sort({ attempt: 1 });

  return {
    schedule: toPublicSchedule(schedule),
    jobs: jobs.map((job) => ({
      id: job._id.toString(),
      status: job.status,
      runAt: job.runAt,
      attempts: job.attempts,
      startedAt: job.startedAt ?? null,
      finishedAt: job.finishedAt ?? null,
      outcomeUnknown: job.outcomeUnknown,
      error: job.error
        ? { code: job.error.code, message: job.error.message, retryable: job.error.retryable }
        : null,
      attemptHistory: attempts
        .filter((attempt) => attempt.publishJob.equals(job._id))
        .map((attempt) => ({
          attempt: attempt.attempt,
          status: attempt.status,
          requestSent: attempt.requestSent,
          startedAt: attempt.startedAt,
          finishedAt: attempt.finishedAt ?? null,
          durationMs: attempt.durationMs ?? null,
          error: attempt.error
            ? {
                code: attempt.error.code,
                message: attempt.error.message,
                retryable: attempt.error.retryable,
              }
            : null,
        })),
    })),
  };
};

// ── Running a job ──────────────────────────────────────────

export type PublishOutcome =
  | { outcome: "published"; providerPostId: string }
  | { outcome: "skipped"; reason: string }
  | { outcome: "retry"; error: Error }
  | { outcome: "failed"; message: string; needsReview: boolean };

interface Failure {
  code: string;
  message: string;
  retryable: boolean;
  /** The platform may or may not have taken the post. */
  outcomeUnknown: boolean;
}

const classify = (error: unknown): Failure => {
  if (error instanceof SocialProviderError) {
    return {
      code: error.kind,
      message: clip(error.message),
      // A timeout leaves the outcome unknown, so it must never be retried blindly.
      retryable: error.retryable && !error.outcomeUnknown,
      outcomeUnknown: error.outcomeUnknown,
    };
  }
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: clip(error.message),
      retryable: error.statusCode >= 500,
      outcomeUnknown: false,
    };
  }
  return {
    code: "UNEXPECTED_ERROR",
    message: clip(error instanceof Error ? error.message : "Unexpected error"),
    retryable: false,
    outcomeUnknown: false,
  };
};

const finishAttempt = async (
  attempt: PublishAttemptDocument,
  patch: Partial<PublishAttemptDocument> & { status: string },
) => {
  const finishedAt = new Date();
  attempt.set({
    ...patch,
    finishedAt,
    durationMs: finishedAt.getTime() - attempt.startedAt.getTime(),
  });
  await attempt.save();
};

const markScheduleFailed = async (
  schedule: ScheduleDocument,
  failure: { code: string; message: string },
  needsReview: boolean,
) => {
  // Only a live schedule fails: one that was cancelled or replaced keeps its state.
  const updated = await Schedule.updateOne(
    { _id: schedule._id, isLive: true },
    {
      $set: {
        status: ScheduleStatus.FAILED,
        isLive: null,
        needsReview,
        lastError: { ...failure, occurredAt: new Date() },
      },
    },
  ).setOptions(unscoped);
  if (updated.modifiedCount === 0) return;
  await Post.updateOne({ _id: schedule.post }, { $set: { status: PostStatus.FAILED } }).setOptions(
    unscoped,
  );
  await AutopilotAudit.onPublishFailed(schedule.post, failure, needsReview);
  await NotificationEvents.postFailed(schedule._id, schedule.post, failure, needsReview);
};

const failJob = async (
  job: PublishJobDocument,
  schedule: ScheduleDocument,
  failure: Failure,
): Promise<PublishOutcome> => {
  const finished = await PublishJob.updateOne(
    {
      _id: job._id,
      status: { $in: [PublishJobStatus.QUEUED, PublishJobStatus.PROCESSING] },
    },
    {
      $set: {
        status: PublishJobStatus.FAILED,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        outcomeUnknown: failure.outcomeUnknown,
        error: {
          code: failure.code,
          message: failure.message,
          occurredAt: new Date(),
          retryable: failure.retryable,
        },
      },
    },
  ).setOptions(unscoped);
  if (finished.modifiedCount === 0) {
    return { outcome: "skipped", reason: "already-finished" };
  }

  const message = failure.outcomeUnknown ? NEEDS_REVIEW_MESSAGE : failure.message;
  await markScheduleFailed(
    schedule,
    { code: failure.code, message: clip(message) },
    failure.outcomeUnknown,
  );
  return { outcome: "failed", message, needsReview: failure.outcomeUnknown };
};

/** Ends this worker's hold on a job with a final status. */
const releaseJob = (job: PublishJobDocument, status: string) =>
  PublishJob.updateOne(
    { _id: job._id, lockedBy: WORKER_ID, status: PublishJobStatus.PROCESSING },
    { $set: { status, finishedAt: new Date(), lockedAt: null, lockedBy: null } },
  ).setOptions(unscoped);

/** Renews `lockedAt` while this worker publishes. Returns the function that stops it. */
const startLockHeartbeat = (jobId: Types.ObjectId) => {
  const intervalMs = Math.max(5_000, Math.floor(env.PUBLISH_LOCK_TIMEOUT_MS / 3));
  const timer = setInterval(() => {
    PublishJob.updateOne(
      { _id: jobId, lockedBy: WORKER_ID, status: PublishJobStatus.PROCESSING },
      { $set: { lockedAt: new Date() } },
    )
      .setOptions(unscoped)
      .catch((error: unknown) =>
        logger.warn({ err: error, publishJobId: jobId.toString() }, "Lock heartbeat failed"),
      );
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};

export interface RunPublishJobInput {
  publishJobId: string;
  /** BullMQ's attempt counter, for logging. */
  queueAttempt?: number;
}

/**
 * Publishes one job. Safe to call twice: finished work is reported as skipped,
 * and a job whose platform call never reported back is failed for review rather
 * than published again.
 */
export const runPublishJob = async ({
  publishJobId,
  queueAttempt = 1,
}: RunPublishJobInput): Promise<PublishOutcome> => {
  const job = await PublishJob.findById(publishJobId).setOptions(unscoped);
  if (!job) return { outcome: "skipped", reason: "job-missing" };

  const log = logger.child({
    publishJobId,
    scheduleId: job.schedule.toString(),
    postId: job.post.toString(),
    platform: job.platform,
    workspaceId: job.workspace.toString(),
    queueAttempt,
    worker: WORKER_ID,
  });

  if (job.status === PublishJobStatus.SUCCEEDED) {
    log.info("Publish job already succeeded; nothing to do");
    return { outcome: "skipped", reason: "already-published" };
  }
  if (job.status === PublishJobStatus.CANCELLED) {
    return { outcome: "skipped", reason: "cancelled" };
  }
  if (job.status === PublishJobStatus.FAILED) {
    // Already given up on: never quietly try the platform again.
    log.warn("Publish job already failed; not trying again");
    return { outcome: "skipped", reason: "already-failed" };
  }

  let schedule = await Schedule.findById(job.schedule).setOptions(unscoped);
  if (!schedule) return { outcome: "skipped", reason: "schedule-missing" };
  if (schedule.status === ScheduleStatus.CANCELLED || !schedule.isLive) {
    await PublishJob.updateOne(
      { _id: job._id, status: PublishJobStatus.QUEUED },
      { $set: { status: PublishJobStatus.CANCELLED, finishedAt: new Date() } },
    ).setOptions(unscoped);
    log.info("Schedule was cancelled before the job ran");
    return { outcome: "skipped", reason: "cancelled" };
  }
  if (schedule.status === ScheduleStatus.PUBLISHED || schedule.publishedAt) {
    job.set({ status: PublishJobStatus.SUCCEEDED, finishedAt: new Date() });
    await job.save();
    return { outcome: "skipped", reason: "already-published" };
  }

  // A previous attempt reached the platform but never reported back. Publishing
  // again could post twice, so this needs a person, not a retry.
  const unresolved = await PublishAttempt.findOne({
    publishJob: job._id,
    status: PublishAttemptStatus.IN_FLIGHT,
    requestSent: true,
  }).setOptions(unscoped);
  if (unresolved) {
    log.error(
      { attempt: unresolved.attempt },
      "Previous attempt never reported back; refusing to publish again",
    );
    await finishAttempt(unresolved, {
      status: PublishAttemptStatus.FAILED,
      error: { code: "OUTCOME_UNKNOWN", message: clip(NEEDS_REVIEW_MESSAGE), retryable: false },
    });
    return failJob(job, schedule, {
      code: "OUTCOME_UNKNOWN",
      message: NEEDS_REVIEW_MESSAGE,
      retryable: false,
      outcomeUnknown: true,
    });
  }

  // An archived (or deleted) workspace publishes nothing, whatever is still queued.
  const workspace = await Workspace.findById(job.workspace).select("status").lean();
  if (workspace?.status !== WorkspaceStatus.ACTIVE) {
    await Schedule.updateOne(
      { _id: schedule._id, isLive: true, status: { $ne: ScheduleStatus.PROCESSING } },
      { $set: { status: ScheduleStatus.CANCELLED, isLive: null, cancelledAt: new Date() } },
    ).setOptions(unscoped);
    await PublishJob.updateOne(
      { _id: job._id, status: PublishJobStatus.QUEUED },
      { $set: { status: PublishJobStatus.CANCELLED, finishedAt: new Date() } },
    ).setOptions(unscoped);
    log.warn("Workspace isn't active; publish stopped");
    return { outcome: "skipped", reason: "workspace-inactive" };
  }

  // A paused Autopilot stops its posts here, even if their jobs were already queued.
  const target = await Post.findById(schedule.post).setOptions(unscoped);
  if (target && (await AutopilotAudit.publishBlockedByPause(target))) {
    await Schedule.updateOne(
      { _id: schedule._id, isLive: true, status: { $ne: ScheduleStatus.PROCESSING } },
      { $set: { status: ScheduleStatus.CANCELLED, isLive: null, cancelledAt: new Date() } },
    ).setOptions(unscoped);
    await PublishJob.updateOne(
      { _id: job._id, status: PublishJobStatus.QUEUED },
      { $set: { status: PublishJobStatus.CANCELLED, finishedAt: new Date() } },
    ).setOptions(unscoped);
    await AutopilotAudit.recordPublishBlocked(target);
    log.info("Autopilot is paused; publish stopped");
    return { outcome: "skipped", reason: "autopilot-paused" };
  }

  // Claim the job. Only one worker gets past this, even across processes.
  const staleBefore = new Date(Date.now() - env.PUBLISH_LOCK_TIMEOUT_MS);
  const claimed = await PublishJob.findOneAndUpdate(
    {
      _id: job._id,
      status: { $in: [PublishJobStatus.QUEUED, PublishJobStatus.PROCESSING] },
      $or: [{ lockedAt: null }, { lockedAt: { $lte: staleBefore } }],
    },
    {
      $set: {
        status: PublishJobStatus.PROCESSING,
        lockedAt: new Date(),
        lockedBy: WORKER_ID,
        startedAt: job.startedAt ?? new Date(),
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after" },
  ).setOptions(unscoped);

  if (!claimed) {
    log.warn("Publish job is held by another worker");
    return { outcome: "skipped", reason: "locked" };
  }

  // Claim the schedule too. If it was cancelled or replaced since it was read,
  // this fails and nothing is sent, so a stale copy can never revive it.
  const claimedSchedule = await Schedule.findOneAndUpdate(
    {
      _id: schedule._id,
      isLive: true,
      status: { $in: [ScheduleStatus.SCHEDULED, ScheduleStatus.PROCESSING] },
    },
    { $set: { status: ScheduleStatus.PROCESSING }, $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).setOptions(unscoped);
  if (!claimedSchedule) {
    await releaseJob(claimed, PublishJobStatus.CANCELLED);
    log.info("Schedule was cancelled while the job was being claimed");
    return { outcome: "skipped", reason: "cancelled" };
  }
  schedule = claimedSchedule;
  const liveSchedule = claimedSchedule;
  await Post.updateOne({ _id: schedule.post }, { $set: { status: PostStatus.PUBLISHING } })
    .setOptions(unscoped)
    .exec();

  const post = await Post.findById(schedule.post).setOptions(unscoped);
  if (!post)
    return failJob(claimed, schedule, {
      code: "POST_MISSING",
      message: "The post no longer exists.",
      retryable: false,
      outcomeUnknown: false,
    });

  // Checked again at publish time: media can be removed from the library after scheduling.
  const loaded = await loadPublishPlan(post);
  if ("problem" in loaded) {
    return failJob(claimed, schedule, {
      code: loaded.problem.code,
      message: loaded.problem.message,
      retryable: false,
      outcomeUnknown: false,
    });
  }
  const { plan } = loaded;

  const attempt = await PublishAttempt.create({
    workspace: schedule.workspace,
    publishJob: claimed._id,
    schedule: schedule._id,
    post: schedule.post,
    attempt: claimed.attempts,
    status: PublishAttemptStatus.IN_FLIGHT,
    startedAt: new Date(),
    worker: WORKER_ID,
  });

  log.info({ attempt: claimed.attempts }, "Publishing post");

  // Long uploads outlast the lock timeout; keep the lock fresh so recovery
  // doesn't mistake a working publish for a crashed one.
  const stopHeartbeat = startLockHeartbeat(claimed._id);
  const isVideo = PostMediaService.publishKindOf(plan.files) === "VIDEO";
  const send = <T>(task: () => Promise<T>) => (isVideo ? withVideoSlot(task) : task());
  try {
    const result = await send(() =>
      SocialAccountService.publishForWorker(schedule.workspace, schedule.socialAccount.toString(), {
        text: plan.text,
        title: plan.title,
        media: plan.files.map(PostMediaService.toMediaAsset),
        mediaKind: PostMediaService.publishKindOf(plan.files),
        videoFormat: plan.videoFormat,
        // From here on the platform may have the post, so a retry is no longer safe.
        onRequestStart: async () => {
          attempt.requestSent = true;
          await attempt.save();
        },
      }),
    );

    stopHeartbeat();
    await finishAttempt(attempt, {
      status: PublishAttemptStatus.SUCCEEDED,
      result: { providerPostId: result.providerPostId, url: result.url },
    });
    // The platform has the post: that's recorded whatever else happened meanwhile.
    await PublishJob.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: PublishJobStatus.SUCCEEDED,
          finishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          result: { providerPostId: result.providerPostId, url: result.url },
          error: null,
        },
      },
    ).setOptions(unscoped);
    await Schedule.updateOne(
      { _id: liveSchedule._id },
      {
        $set: {
          status: ScheduleStatus.PUBLISHED,
          isLive: null,
          publishedAt: result.publishedAt,
          result: { providerPostId: result.providerPostId, url: result.url },
          lastError: null,
          needsReview: false,
        },
      },
    ).setOptions(unscoped);
    await Post.updateOne(
      { _id: schedule.post },
      { $set: { status: PostStatus.PUBLISHED, publishedAt: result.publishedAt } },
    )
      .setOptions(unscoped)
      .exec();

    await AutopilotAudit.onPublished(schedule.post, result.url);
    await NotificationEvents.postPublished(liveSchedule._id, schedule.post);
    log.info({ providerPostId: result.providerPostId }, "Post published");
    return { outcome: "published", providerPostId: result.providerPostId };
  } catch (error) {
    stopHeartbeat();
    const failure = classify(error);
    await finishAttempt(attempt, {
      status: PublishAttemptStatus.FAILED,
      error: { code: failure.code, message: failure.message, retryable: failure.retryable },
    });

    const attemptsLeft = claimed.attempts < claimed.maxAttempts;
    if (failure.retryable && attemptsLeft) {
      // Back to scheduled only if nobody cancelled it meanwhile.
      const stillLive = await Schedule.updateOne(
        { _id: liveSchedule._id, isLive: true, status: ScheduleStatus.PROCESSING },
        {
          $set: {
            status: ScheduleStatus.SCHEDULED,
            lastError: { code: failure.code, message: failure.message, occurredAt: new Date() },
          },
        },
      ).setOptions(unscoped);
      if (stillLive.modifiedCount === 0) {
        await releaseJob(claimed, PublishJobStatus.CANCELLED);
        return { outcome: "skipped", reason: "cancelled" };
      }
      await PublishJob.updateOne(
        { _id: claimed._id, lockedBy: WORKER_ID, status: PublishJobStatus.PROCESSING },
        {
          $set: {
            status: PublishJobStatus.QUEUED,
            lockedAt: null,
            lockedBy: null,
            error: { ...failure, occurredAt: new Date() },
          },
        },
      ).setOptions(unscoped);
      await Post.updateOne({ _id: schedule.post }, { $set: { status: PostStatus.SCHEDULED } })
        .setOptions(unscoped)
        .exec();

      log.warn(
        { attempt: claimed.attempts, code: failure.code },
        "Publish attempt failed; will retry",
      );
      return {
        outcome: "retry",
        error: error instanceof Error ? error : new Error(failure.message),
      };
    }

    log.error(
      { attempt: claimed.attempts, code: failure.code, outcomeUnknown: failure.outcomeUnknown },
      "Publish job failed",
    );
    return failJob(claimed, schedule, failure);
  }
};

// ── Recovery ───────────────────────────────────────────────

const RECOVERY_BATCH = 200;
/** Queue entries are checked for jobs due within this window; later ones are checked as they approach. */
const RECOVERY_LOOKAHEAD_MS = 15 * 60_000;

const queueDataFor = (job: PublishJobDocument) => ({
  publishJobId: job._id.toString(),
  scheduleId: job.schedule.toString(),
  postId: job.post.toString(),
  workspaceId: job.workspace.toString(),
});

/**
 * Makes sure BullMQ will run this job. A job id BullMQ already finished (kept for
 * its retention window) would make `add` a silent no-op, so it's removed first.
 */
const ensureQueued = async (job: PublishJobDocument, delayMs: number) => {
  const queue = getPublishQueue();
  if (await queue.has(job.queueJobId)) return false;
  await queue.remove(job.queueJobId);
  await queue.add(queueDataFor(job), {
    jobId: job.queueJobId,
    delayMs,
    attempts: job.maxAttempts,
    backoffMs: env.PUBLISH_BACKOFF_MS,
  });
  return true;
};

/**
 * Puts work back on track after a crash or a lost Redis:
 * - jobs a worker claimed but stopped renewing are retried, unless the platform
 *   call had already started (then they're failed for review);
 * - live jobs due soon whose queue entry has vanished are queued again.
 *
 * Safe with several workers: each abandoned job is claimed atomically first.
 */
export const recoverPublishing = async (): Promise<{
  requeued: number;
  failed: number;
}> => {
  const now = Date.now();
  const staleBefore = new Date(now - env.PUBLISH_LOCK_TIMEOUT_MS);
  let requeued = 0;
  let failed = 0;

  const abandoned = await PublishJob.find({
    status: PublishJobStatus.PROCESSING,
    lockedAt: { $lte: staleBefore },
  })
    .sort({ lockedAt: 1 })
    .limit(RECOVERY_BATCH)
    .setOptions(unscoped);

  for (const stale of abandoned) {
    const recoveryOwner = `recovery:${WORKER_ID}`;
    const job = await PublishJob.findOneAndUpdate(
      { _id: stale._id, status: PublishJobStatus.PROCESSING, lockedAt: stale.lockedAt },
      { $set: { lockedAt: new Date(), lockedBy: recoveryOwner } },
      { returnDocument: "after" },
    ).setOptions(unscoped);
    if (!job) continue;

    const schedule = await Schedule.findById(job.schedule).setOptions(unscoped);
    if (!schedule || !schedule.isLive) {
      await PublishJob.updateOne(
        { _id: job._id, lockedBy: recoveryOwner },
        {
          $set: {
            status: PublishJobStatus.CANCELLED,
            finishedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
          },
        },
      ).setOptions(unscoped);
      continue;
    }

    const unresolved = await PublishAttempt.findOne({
      publishJob: job._id,
      status: PublishAttemptStatus.IN_FLIGHT,
      requestSent: true,
    }).setOptions(unscoped);

    if (unresolved) {
      await finishAttempt(unresolved, {
        status: PublishAttemptStatus.FAILED,
        error: { code: "OUTCOME_UNKNOWN", message: clip(NEEDS_REVIEW_MESSAGE), retryable: false },
      });
      await failJob(job, schedule, {
        code: "OUTCOME_UNKNOWN",
        message: NEEDS_REVIEW_MESSAGE,
        retryable: false,
        outcomeUnknown: true,
      });
      failed += 1;
      logger.error(
        { publishJobId: job._id.toString(), scheduleId: schedule._id.toString() },
        "Recovered a publish job whose outcome is unknown",
      );
      continue;
    }

    await PublishJob.updateOne(
      { _id: job._id, lockedBy: recoveryOwner },
      { $set: { status: PublishJobStatus.QUEUED, lockedAt: null, lockedBy: null } },
    ).setOptions(unscoped);
    await Schedule.updateOne(
      { _id: schedule._id, isLive: true, status: ScheduleStatus.PROCESSING },
      { $set: { status: ScheduleStatus.SCHEDULED } },
    ).setOptions(unscoped);
    await Post.updateOne(
      { _id: schedule.post, status: PostStatus.PUBLISHING },
      { $set: { status: PostStatus.SCHEDULED } },
    ).setOptions(unscoped);
    await ensureQueued(job, 0);
    requeued += 1;
    logger.warn({ publishJobId: job._id.toString() }, "Requeued a publish job left by a crash");
  }

  // Queue entries can disappear if Redis is flushed or replaced; the database is
  // the source of truth. Jobs further out are checked as they come due.
  const dueSoon = await PublishJob.find({
    status: PublishJobStatus.QUEUED,
    runAt: { $lte: new Date(now + RECOVERY_LOOKAHEAD_MS) },
  })
    .sort({ runAt: 1 })
    .limit(RECOVERY_BATCH * 5)
    .setOptions(unscoped);

  for (const job of dueSoon) {
    const schedule = await Schedule.findById(job.schedule).select("isLive").setOptions(unscoped);
    if (!schedule?.isLive) continue;
    if (await ensureQueued(job, job.runAt.getTime() - Date.now())) {
      requeued += 1;
      logger.warn(
        { publishJobId: job._id.toString(), runAt: job.runAt },
        "Queue entry was missing; scheduled it again",
      );
    }
  }

  return { requeued, failed };
};

export const deleteWorkspacePublishing = async (workspaceId: Types.ObjectId): Promise<void> => {
  const jobs = await PublishJob.find({ workspace: workspaceId }).select("queueJobId");
  await Promise.all(
    jobs.map((job) =>
      getPublishQueue()
        .remove(job.queueJobId)
        .catch(() => false),
    ),
  );
  await Promise.all([
    Schedule.deleteMany({ workspace: workspaceId }),
    PublishJob.deleteMany({ workspace: workspaceId }),
    PublishAttempt.deleteMany({ workspace: workspaceId }),
  ]);
};
