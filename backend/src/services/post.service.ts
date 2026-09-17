import type { Types } from "mongoose";
import type { HoldReasonValue } from "../constants/autopilot.constant";
import type { BrandToneValue } from "../constants/brandProfile.constant";
import {
  type CreatePlatformValue,
  LOCKED_POST_STATUSES,
  POST_LIMITS as LIMITS,
  PostStatus,
  type PostStatusValue,
  type RefineActionValue,
  type VersionSourceValue,
} from "../constants/post.constant";
import { WorkspaceRole } from "../constants/workspace.constant";
import { TONE_LABELS } from "../integrations/ai/prompts/brandContext";
import { containsEmojis, preparePostContent, removeEmojis } from "../integrations/ai/postContent";
import { Post, type PostDocument } from "../models/post.model";
import { PostVersion, type PostVersionDocument } from "../models/postVersion.model";
import type { VideoFormatValue } from "../constants/media.constant";
import type { StoredFileDocument } from "../models/file.model";
import { AppError } from "../utils/appError.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import { formatInZone } from "../utils/timezone.util";
import { hasMinimumRole } from "../utils/workspaceRoles.util";
import {
  type CalendarQuery,
  type CreatePostInput,
  type GeneratePostsInput,
  type ListPostsQuery,
  type PostContent,
  postContentSchema,
  type RefinePostInput,
  type RegeneratePostInput,
  type SchedulePostInput,
  type UpdatePostContentInput,
  type UpdatePostDetailsInput,
  type UpdatePostStatusInput,
} from "../validators/post.validator";

import * as AIService from "./ai.service";
import * as AutopilotAudit from "./autopilotAudit.service";
import {
  assertAttachments,
  attachmentProblem,
  loadAttachments,
  type PublicAttachment,
  resolveVideoFormat,
  toPublicAttachment,
} from "./postMedia.service";
import * as ContentStrategyService from "./contentStrategy.service";
import * as PerformanceInsightsService from "./performanceInsights.service";
import * as PublishingService from "./publishing.service";

/** A post with no content yet; the topic stands in until something is written. */
const emptyContent = (): PostContent => ({
  title: null,
  hook: null,
  body: null,
  text: "",
  cta: null,
  hashtags: [],
});

const POPULATE_USER = { path: "createdBy", select: "name" };
const POPULATE_POST_USERS = [POPULATE_USER, { path: "updatedBy", select: "name" }];
/** Two saves landing together can race for the same version number. */
const MAX_VERSION_ATTEMPTS = 3;

const REFINE_LABELS: Record<RefineActionValue, string> = {
  SHORTEN: "Shortened",
  EXPAND: "Expanded",
  CHANGE_TONE: "Tone changed",
  IMPROVE_HOOK: "Hook improved",
  IMPROVE_CTA: "Call to action improved",
  ADD_EMOJIS: "Emojis added",
  REMOVE_EMOJIS: "Emojis removed",
  GENERATE_HASHTAGS: "Hashtags regenerated",
};

// ── Public shapes ──────────────────────────────────────────

interface UserReference {
  id: string;
  name: string;
}

export interface PublicPostVersion {
  id: string;
  version: number;
  content: PostContent;
  /** Attached media library files, in posting order. Deleted files are left out. */
  media: PublicAttachment[];
  videoFormat: VideoFormatValue | null;
  /**
   * Why this version can't be published yet, from its media alone (e.g. a
   * TikTok post without a video), or null when the media is ready.
   */
  mediaIssue: string | null;
  source: VersionSourceValue;
  label: string;
  instructions: string | null;
  tone: BrandToneValue | null;
  generation: {
    provider: string;
    model: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number | null;
  } | null;
  createdBy: UserReference | null;
  createdAt: Date;
}

