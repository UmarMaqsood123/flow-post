import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  BRAND_GOALS,
  type BrandGoalValue,
  BRAND_TONES,
  type BrandToneValue,
} from "../constants/brandProfile.constant";
import {
  CREATE_PLATFORMS,
  type CreatePlatformValue,
  POST_LIMITS as LIMITS,
  POST_STATUSES,
  PostStatus,
  type PostStatusValue,
} from "../constants/post.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

/** What the post was asked for. Reused when regenerating. */
export interface IPostBrief {
  topic: string;
  goal: BrandGoalValue | null;
  tone: BrandToneValue | null;
  instructions: string | null;
}

/**
 * One post for one platform. Its content lives in PostVersion: every change
 * appends a version, and `currentVersion` points at the newest.
 */
export interface IPost {
  workspace: Types.ObjectId;
  platform: CreatePlatformValue;
  brief: IPostBrief;
  status: PostStatusValue;
  currentVersion: Types.ObjectId | null;
  versionCount: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PostDocument = HydratedDocument<IPost>;

const BriefSchema = new Schema<IPostBrief>(
  {
    topic: { type: String, required: true, maxlength: LIMITS.topic },
    goal: { type: String, enum: [...BRAND_GOALS, null], default: null },
    tone: { type: String, enum: [...BRAND_TONES, null], default: null },
    instructions: { type: String, default: null, maxlength: LIMITS.instructions },
  },
  { _id: false },
);

const PostSchema = new Schema<IPost>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    platform: { type: String, enum: CREATE_PLATFORMS, required: true },
    brief: { type: BriefSchema, required: true },
    status: { type: String, enum: POST_STATUSES, default: PostStatus.DRAFT, required: true },
    currentVersion: { type: Schema.Types.ObjectId, ref: "PostVersion", default: null },
    versionCount: { type: Number, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

PostSchema.index({ workspace: 1, createdAt: -1 });
PostSchema.index({ workspace: 1, platform: 1, status: 1, createdAt: -1 });

PostSchema.plugin(workspaceScopedPlugin);

export const Post: Model<IPost> = mongoose.model<IPost>("Post", PostSchema);
