import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import { BRAND_TONES, type BrandToneValue } from "../constants/brandProfile.constant";
import {
  POST_LIMITS as LIMITS,
  VERSION_SOURCES,
  type VersionSourceValue,
} from "../constants/post.constant";
import type { PostContent } from "../validators/post.validator";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

export interface IVersionGeneration {
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
}

/** An immutable snapshot of a post's content. Nothing is ever edited in place. */
export interface IPostVersion {
  workspace: Types.ObjectId;
  post: Types.ObjectId;
  /** 1, 2, 3… per post. */
  version: number;
  /** Validated with postContentSchema before every write. */
  content: PostContent;
  source: VersionSourceValue;
  /** Short human-readable description, e.g. "Tone changed to Friendly". */
  label: string;
  /** What the user asked for in this step. */
  instructions: string | null;
  tone: BrandToneValue | null;
  /** Null for manual edits, restores and emoji removal, which don't call AI. */
  generation: IVersionGeneration | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export type PostVersionDocument = HydratedDocument<IPostVersion>;

const GenerationSchema = new Schema<IVersionGeneration>(
  {
    provider: { type: String, required: true, maxlength: 50 },
    model: { type: String, required: true, maxlength: 100 },
    promptVersion: { type: String, required: true, maxlength: 20 },
    inputTokens: { type: Number, required: true, min: 0 },
    outputTokens: { type: Number, required: true, min: 0 },
    estimatedCostUsd: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

const PostVersionSchema = new Schema<IPostVersion>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    version: { type: Number, required: true, min: 1 },
    content: { type: Schema.Types.Mixed, required: true },
    source: { type: String, enum: VERSION_SOURCES, required: true },
    label: { type: String, required: true, maxlength: 120 },
    instructions: { type: String, default: null, maxlength: LIMITS.instructions },
    tone: { type: String, enum: [...BRAND_TONES, null], default: null },
    generation: { type: GenerationSchema, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

PostVersionSchema.index({ post: 1, version: -1 });
PostVersionSchema.index({ post: 1, version: 1 }, { unique: true });

PostVersionSchema.plugin(workspaceScopedPlugin);

export const PostVersion: Model<IPostVersion> = mongoose.model<IPostVersion>(
  "PostVersion",
  PostVersionSchema,
);