export interface PublicPost {
  id: string;
  platform: CreatePlatformValue;
  brief: {
    topic: string;
    goal: string | null;
    tone: BrandToneValue | null;
    instructions: string | null;
  };
  status: PostStatusValue;
  pillar: string | null;
  /** Absolute instant in UTC; the workspace time zone is a display concern. */
  scheduledAt: Date | null;
  publishedAt: Date | null;
  versionCount: number;
  currentVersion: PublicPostVersion | null;
  /** Set when Autopilot wrote the post. */
  autopilot: {
    slotId: string;
    heldReason: HoldReasonValue | null;
    heldMessage: string | null;
  } | null;
  createdBy: UserReference | null;
  updatedBy: UserReference | null;
  createdAt: Date;
  updatedAt: Date;
}

const toUserReference = (value: unknown): UserReference | null => {
  if (typeof value !== "object" || value === null || !("name" in value)) return null;
  const user = value as { _id: Types.ObjectId; name: string };
  return { id: user._id.toString(), name: user.name };
};

/** Library files keyed by id, loaded once for every version being returned. */
type FileLookup = Map<string, StoredFileDocument>;

const loadFileLookup = async (
  workspaceId: Types.ObjectId,
  versions: (PostVersionDocument | null)[],
): Promise<FileLookup> => {
  const ids = versions.flatMap((version) => version?.media ?? []);
  const files = await loadAttachments(workspaceId, [...new Set(ids.map(String))]);
  return new Map(files.map((file) => [file._id.toString(), file]));
};

const filesOf = (version: PostVersionDocument, files: FileLookup) =>
  (version.media ?? []).flatMap((id) => {
    const file = files.get(id.toString());
    return file ? [file] : [];
  });

export const toPublicPostVersion = (
  version: PostVersionDocument,
  files: FileLookup,
  platform: CreatePlatformValue,
): PublicPostVersion => {
  const attached = filesOf(version, files);
  return {
    id: version._id.toString(),
    version: version.version,
    content: version.content,
    media: attached.map(toPublicAttachment),
    videoFormat: version.videoFormat ?? null,
    mediaIssue:
      // A file removed from the library since it was attached can't be published.
      attached.length < (version.media?.length ?? 0)
        ? "An attached file was deleted from the media library. Remove it or attach another."
        : attachmentProblem(platform, attached, { requireMedia: true }),
    source: version.source,
    label: version.label,
    instructions: version.instructions ?? null,
    tone: version.tone ?? null,
    generation: version.generation
      ? {
          provider: version.generation.provider,
          model: version.generation.model,
          promptVersion: version.generation.promptVersion,
          inputTokens: version.generation.inputTokens,
          outputTokens: version.generation.outputTokens,
          estimatedCostUsd: version.generation.estimatedCostUsd ?? null,
        }
      : null,
    createdBy: toUserReference(version.createdBy),
    createdAt: version.createdAt,
  };
};

const toPublicPost = (
  post: PostDocument,
  version: PostVersionDocument | null,
  files: FileLookup,
): PublicPost => ({
  id: post._id.toString(),
  platform: post.platform,
  brief: {
    topic: post.brief.topic,
    goal: post.brief.goal ?? null,
    tone: post.brief.tone ?? null,
    instructions: post.brief.instructions ?? null,
  },
  status: post.status,
  pillar: post.pillar ?? null,
  scheduledAt: post.scheduledAt ?? null,
  publishedAt: post.publishedAt ?? null,
  versionCount: post.versionCount,
  currentVersion: version ? toPublicPostVersion(version, files, post.platform) : null,
  autopilot: post.autopilot
    ? {
        slotId: post.autopilot.slot.toString(),
        heldReason: post.autopilot.heldReason ?? null,
        heldMessage: post.autopilot.heldMessage ?? null,
      }
    : null,
  createdBy: toUserReference(post.createdBy),
  updatedBy: toUserReference(post.updatedBy),
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
});

// ── Loading ────────────────────────────────────────────────

const findPost = async ({ workspace }: WorkspaceContext, postId: string) => {
  const post = await Post.findOne({ _id: postId, workspace: workspace._id }).populate(
    POPULATE_POST_USERS,
  );
  if (!post) throw AppError.notFound("Post not found");
  return post;
};

const loadCurrentVersion = async (post: PostDocument) =>
  post.currentVersion
    ? await PostVersion.findOne({
        _id: post.currentVersion,
        post: post._id,
        workspace: post.workspace,
      }).populate(POPULATE_USER)
    : null;

