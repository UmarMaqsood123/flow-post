import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import { STRATEGY_TIMEFRAMES, type StrategyTimeframeValue } from "../constants/ai.constant";
import { SOCIAL_PLATFORMS, type SocialPlatformValue } from "../constants/brandProfile.constant";
import {
  CONTENT_STRATEGY_LIMITS as LIMITS,
  CONTENT_STRATEGY_STATUSES,
  ContentStrategyStatus,
  type ContentStrategyStatusValue,
} from "../constants/contentStrategy.constant";
import type { StrategyContent } from "../validators/contentStrategy.validator";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

/** What the strategy was generated from, reused when regenerating. */
export interface IStrategyInputs {
  timeframe: StrategyTimeframeValue;
  /** Empty means the brand profile's preferred platforms. */
  platforms: SocialPlatformValue[];
  focus: string | null;
  instructions: string | null;
}

export interface IStrategyGeneration {
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  /** The brand profile's last change when the strategy was generated. */
  brandProfileUpdatedAt: Date | null;
  brandProfileComplete: boolean;
  warnings: string[];
  generatedAt: Date;
}

/**
 * A version of a workspace's content strategy. Generating or regenerating
 * always creates a new version; edits change a version in place.
 */
export interface IContentStrategy {
  workspace: Types.ObjectId;
  /** 1, 2, 3… per workspace. */
  version: number;
  name: string | null;
  status: ContentStrategyStatusValue;
  /** Validated with strategyContentSchema before every write. */
  content: StrategyContent;
  inputs: IStrategyInputs;
  generation: IStrategyGeneration;
  /** The version this one was regenerated from. */
  basedOnVersion: number | null;
  /** Incremented on every edit, so a save can't overwrite a teammate's newer changes. */
  revision: number;
  createdBy: Types.ObjectId;
  editedBy: Types.ObjectId | null;
  editedAt: Date | null;
  activatedBy: Types.ObjectId | null;
  activatedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ContentStrategyDocument = HydratedDocument<IContentStrategy>;

const InputsSchema = new Schema<IStrategyInputs>(
  {
    timeframe: { type: String, enum: STRATEGY_TIMEFRAMES, required: true },
    platforms: { type: [{ type: String, enum: SOCIAL_PLATFORMS }], default: [] },
    focus: { type: String, default: null, maxlength: LIMITS.instructions },
    instructions: { type: String, default: null, maxlength: LIMITS.instructions },
  },
  { _id: false },
);

const GenerationSchema = new Schema<IStrategyGeneration>(
  {
    provider: { type: String, required: true, maxlength: 50 },
    model: { type: String, required: true, maxlength: 100 },
    promptVersion: { type: String, required: true, maxlength: 20 },
    inputTokens: { type: Number, required: true, min: 0 },
    outputTokens: { type: Number, required: true, min: 0 },
    estimatedCostUsd: { type: Number, default: null, min: 0 },
    brandProfileUpdatedAt: { type: Date, default: null },
    brandProfileComplete: { type: Boolean, required: true },
    warnings: { type: [{ type: String, maxlength: 500 }], default: [] },
    generatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const ContentStrategySchema = new Schema<IContentStrategy>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    version: { type: Number, required: true, min: 1 },
    name: { type: String, default: null, maxlength: LIMITS.name },
    status: {
      type: String,
      enum: CONTENT_STRATEGY_STATUSES,
      default: ContentStrategyStatus.DRAFT,
      required: true,
    },
    content: { type: Schema.Types.Mixed, required: true },
    inputs: { type: InputsSchema, required: true },
    generation: { type: GenerationSchema, required: true },
    basedOnVersion: { type: Number, default: null },
    revision: { type: Number, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    editedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    editedAt: { type: Date, default: null },
    activatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    activatedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

ContentStrategySchema.index({ workspace: 1, version: 1 }, { unique: true });
// The database guarantees at most one active strategy per workspace.
ContentStrategySchema.index(
  { workspace: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ContentStrategyStatus.ACTIVE },
    name: "one_active_strategy_per_workspace",
  },
);

ContentStrategySchema.plugin(workspaceScopedPlugin);

export const ContentStrategy: Model<IContentStrategy> = mongoose.model<IContentStrategy>(
  "ContentStrategy",
  ContentStrategySchema,
);

export interface UserReference {
  id: string;
  name: string;
}

export interface ContentStrategySummary {
  id: string;
  version: number;
  name: string | null;
  status: ContentStrategyStatusValue;
  inputs: IStrategyInputs;
  generation: IStrategyGeneration;
  basedOnVersion: number | null;
  revision: number;
  createdBy: UserReference | null;
  editedBy: UserReference | null;
  editedAt: Date | null;
  activatedBy: UserReference | null;
  activatedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicContentStrategy extends ContentStrategySummary {
  content: StrategyContent;
}

/** A populated `{ _id, name }` user, or null when not populated or the user no longer exists. */
const toUserReference = (value: unknown): UserReference | null => {
  if (typeof value !== "object" || value === null || !("name" in value)) return null;
  const user = value as { _id: Types.ObjectId; name: string };
  return { id: user._id.toString(), name: user.name };
};

export const toContentStrategySummary = (
  strategy: ContentStrategyDocument,
): ContentStrategySummary => ({
  id: strategy._id.toString(),
  version: strategy.version,
  name: strategy.name ?? null,
  status: strategy.status,
  inputs: {
    timeframe: strategy.inputs.timeframe,
    platforms: [...strategy.inputs.platforms],
    focus: strategy.inputs.focus ?? null,
    instructions: strategy.inputs.instructions ?? null,
  },
  generation: {
    provider: strategy.generation.provider,
    model: strategy.generation.model,
    promptVersion: strategy.generation.promptVersion,
    inputTokens: strategy.generation.inputTokens,
    outputTokens: strategy.generation.outputTokens,
    estimatedCostUsd: strategy.generation.estimatedCostUsd ?? null,
    brandProfileUpdatedAt: strategy.generation.brandProfileUpdatedAt ?? null,
    brandProfileComplete: strategy.generation.brandProfileComplete,
    warnings: [...strategy.generation.warnings],
    generatedAt: strategy.generation.generatedAt,
  },
  basedOnVersion: strategy.basedOnVersion ?? null,
  revision: strategy.revision,
  createdBy: toUserReference(strategy.createdBy),
  editedBy: toUserReference(strategy.editedBy),
  editedAt: strategy.editedAt ?? null,
  activatedBy: toUserReference(strategy.activatedBy),
  activatedAt: strategy.activatedAt ?? null,
  archivedAt: strategy.archivedAt ?? null,
  createdAt: strategy.createdAt,
  updatedAt: strategy.updatedAt,
});

export const toPublicContentStrategy = (
  strategy: ContentStrategyDocument,
): PublicContentStrategy => ({
  ...toContentStrategySummary(strategy),
  content: strategy.content,
});
