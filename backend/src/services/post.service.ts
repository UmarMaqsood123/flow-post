import type { Types } from "mongoose";
import type { BrandToneValue } from "../constants/brandProfile.constant";
import {
  type CreatePlatformValue,
  POST_LIMITS as LIMITS,
  PostStatus,
  type RefineActionValue,
  type VersionSourceValue,
} from "../constants/post.constant";
import { WorkspaceRole } from "../constants/workspace.constant";
import { TONE_LABELS } from "../integrations/ai/prompts/brandContext";
import { containsEmojis, preparePostContent, removeEmojis } from "../integrations/ai/postContent";
import { Post, type PostDocument } from "../models/post.model";
import { PostVersion, type PostVersionDocument } from "../models/postVersion.model";
import { AppError } from "../utils/appError.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import { hasMinimumRole } from "../utils/workspaceRoles.util";
import {
  type GeneratePostsInput,
  type ListPostsQuery,
  type PostContent,
  postContentSchema,
  type RefinePostInput,
  type RegeneratePostInput,
  type UpdatePostContentInput,
  type UpdatePostStatusInput,
} from "../validators/post.validator";
import * as AIService from "./ai.service";
import * as ContentStrategyService from "./contentStrategy.service";

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
  status: string;
  versionCount: number;
  currentVersion: PublicPostVersion | null;
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

export const toPublicPostVersion = (version: PostVersionDocument): PublicPostVersion => ({
  id: version._id.toString(),
  version: version.version,
  content: version.content,
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
});

const toPublicPost = (post: PostDocument, version: PostVersionDocument | null): PublicPost => ({
  id: post._id.toString(),
  platform: post.platform,
  brief: {
    topic: post.brief.topic,
    goal: post.brief.goal ?? null,
    tone: post.brief.tone ?? null,
    instructions: post.brief.instructions ?? null,
  },
  status: post.status,
  versionCount: post.versionCount,
  currentVersion: version ? toPublicPostVersion(version) : null,
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

const withCurrentVersion = async (post: PostDocument) =>
  toPublicPost(post, await loadCurrentVersion(post));

// ── Versions ───────────────────────────────────────────────

interface NewVersion {
  content: PostContent;
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
  { content, source, label, instructions = null, tone = null, generation = null }: NewVersion,
) => {
  const validated = postContentSchema.parse(preparePostContent(post.platform, content));

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
      return { post: toPublicPost(post, version), version };
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
  const strategy = await ContentStrategyService.getActiveStrategyContext(context);
  const result = await AIService.createPosts(context, { ...input, strategy });
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

  const strategy = await ContentStrategyService.getActiveStrategyContext(context);
  const result = await AIService.createPosts(context, {
    topic: post.brief.topic,
    goal: post.brief.goal ?? undefined,
    platforms: [post.platform],
    tone,
    instructions,
    strategy,
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

  const strategy = await ContentStrategyService.getActiveStrategyContext(context);
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

const assertEditable = (post: PostDocument) => {
  if (post.status === PostStatus.ARCHIVED) {
    throw AppError.conflict("This post is archived. Restore it before making changes.");
  }
};

export const updatePostContent = async (
  context: WorkspaceContext,
  postId: string,
  { baseVersion, content }: UpdatePostContentInput,
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
  post.status = status;
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
  await PostVersion.deleteMany({ workspace: post.workspace, post: post._id });
  await Post.deleteOne({ _id: post._id, workspace: context.workspace._id });
};

// ── Reading ────────────────────────────────────────────────

export const listPosts = async (
  { workspace }: WorkspaceContext,
  { platform, status, page, limit }: ListPostsQuery,
) => {
  const filter = {
    workspace: workspace._id,
    ...(platform ? { platform } : {}),
    ...(status ? { status } : {}),
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

  return {
    items: posts.map((post) =>
      toPublicPost(post, byId.get(post.currentVersion?.toString() ?? "") ?? null),
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
  return {
    post: toPublicPost(post, current),
    versions: versions.map(toPublicPostVersion),
  };
};

export const deleteWorkspacePosts = async (workspaceId: Types.ObjectId): Promise<void> => {
  await Promise.all([
    Post.deleteMany({ workspace: workspaceId }),
    PostVersion.deleteMany({ workspace: workspaceId }),
  ]);
};