const withCurrentVersion = async (post: PostDocument) => {
  const version = await loadCurrentVersion(post);
  return toPublicPost(post, version, await loadFileLookup(post.workspace, [version]));
};

// ── Versions ───────────────────────────────────────────────

interface NewVersion {
  content: PostContent;
  /**
   * Media library file ids. Left out, the current version's media carries over,
   * so AI rewrites and refinements keep whatever was attached.
   */
  media?: readonly string[];
  videoFormat?: VideoFormatValue | null;
  source: VersionSourceValue;
  label: string;
  instructions?: string | null;
  tone?: BrandToneValue | null;
  generation?: PublicPostVersion["generation"];
}

const isDuplicateKey = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

/** Appends a version and points the post at it. Older versions beyond the limit are dropped. */
const appendVersion = async (
  context: WorkspaceContext,
  post: PostDocument,
  {
    content,
    media,
    videoFormat,
    source,
    label,
    instructions = null,
    tone = null,
    generation = null,
  }: NewVersion,
) => {
  const validated = postContentSchema.parse(preparePostContent(post.platform, content));

  const current = media === undefined ? await loadCurrentVersion(post) : null;
  const mediaIds = media ?? (current?.media ?? []).map(String);
  const attached = await loadAttachments(post.workspace, mediaIds);
  if (media !== undefined) {
    if (attached.length !== media.length) {
      throw AppError.badRequest("One of those files isn't in this workspace's media library");
    }
    // A draft may be saved before its required video is chosen; scheduling checks that.
    assertAttachments(post.platform, attached, { requireMedia: false });
  }
  const resolvedFormat = resolveVideoFormat(
    post.platform,
    attached,
    videoFormat === undefined ? (current?.videoFormat ?? null) : videoFormat,
  );

  for (let attempt = 1; ; attempt += 1) {
    const latest = await PostVersion.find({ workspace: post.workspace, post: post._id })
      .sort({ version: -1 })
      .limit(1);
    const nextNumber = Math.max(latest[0]?.version ?? 0, post.versionCount) + 1;
    try {
      const version = await PostVersion.create({
        workspace: context.workspace._id,
        post: post._id,
        version: nextNumber,
        content: validated,
        media: attached.map((file) => file._id),
        videoFormat: resolvedFormat,
        source,
        label,
        instructions,
        tone,
        generation,
        createdBy: context.user._id,
      });
      post.currentVersion = version._id;
      post.versionCount = nextNumber;
      post.updatedBy = context.user._id;
      await post.save();
      await version.populate(POPULATE_USER);
      await pruneVersions(post);
      await post.populate(POPULATE_POST_USERS);
      return {
        post: toPublicPost(post, version, await loadFileLookup(post.workspace, [version])),
        version,
      };
    } catch (error) {
      if (!isDuplicateKey(error) || attempt >= MAX_VERSION_ATTEMPTS) throw error;
    }
  }
};

const pruneVersions = async (post: PostDocument) => {
  if (post.versionCount <= LIMITS.versions) return;
  await PostVersion.deleteMany({
    workspace: post.workspace,
    post: post._id,
    version: { $lte: post.versionCount - LIMITS.versions },
  });
};

// ── Generation ─────────────────────────────────────────────

const toGeneration = (result: {
  provider: string;
  model: string;
  promptVersion: string;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number | null };
}) => ({
  provider: result.provider,
  model: result.model,
  promptVersion: result.promptVersion,
  inputTokens: result.usage.inputTokens,
  outputTokens: result.usage.outputTokens,
  estimatedCostUsd: result.usage.estimatedCostUsd,
});

export interface GeneratedPosts {
  posts: PublicPost[];
  warnings: string[];
}

