import type { Types } from "mongoose";
import { logger } from "../config/logger";
import { ContentStrategyStatus } from "../constants/contentStrategy.constant";
import { lines } from "../integrations/ai/prompts/format";
import { WorkspaceRole } from "../constants/workspace.constant";
import {
  ContentStrategy,
  type ContentStrategyDocument,
  type IStrategyInputs,
  type PublicContentStrategy,
  toContentStrategySummary,
  toPublicContentStrategy,
} from "../models/contentStrategy.model";
import { AppError } from "../utils/appError.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import { hasMinimumRole } from "../utils/workspaceRoles.util";
import type {
  GenerateContentStrategyInput,
  RegenerateContentStrategyInput,
  UpdateContentStrategyInput,
} from "../validators/contentStrategy.validator";
import * as AIService from "./ai.service";
import * as BrandProfileService from "./brandProfile.service";

const POPULATE_USERS = ["createdBy", "editedBy", "activatedBy"].map((path) => ({
  path,
  select: "name",
}));
const HISTORY_LIMIT = 100;
/** Two generations finishing together can race for the same version number. */
const MAX_VERSION_ATTEMPTS = 3;

export interface GeneratedStrategy {
  strategy: PublicContentStrategy;
  warnings: string[];
}

const isDuplicateKey = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

const findStrategy = async (
  { workspace }: WorkspaceContext,
  strategyId: string,
): Promise<ContentStrategyDocument> => {
  const strategy = await ContentStrategy.findOne({
    _id: strategyId,
    workspace: workspace._id,
  }).populate(POPULATE_USERS);
  if (!strategy) throw AppError.notFound("Content strategy not found");
  return strategy;
};

export const listStrategies = async ({ workspace }: WorkspaceContext) => {
  const strategies = await ContentStrategy.find({ workspace: workspace._id })
    .select("-content")
    .sort({ version: -1 })
    .limit(HISTORY_LIMIT)
    .populate(POPULATE_USERS);
  return strategies.map(toContentStrategySummary);
};

export const getStrategy = async (context: WorkspaceContext, strategyId: string) =>
  toPublicContentStrategy(await findStrategy(context, strategyId));

export const getActiveStrategy = async ({
  workspace,
}: WorkspaceContext): Promise<PublicContentStrategy | null> => {
  const strategy = await ContentStrategy.findOne({
    workspace: workspace._id,
    status: ContentStrategyStatus.ACTIVE,
  }).populate(POPULATE_USERS);
  return strategy ? toPublicContentStrategy(strategy) : null;
};

/**
 * Compact summary of the active strategy for prompts: pillars, tone, calls to
 * action, hashtags and each platform's focus. Null when no strategy is active.
 */
export const getActiveStrategyContext = async (
  context: WorkspaceContext,
): Promise<string | null> => {
  const strategy = await getActiveStrategy(context);
  if (!strategy) return null;
  const { contentPillars, brandTone, ctaStrategy, hashtagApproach, platformStrategy } =
    strategy.content;

  return lines(
    contentPillars.length > 0 &&
      `Content pillars: ${contentPillars.map((pillar) => pillar.name).join("; ")}`,
    brandTone.summary && `Tone: ${brandTone.summary}`,
    brandTone.voiceAttributes.length > 0 && `Voice: ${brandTone.voiceAttributes.join(", ")}`,
    brandTone.dos.length > 0 && `Do: ${brandTone.dos.join("; ")}`,
    brandTone.donts.length > 0 && `Don't: ${brandTone.donts.join("; ")}`,
    ctaStrategy.summary && `Calls to action: ${ctaStrategy.summary}`,
    ctaStrategy.ctas.length > 0 &&
      `Example calls to action: ${ctaStrategy.ctas
        .slice(0, 4)
        .map((cta) => cta.text)
        .join(" | ")}`,
    `Hashtags: ${hashtagApproach.minPerPost} to ${hashtagApproach.maxPerPost} per post.` +
      (hashtagApproach.branded.length > 0
        ? ` Branded: ${hashtagApproach.branded.join(" ")}.`
        : "") +
      (hashtagApproach.community.length > 0
        ? ` Community: ${hashtagApproach.community.join(" ")}.`
        : "") +
      (hashtagApproach.niche.length > 0 ? ` Niche: ${hashtagApproach.niche.join(" ")}.` : ""),
    ...platformStrategy.map((plan) => `${plan.platform}: ${plan.contentFocus}`),
  );
};

/** Generates content with AI and stores it as the next draft version. */
const createVersion = async (
  context: WorkspaceContext,
  {
    name,
    inputs,
    basedOnVersion,
  }: { name: string | null; inputs: IStrategyInputs; basedOnVersion: number | null },
): Promise<GeneratedStrategy> => {
  const brandProfile = await BrandProfileService.getBrandProfile(context);
  const result = await AIService.generateContentStrategy(context, {
    timeframe: inputs.timeframe,
    platforms: inputs.platforms.length > 0 ? inputs.platforms : undefined,
    focus: inputs.focus ?? undefined,
    instructions: inputs.instructions ?? undefined,
  });

  const generation = {
    provider: result.provider,
    model: result.model,
    promptVersion: result.promptVersion,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    estimatedCostUsd: result.usage.estimatedCostUsd,
    brandProfileUpdatedAt: brandProfile.updatedAt,
    brandProfileComplete: result.brandProfileComplete,
    warnings: result.warnings,
    generatedAt: new Date(),
  };

  for (let attempt = 1; ; attempt += 1) {
    const latest = await ContentStrategy.findOne({ workspace: context.workspace._id })
      .sort({ version: -1 })
      .select("version");
    try {
      const strategy = await ContentStrategy.create({
        workspace: context.workspace._id,
        version: (latest?.version ?? 0) + 1,
        name,
        status: ContentStrategyStatus.DRAFT,
        content: result.data,
        inputs,
        generation,
        basedOnVersion,
        createdBy: context.user._id,
      });
      await strategy.populate(POPULATE_USERS);
      return { strategy: toPublicContentStrategy(strategy), warnings: result.warnings };
    } catch (error) {
      if (!isDuplicateKey(error) || attempt >= MAX_VERSION_ATTEMPTS) throw error;
    }
  }
};

