/**
 * Autopilot's audit trail and the hooks publishing calls into. Depends only on
 * models, so the publishing service can use it without an import cycle.
 */
import type { Types } from "mongoose";
import { logger } from "../config/logger";
import {
  AUTOPILOT_RULES as RULES,
  type AutopilotEventTypeValue,
  type HOLD_REASONS,
} from "../constants/autopilot.constant";
import { type CreatePlatformValue, PostStatus } from "../constants/post.constant";
import { AutopilotEvent } from "../models/autopilotEvent.model";
import { AutopilotSettings } from "../models/autopilotSettings.model";
import { Post, type PostDocument } from "../models/post.model";
import * as NotificationEvents from "./notificationEvents.service";

const unscoped = { skipWorkspaceScope: true } as const;

export interface EventInput {
  workspace: Types.ObjectId;
  type: AutopilotEventTypeValue;
  message: string;
  actor?: Types.ObjectId | null;
  slot?: Types.ObjectId | null;
  post?: Types.ObjectId | null;
  platform?: CreatePlatformValue | null;
  details?: Record<string, unknown> | null;
}

/**
 * Writes one audit row. An audit failure is logged loudly but never undoes the
 * action it describes: the action already happened.
 */
export const recordEvent = async (input: EventInput): Promise<void> => {
  try {
    await AutopilotEvent.create({
      workspace: input.workspace,
      type: input.type,
      message: input.message.slice(0, 1000),
      actor: input.actor ?? null,
      slot: input.slot ?? null,
      post: input.post ?? null,
      platform: input.platform ?? null,
      details: input.details ?? null,
    });
  } catch (error) {
    logger.error(
      { err: error, workspaceId: input.workspace.toString(), type: input.type },
      "Failed to write Autopilot audit event",
    );
  }
};

/**
 * Pauses without a person: repeated failures mean something is wrong that more
 * attempts won't fix. The conditional update makes this a no-op if already paused.
 */
export const autoPause = async (workspace: Types.ObjectId, reason: string) => {
  const paused = await AutopilotSettings.findOneAndUpdate(
    { workspace, status: "ACTIVE" },
    { $set: { status: "PAUSED", pausedAt: new Date(), pausedBy: null, pauseReason: reason } },
    { returnDocument: "after" },
  );
  if (!paused) return false;
  logger.warn({ workspaceId: workspace.toString(), reason }, "Autopilot paused itself");
  await recordEvent({
    workspace,
    type: "AUTO_PAUSED",
    message: `Autopilot paused itself: ${reason}`,
  });
  await NotificationEvents.autopilotPaused(workspace, reason, paused.pausedAt ?? new Date());
  return true;
};

/** Puts an Autopilot post back in the review queue with a reason. */
export const holdPost = async (
  post: PostDocument,
  reason: keyof typeof HOLD_REASONS,
  message: string | null = null,
) => {
  if (!post.autopilot) return;
  post.status = PostStatus.READY;
  post.autopilot.heldReason = reason;
  post.autopilot.heldMessage = message;
  await post.save();
};

/**
 * Checked by the publish worker just before it calls a platform. While
 * Autopilot is paused, its posts don't go out, even if their job was already
 * queued: pausing takes effect instantly rather than after cleanup finishes.
 */
export const publishBlockedByPause = async (post: PostDocument): Promise<boolean> => {
  if (!post.autopilot || post.autopilot.approvedBy) return false;
  const settings = await AutopilotSettings.findOne({ workspace: post.workspace }).select("status");
  return settings?.status !== "ACTIVE";
};

export const recordPublishBlocked = async (post: PostDocument) => {
  await holdPost(post, "PAUSED");
  await recordEvent({
    workspace: post.workspace,
    type: "PUBLISH_BLOCKED",
    message: "Stopped a scheduled publish because Autopilot is paused.",
    slot: post.autopilot?.slot ?? null,
    post: post._id,
    platform: post.platform,
  });
};

const autopilotPost = (postId: Types.ObjectId) =>
  Post.findById(postId).select("workspace platform autopilot").setOptions(unscoped);

export const onPublished = async (postId: Types.ObjectId, url: string | null) => {
  const post = await autopilotPost(postId);
  if (!post?.autopilot) return;
  await AutopilotSettings.updateOne(
    { workspace: post.workspace },
    { $set: { consecutivePublishFailures: 0 } },
  );
  await recordEvent({
    workspace: post.workspace,
    type: "PUBLISHED",
    message: "Published.",
    slot: post.autopilot.slot,
    post: post._id,
    platform: post.platform,
    details: url ? { url } : null,
  });
};

/** Counts consecutive failed publishes and pauses Autopilot when they pile up. */
export const onPublishFailed = async (
  postId: Types.ObjectId,
  failure: { code: string; message: string },
  needsReview: boolean,
) => {
  const post = await autopilotPost(postId);
  if (!post?.autopilot) return;
  const settings = await AutopilotSettings.findOneAndUpdate(
    { workspace: post.workspace },
    { $inc: { consecutivePublishFailures: 1 } },
    { returnDocument: "after" },
  );
  await recordEvent({
    workspace: post.workspace,
    type: "PUBLISH_FAILED",
    message: `Publishing failed: ${failure.message}`,
    slot: post.autopilot.slot,
    post: post._id,
    platform: post.platform,
    details: { code: failure.code, needsReview },
  });
  if (settings && settings.consecutivePublishFailures >= RULES.autoPauseAfterPublishFailures) {
    await autoPause(
      post.workspace,
      `${settings.consecutivePublishFailures} publishes in a row failed. Check your connected accounts, then resume.`,
    );
  }
};