/** One AI request writes every platform at once, so each gets a different take on the topic. */
export const generatePosts = async (
  context: WorkspaceContext,
  input: GeneratePostsInput,
): Promise<GeneratedPosts> => {
  const [strategy, insights] = await Promise.all([
    ContentStrategyService.getActiveStrategyContext(context),
    PerformanceInsightsService.getApprovedInsightsContext(context),
  ]);
  const result = await AIService.createPosts(context, { ...input, strategy, insights });
  const generation = toGeneration(result);

  const posts: PublicPost[] = [];
  for (const draft of result.data.drafts) {
    const post = await Post.create({
      workspace: context.workspace._id,
      platform: draft.platform,
      brief: {
        topic: input.topic,
        goal: input.goal ?? null,
        tone: input.tone ?? null,
        instructions: input.instructions ?? null,
      },
      status: PostStatus.DRAFT,
      createdBy: context.user._id,
    });
    const { post: created } = await appendVersion(context, post, {
      content: draft.content,
      source: "GENERATE",
      label: "Generated",
      instructions: input.instructions ?? null,
      tone: input.tone ?? null,
      generation,
    });
    posts.push(created);
  }
  return { posts, warnings: result.warnings };
};

export interface NewAutopilotPost {
  platform: CreatePlatformValue;
  topic: string;
  instructions: string | null;
  pillar: string | null;
  content: PostContent;
  scheduledAt: Date;
  slot: Types.ObjectId;
  generation: ReturnType<typeof toGeneration>;
}

/** Stores a post Autopilot wrote. It starts READY, held for approval, until Autopilot routes it. */
export const createAutopilotPost = async (context: WorkspaceContext, input: NewAutopilotPost) => {
  const post = await Post.create({
    workspace: context.workspace._id,
    platform: input.platform,
    brief: { topic: input.topic, goal: null, tone: null, instructions: input.instructions },
    status: PostStatus.READY,
    pillar: input.pillar,
    scheduledAt: input.scheduledAt,
    autopilot: {
      slot: input.slot,
      heldReason: "APPROVAL_REQUIRED",
      heldMessage: null,
      approvedBy: null,
    },
    createdBy: context.user._id,
  });
  await appendVersion(context, post, {
    content: input.content,
    source: "GENERATE",
    label: "Written by Autopilot",
    instructions: input.instructions,
    generation: input.generation,
  });
  return post;
};

export { toGeneration };

/** Writes a new take on the same brief for this post's platform. Previous versions stay. */
export const regeneratePost = async (
  context: WorkspaceContext,
  postId: string,
  input: RegeneratePostInput,
) => {
  const post = await findPost(context, postId);
  assertEditable(post);
  const tone = input.tone ?? post.brief.tone ?? undefined;
  const instructions = input.instructions ?? post.brief.instructions ?? undefined;

  const [strategy, insights] = await Promise.all([
    ContentStrategyService.getActiveStrategyContext(context),
    PerformanceInsightsService.getApprovedInsightsContext(context),
  ]);
  const result = await AIService.createPosts(context, {
    topic: post.brief.topic,
    goal: post.brief.goal ?? undefined,
    platforms: [post.platform],
    tone,
    instructions,
    strategy,
    insights,
  });
  const draft = result.data.drafts[0];
  if (!draft) {
    throw AppError.badRequest("The AI didn't return a new version. Please try again.");
  }

  post.brief.tone = tone ?? null;
  post.brief.instructions = instructions ?? null;
  const { post: updated } = await appendVersion(context, post, {
    content: draft.content,
    source: "REGENERATE",
    label: "Regenerated",
    instructions: instructions ?? null,
    tone: tone ?? null,
    generation: toGeneration(result),
  });
  return { post: updated, warnings: result.warnings };
};