export const generateStrategy = (context: WorkspaceContext, input: GenerateContentStrategyInput) =>
  createVersion(context, {
    name: input.name ?? null,
    inputs: {
      timeframe: input.timeframe,
      platforms: input.platforms ?? [],
      focus: input.focus ?? null,
      instructions: null,
    },
    basedOnVersion: null,
  });

/** Creates a new draft version from an existing one's settings. The source version is unchanged. */
export const regenerateStrategy = async (
  context: WorkspaceContext,
  strategyId: string,
  input: RegenerateContentStrategyInput,
) => {
  const source = await findStrategy(context, strategyId);
  return createVersion(context, {
    name: source.name ?? null,
    inputs: {
      timeframe: input.timeframe ?? source.inputs.timeframe,
      platforms: input.platforms ?? [...source.inputs.platforms],
      focus: input.focus === undefined ? (source.inputs.focus ?? null) : input.focus,
      instructions: input.instructions ?? null,
    },
    basedOnVersion: source.version,
  });
};

/** Saves the name and/or whole sections. Editors edit drafts; the active strategy needs an admin. */
export const updateStrategy = async (
  context: WorkspaceContext,
  strategyId: string,
  { revision, name, sections }: UpdateContentStrategyInput,
) => {
  const strategy = await findStrategy(context, strategyId);
  if (strategy.status === ContentStrategyStatus.ARCHIVED) {
    throw AppError.conflict(
      "Previous versions can't be edited. Activate this version or regenerate it to make changes.",
    );
  }
  if (
    strategy.status === ContentStrategyStatus.ACTIVE &&
    !hasMinimumRole(context.member.role, WorkspaceRole.ADMIN)
  ) {
    throw AppError.forbidden("Only admins and owners can edit the active strategy");
  }

  const changes: Record<string, unknown> = { editedBy: context.user._id, editedAt: new Date() };
  if (name !== undefined) changes.name = name;
  for (const [section, value] of Object.entries(sections ?? {})) {
    if (value !== undefined) changes[`content.${section}`] = value;
  }

  const updated = await ContentStrategy.findOneAndUpdate(
    {
      _id: strategy._id,
      workspace: context.workspace._id,
      revision,
      status: strategy.status,
    },
    { $set: changes, $inc: { revision: 1 } },
    { returnDocument: "after" },
  ).populate(POPULATE_USERS);

  if (!updated) {
    throw AppError.conflict(
      "Someone else changed this strategy while you were editing. Reload to see their changes, then save again.",
    );
  }
  return toPublicContentStrategy(updated);
};

/** Makes a draft or previous version the workspace's only active strategy. */
export const activateStrategy = async (context: WorkspaceContext, strategyId: string) => {
  const strategy = await findStrategy(context, strategyId);
  if (strategy.status === ContentStrategyStatus.ACTIVE) return toPublicContentStrategy(strategy);

  const workspaceId = context.workspace._id;
  const now = new Date();
  const previous = await ContentStrategy.find({
    workspace: workspaceId,
    status: ContentStrategyStatus.ACTIVE,
  }).select("_id");
  const previousIds = previous.map((item) => item._id);

  // Archive first so the partial unique index accepts the new active strategy.
  if (previousIds.length > 0) {
    await ContentStrategy.updateMany(
      { workspace: workspaceId, _id: { $in: previousIds } },
      { $set: { status: ContentStrategyStatus.ARCHIVED, archivedAt: now } },
    );
  }

  let activated: ContentStrategyDocument | null;
  try {
    activated = await ContentStrategy.findOneAndUpdate(
      { _id: strategy._id, workspace: workspaceId, status: { $ne: ContentStrategyStatus.ACTIVE } },
      {
        $set: {
          status: ContentStrategyStatus.ACTIVE,
          activatedAt: now,
          activatedBy: context.user._id,
          archivedAt: null,
        },
      },
      { returnDocument: "after" },
    ).populate(POPULATE_USERS);
  } catch (error) {
    // Another strategy was activated at the same moment and won.
    if (isDuplicateKey(error)) {
      throw AppError.conflict("Another strategy was just activated. Reload and try again.");
    }
    throw error;
  }

  if (!activated) {
    await restorePrevious(workspaceId, previousIds);
    throw AppError.conflict(
      "This strategy changed while it was being activated. Reload and try again.",
    );
  }

  logger.info(
    { workspaceId: context.workspace.id, userId: context.user.id, version: activated.version },
    "Content strategy activated",
  );
  return toPublicContentStrategy(activated);
};

const restorePrevious = async (workspaceId: Types.ObjectId, ids: Types.ObjectId[]) => {
  if (ids.length === 0) return;
  try {
    await ContentStrategy.updateMany(
      { workspace: workspaceId, _id: { $in: ids } },
      { $set: { status: ContentStrategyStatus.ACTIVE, archivedAt: null } },
    );
  } catch (error) {
    // Someone activated another strategy in the meantime; that one stays active.
    if (!isDuplicateKey(error)) throw error;
  }
};

export const deleteWorkspaceStrategies = async (workspaceId: Types.ObjectId): Promise<void> => {
  await ContentStrategy.deleteMany({ workspace: workspaceId });
};
