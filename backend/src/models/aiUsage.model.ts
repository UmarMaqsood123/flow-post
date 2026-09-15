import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  AI_OPERATIONS,
  type AIOperationValue,
  AIUsageStatus,
  type AIUsageStatusValue,
} from "../constants/ai.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

/**
 * One record per AI request (success or failure), for cost tracking and limits.
 * Prompts and generated content are deliberately not stored.
 */
export interface IAIUsage {
  workspace: Types.ObjectId;
  user: Types.ObjectId;
  operation: AIOperationValue;
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** Null when the model's price is unknown. */
  estimatedCostUsd: number | null;
  status: AIUsageStatusValue;
  errorCode: string | null;
  durationMs: number;
  attempts: number;
  providerRequestId: string | null;
  createdAt: Date;
}

export type AIUsageDocument = HydratedDocument<IAIUsage>;

const AIUsageSchema = new Schema<IAIUsage>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    operation: { type: String, enum: AI_OPERATIONS, required: true },
    provider: { type: String, required: true, maxlength: 50 },
    model: { type: String, required: true, maxlength: 100 },
    promptVersion: { type: String, required: true, maxlength: 20 },
    inputTokens: { type: Number, required: true, min: 0, default: 0 },
    outputTokens: { type: Number, required: true, min: 0, default: 0 },
    cachedInputTokens: { type: Number, required: true, min: 0, default: 0 },
    estimatedCostUsd: { type: Number, default: null, min: 0 },
    status: { type: String, enum: Object.values(AIUsageStatus), required: true },
    errorCode: { type: String, default: null, maxlength: 50 },
    durationMs: { type: Number, required: true, min: 0 },
    attempts: { type: Number, required: true, min: 0, default: 1 },
    providerRequestId: { type: String, default: null, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AIUsageSchema.index({ workspace: 1, createdAt: -1 });
AIUsageSchema.index({ workspace: 1, user: 1, createdAt: -1 });

AIUsageSchema.plugin(workspaceScopedPlugin);

export const AIUsage: Model<IAIUsage> = mongoose.model<IAIUsage>("AIUsage", AIUsageSchema);