/** Shorten, expand, change tone, improve the hook or CTA, add emoji, redo hashtags. */
export const refinePost = async (
  context: WorkspaceContext,
  postId: string,
  { action, tone, instructions }: RefinePostInput,
) => {
  const post = await findPost(context, postId);
  assertEditable(post);
  const current = await loadCurrentVersion(post);
  if (!current) throw AppError.notFound("This post has no content yet");

  const label =
    action === "CHANGE_TONE" && tone
      ? `Tone changed to ${TONE_LABELS[tone]}`
      : REFINE_LABELS[action];

  // Removing emoji is deterministic, so it doesn't spend an AI request.
  if (action === "REMOVE_EMOJIS") {
    if (!containsEmojis(current.content)) {
      throw AppError.badRequest("This post doesn't have any emoji to remove");
    }
    const { post: updated } = await appendVersion(context, post, {
      content: removeEmojis(current.content),
      source: action,
      label,
    });
    return { post: updated, warnings: [] };
  }

  const [strategy, insights] = await Promise.all([
    ContentStrategyService.getActiveStrategyContext(context),
    PerformanceInsightsService.getApprovedInsightsContext(context),
  ]);
  const result = await AIService.refinePostContent(context, {
    platform: post.platform,
    action,
    tone,
    instructions,
    brief: {
      topic: post.brief.topic,
      goal: post.brief.goal ?? undefined,
      tone: post.brief.tone ?? undefined,
      instructions: post.brief.instructions ?? undefined,
    },
    content: current.content,
    strategy,
    insights,
  });

  const { post: updated } = await appendVersion(context, post, {
    content: result.data,
    source: action,
    label,
    instructions: instructions ?? null,
    tone: tone ?? null,
    generation: toGeneration(result),
  });
  return { post: updated, warnings: result.warnings };
};

// ── Manual changes ─────────────────────────────────────────

/** Published posts (and ones mid-publish) are a record of what went out, so they stay put. */
const assertEditable = (post: PostDocument) => {
  if ((LOCKED_POST_STATUSES as readonly string[]).includes(post.status)) {
    throw AppError.conflict(
      post.status === PostStatus.PUBLISHED
        ? "This post has been published, so it can't be changed. Duplicate it to work on a new version."
        : "This post is being published right now, so it can't be changed.",
    );
  }
};

export const updatePostContent = async (
  context: WorkspaceContext,
  postId: string,
  { baseVersion, content, media, videoFormat }: UpdatePostContentInput,
) => {
  const post = await findPost(context, postId);
  assertEditable(post);
  if (baseVersion !== post.versionCount) {
    throw AppError.conflict(
      "Someone else changed this post while you were editing. Reload to see their changes, then save again.",
    );
  }
  const { post: updated } = await appendVersion(context, post, {
    content,
    media,
    videoFormat,
    source: "EDIT",
    label: "Edited",
  });
  return updated;
};

/** Brings back an earlier version's content as a new version, so nothing is lost. */
export const restoreVersion = async (
  context: WorkspaceContext,
  postId: string,
  versionId: string,
) => {
  const post = await findPost(context, postId);
  assertEditable(post);
  const version = await PostVersion.findOne({
    _id: versionId,
    post: post._id,
    workspace: post.workspace,
  });
  if (!version) throw AppError.notFound("Version not found");
  if (post.currentVersion?.equals(version._id)) {
    throw AppError.conflict("That version is already the current one");
  }

  const { post: updated } = await appendVersion(context, post, {
    content: version.content,
    media: (version.media ?? []).map(String),
    videoFormat: version.videoFormat ?? null,
    source: "RESTORE",
    label: `Restored version ${version.version}`,
  });
  return updated;
};

export const updatePostStatus = async (
  context: WorkspaceContext,
  postId: string,
  { status }: UpdatePostStatusInput,
) => {
  const post = await findPost(context, postId);
  assertEditable(post);
  // Any manual status takes the post out of the queue, so its publish is off too.
  if (post.status === PostStatus.SCHEDULED) {
    await PublishingService.cancelLiveSchedule(post, context.user._id);
    await recordAutopilotUnscheduled(context, post);
  }
  post.status = status;
  post.updatedBy = context.user._id;
  await post.save();
  await post.populate(POPULATE_POST_USERS);
  return withCurrentVersion(post);
};

/** Creating a post straight from the calendar: a slot with a topic, content optional. */
export const createPost = async (context: WorkspaceContext, input: CreatePostInput) => {
  const post = await Post.create({
    workspace: context.workspace._id,
    platform: input.platform,
    brief: {
      topic: input.topic,
      goal: input.goal ?? null,
      tone: input.tone ?? null,
      instructions: input.instructions ?? null,
    },
    status: input.status,
    pillar: input.pillar ?? null,
    scheduledAt: input.scheduledAt ?? null,
    createdBy: context.user._id,
  });

  const { post: created } = await appendVersion(context, post, {
    // Without content the topic stands in, so there's always something to edit.
    content: input.content ?? { ...emptyContent(), text: input.topic },
    source: "CREATE",
    label: "Created",
  });
  return created;
};

