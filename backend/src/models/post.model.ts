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
import { HOLD_REASON_VALUES, type HoldReasonValue } from "../constants/autopilot.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

/** What the post was asked for. Reused when regenerating. */
export interface IPostBrief {
  topic: string;
  goal: BrandGoalValue | null;
  tone: BrandToneValue | null;
  instructions: string | null;
}

/** Set on posts Autopilot wrote. */
export interface IPostAutopilot {
  slot: Types.ObjectId;
  /** Why the post is waiting for a person; null once it's scheduled or decided. */
  heldReason: HoldReasonValue | null;
  heldMessage: string | null;
  /**
   * The person who approved it. Approved posts are a human decision, so pausing
   * Autopilot doesn't stop them; it stops what Autopilot scheduled on its own.
   */
  approvedBy: Types.ObjectId | null;
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
  /** Content pillar from the active strategy, used by calendar filters. */
  pillar: string | null;
  /** The instant it should publish, stored in UTC. Null means unscheduled. */
  scheduledAt: Date | null;
  publishedAt: Date | null;
  currentVersion: Types.ObjectId | null;
  versionCount: number;
  autopilot: IPostAutopilot | null;
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

const AutopilotSchema = new Schema<IPostAutopilot>(
  {
    slot: { type: Schema.Types.ObjectId, ref: "AutopilotSlot", required: true },
    heldReason: { type: String, enum: [...HOLD_REASON_VALUES, null], default: null },
    heldMessage: { type: String, default: null, maxlength: 500 },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false },
);

const PostSchema = new Schema<IPost>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    platform: { type: String, enum: CREATE_PLATFORMS, required: true },
    brief: { type: BriefSchema, required: true },
    status: { type: String, enum: POST_STATUSES, default: PostStatus.DRAFT, required: true },
    pillar: { type: String, default: null, maxlength: LIMITS.pillar },
    scheduledAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    currentVersion: { type: Schema.Types.ObjectId, ref: "PostVersion", default: null },
    versionCount: { type: Number, default: 0, min: 0 },
    autopilot: { type: AutopilotSchema, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

PostSchema.index({ workspace: 1, createdAt: -1 });
PostSchema.index({ workspace: 1, platform: 1, status: 1, createdAt: -1 });
// Calendar ranges and the unscheduled backlog.
PostSchema.index({ workspace: 1, scheduledAt: 1 });

// Autopilot's approval queue and a slot's posts.
// One Autopilot post per slot and platform: a slot written twice (a crashed
// worker's lock expiring mid-write) fails on insert instead of posting twice.
PostSchema.index(
  { workspace: 1, "autopilot.slot": 1, platform: 1 },
  { unique: true, partialFilterExpression: { "autopilot.slot": { $exists: true } } },
);
// Posts list sorted by last update; published and scheduled posts by time (analytics, insights, Autopilot limits).
PostSchema.index({ workspace: 1, updatedAt: -1 });
PostSchema.index({ workspace: 1, status: 1, publishedAt: -1 });
PostSchema.index({ workspace: 1, status: 1, scheduledAt: 1 });

PostSchema.plugin(workspaceScopedPlugin);

export const Post: Model<IPost> = mongoose.model<IPost>("Post", PostSchema);