/** A copy to work on: same platform, brief and content, unscheduled and back to draft. */
export const duplicatePost = async (context: WorkspaceContext, postId: string) => {
  const source = await findPost(context, postId);
  const current = await loadCurrentVersion(source);
  const copy = await Post.create({
    workspace: context.workspace._id,
    platform: source.platform,
    brief: {
      topic: source.brief.topic,
      goal: source.brief.goal ?? null,
      tone: source.brief.tone ?? null,
      instructions: source.brief.instructions ?? null,
    },
    status: PostStatus.DRAFT,
    pillar: source.pillar ?? null,
    scheduledAt: null,
    createdBy: context.user._id,
  });

  const { post: created } = await appendVersion(context, copy, {
    content: current?.content ?? { ...emptyContent(), text: source.brief.topic },
    media: (current?.media ?? []).map(String),
    videoFormat: current?.videoFormat ?? null,
    source: "DUPLICATE",
    label: `Duplicated from version ${current?.version ?? 1}`,
  });
  return created;
};

/** People changing an Autopilot post's schedule is part of its audit trail. */
const recordAutopilotUnscheduled = async (context: WorkspaceContext, post: PostDocument) => {
  if (!post.autopilot) return;
  await AutopilotAudit.recordEvent({
    workspace: post.workspace,
    type: "UNSCHEDULED",
    message: "Taken off the schedule by a person.",
    actor: context.user._id,
    slot: post.autopilot.slot,
    post: post._id,
    platform: post.platform,
  });
};

/** Statuses that mean "this is meant to go out", so setting a time queues it. */
const QUEUEABLE_STATUSES: PostStatusValue[] = [
  PostStatus.READY,
  PostStatus.APPROVED,
  PostStatus.SCHEDULED,
  PostStatus.FAILED,
];
/** A minute of slack for clock differences between the browser and the server. */
const PAST_TOLERANCE_MS = 60_000;

/**
 * Schedules, reschedules (same call, new time) or unschedules (null) a post.
 * `scheduledAt` is an absolute instant; the workspace time zone is display only.
 *
 * `publish` separates the two things a date can mean. Pressing Schedule means
 * "send this then", so an idea or draft is moved on to READY and queued rather
 * than quietly sitting there with nothing behind it. Dropping a card on another
 * day just moves it, and an idea stays an idea.
 */
export const schedulePost = async (
  context: WorkspaceContext,
  postId: string,
  { scheduledAt, socialAccountId, publish }: SchedulePostInput,
) => {
  const post = await findPost(context, postId);
  assertEditable(post);

  if (scheduledAt === null) {
    if (post.status === PostStatus.SCHEDULED) await recordAutopilotUnscheduled(context, post);
    await PublishingService.cancelLiveSchedule(post, context.user._id);
    post.scheduledAt = null;
    if (post.status === PostStatus.SCHEDULED) post.status = PostStatus.APPROVED;
  } else {
    const queues = publish || QUEUEABLE_STATUSES.includes(post.status);
    if (queues && scheduledAt.getTime() < Date.now() - PAST_TOLERANCE_MS) {
      throw AppError.badRequest("Pick a time in the future to schedule this post");
    }
    // Queue the publish first: if the account or content isn't ready, the post
    // keeps its old slot instead of looking scheduled with nothing behind it.
    if (queues) {
      await PublishingService.schedulePublish(context, { post, scheduledAt, socialAccountId });
      // Scheduling a held Autopilot post is the person approving it.
      if (post.autopilot?.heldReason) {
        await AutopilotAudit.recordEvent({
          workspace: post.workspace,
          type: "APPROVED",
          message: `Approved and scheduled for ${formatInZone(scheduledAt, context.workspace.timezone ?? "UTC")}.`,
          actor: context.user._id,
          slot: post.autopilot.slot,
          post: post._id,
          platform: post.platform,
          details: {
            heldReason: post.autopilot.heldReason,
            scheduledAt: scheduledAt.toISOString(),
          },
        });
        post.autopilot.heldReason = null;
        post.autopilot.heldMessage = null;
        post.autopilot.approvedBy = context.user._id;
      }
      post.status = PostStatus.SCHEDULED;
    } else {
      // Ideas and drafts just hold a slot on the calendar; nothing is queued.
      await PublishingService.cancelLiveSchedule(post, context.user._id);
    }
    post.scheduledAt = scheduledAt;
  }

  post.updatedBy = context.user._id;
  await post.save();
  await post.populate(POPULATE_POST_USERS);
  return withCurrentVersion(post);
};

/** The brief around the content: topic, pillar, goal, tone and instructions. */
export const updatePostDetails = async (
  context: WorkspaceContext,
  postId: string,
  input: UpdatePostDetailsInput,
) => {
  const post = await findPost(context, postId);
  assertEditable(post);
  if (input.topic !== undefined) post.brief.topic = input.topic;
  if (input.pillar !== undefined) post.pillar = input.pillar;
  if (input.goal !== undefined) post.brief.goal = input.goal;
  if (input.tone !== undefined) post.brief.tone = input.tone;
  if (input.instructions !== undefined) post.brief.instructions = input.instructions;
  post.updatedBy = context.user._id;
  await post.save();
  await post.populate(POPULATE_POST_USERS);
  return withCurrentVersion(post);
};

/** The author can delete their own posts; admins and owners can delete any. */
export const deletePost = async (context: WorkspaceContext, postId: string): Promise<void> => {
  const post = await findPost(context, postId);
  const isAuthor =
    post.createdBy instanceof Object && "_id" in post.createdBy
      ? (post.createdBy as { _id: Types.ObjectId })._id.equals(context.user._id)
      : false;
  if (!isAuthor && !hasMinimumRole(context.member.role, WorkspaceRole.ADMIN)) {
    throw AppError.forbidden("Only admins and owners can delete posts written by someone else");
  }
  await PublishingService.cancelLiveSchedule(post, context.user._id);
  if (post.autopilot) {
    await AutopilotAudit.recordEvent({
      workspace: post.workspace,
      type: "REJECTED",
      message: `Deleted by a person ("${post.brief.topic.slice(0, 120)}").`,
      actor: context.user._id,
      slot: post.autopilot.slot,
      post: post._id,
      platform: post.platform,
      details: { deleted: true, status: post.status },
    });
  }
  await PostVersion.deleteMany({ workspace: post.workspace, post: post._id });
  await Post.deleteOne({ _id: post._id, workspace: context.workspace._id });
};

// ── Reading ────────────────────────────────────────────────

export const listPosts = async (
  { workspace }: WorkspaceContext,
  { platform, status, pillar, q, hasMedia, scheduled, page, limit }: ListPostsQuery,
) => {
  const search = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

  // Text and media live on the current version, so those filters narrow the
  // posts by their current version first.
  let versionMatch: Types.ObjectId[] | null = null;
  if (search || hasMedia) {
    const versions = await PostVersion.find({
      workspace: workspace._id,
      ...(search ? { "content.text": search } : {}),
      ...(hasMedia === "true" ? { "media.0": { $exists: true } } : {}),
      ...(hasMedia === "false" ? { "media.0": { $exists: false } } : {}),
    })
      .select("_id")
      .lean();
    versionMatch = versions.map((version) => version._id);
  }

  const filter = {
    workspace: workspace._id,
    ...(platform?.length ? { platform: { $in: platform } } : {}),
    ...(status?.length ? { status: { $in: status } } : {}),
    ...(pillar?.length ? { pillar: { $in: pillar } } : {}),
    ...(scheduled === "true" ? { scheduledAt: { $ne: null } } : {}),
    ...(scheduled === "false" ? { scheduledAt: null } : {}),
    ...(search && versionMatch
      ? { $or: [{ "brief.topic": search }, { currentVersion: { $in: versionMatch } }] }
      : {}),
    ...(hasMedia && versionMatch ? { currentVersion: { $in: versionMatch } } : {}),
  };
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE_POST_USERS),
    Post.countDocuments(filter),
  ]);

  const versionIds = posts.map((post) => post.currentVersion).filter((id) => id !== null);
  const versions = await PostVersion.find({
    workspace: workspace._id,
    _id: { $in: versionIds },
  }).populate(POPULATE_USER);
  const byId = new Map(versions.map((version) => [version._id.toString(), version]));

  const files = await loadFileLookup(workspace._id, versions);
  return {
    items: posts.map((post) =>
      toPublicPost(post, byId.get(post.currentVersion?.toString() ?? "") ?? null, files),
    ),
    total,
  };
};

export const getPost = async (context: WorkspaceContext, postId: string) => {
  const post = await findPost(context, postId);
  const versions = await PostVersion.find({ workspace: post.workspace, post: post._id })
    .sort({ version: -1 })
    .populate(POPULATE_USER);
  const current = versions.find((version) => post.currentVersion?.equals(version._id)) ?? null;
  const files = await loadFileLookup(post.workspace, versions);
  return {
    post: toPublicPost(post, current, files),
    versions: versions.map((version) => toPublicPostVersion(version, files, post.platform)),
  };
};

export interface CalendarItem {
  id: string;
  platform: CreatePlatformValue;
  status: PostStatusValue;
  pillar: string | null;
  topic: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  /** First line or so of the current version, for the calendar card. */
  preview: string;
  versionCount: number;
  updatedAt: Date;
}

const toCalendarItem = (post: PostDocument, preview: string): CalendarItem => ({
  id: post._id.toString(),
  platform: post.platform,
  status: post.status,
  pillar: post.pillar ?? null,
  topic: post.brief.topic,
  scheduledAt: post.scheduledAt ?? null,
  publishedAt: post.publishedAt ?? null,
  preview,
  versionCount: post.versionCount,
  updatedAt: post.updatedAt,
});

/**
 * Posts scheduled inside a range, plus the unscheduled backlog. The range is
 * given as absolute instants, so the caller's time zone decides what "a day" is.
 */
export const getCalendar = async (
  { workspace }: WorkspaceContext,
  { from, to, platform, status, pillar, includeUnscheduled }: CalendarQuery,
) => {
  const filter = {
    workspace: workspace._id,
    ...(platform ? { platform: { $in: platform } } : {}),
    ...(status ? { status: { $in: status } } : {}),
    ...(pillar ? { pillar: { $in: pillar } } : {}),
  };

  const [scheduled, unscheduled] = await Promise.all([
    Post.find({ ...filter, scheduledAt: { $gte: from, $lt: to } })
      .sort({ scheduledAt: 1 })
      .limit(LIMITS.calendarItems),
    includeUnscheduled
      ? Post.find({ ...filter, scheduledAt: null })
          .sort({ updatedAt: -1 })
          .limit(LIMITS.unscheduled)
      : [],
  ]);

  const posts = [...scheduled, ...unscheduled];
  const versions = await PostVersion.find({
    workspace: workspace._id,
    _id: { $in: posts.map((post) => post.currentVersion).filter((id) => id !== null) },
  }).select("content.text");
  const previews = new Map(
    versions.map((version) => [
      version._id.toString(),
      version.content.text.slice(0, LIMITS.preview),
    ]),
  );
  const previewFor = (post: PostDocument) =>
    previews.get(post.currentVersion?.toString() ?? "") ?? "";

  return {
    range: { from, to },
    items: scheduled.map((post) => toCalendarItem(post, previewFor(post))),
    unscheduled: unscheduled.map((post) => toCalendarItem(post, previewFor(post))),
  };
};

export const deleteWorkspacePosts = async (workspaceId: Types.ObjectId): Promise<void> => {
  await Promise.all([
    Post.deleteMany({ workspace: workspaceId }),
    PostVersion.deleteMany({ workspace: workspaceId }),
  ]);
};
