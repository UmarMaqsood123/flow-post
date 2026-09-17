import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import { CREATE_PLATFORMS, type CreatePlatformValue } from "../constants/post.constant";
import {
  PUBLISHING_LIMITS as LIMITS,
  SCHEDULE_STATUSES,
  ScheduleStatus,
  type ScheduleStatusValue,
} from "../constants/publishing.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

export interface IScheduleError {
  code: string;
  message: string;
  occurredAt: Date;
}

export interface IScheduleResult {
  providerPostId: string;
  url: string | null;
}

/**
 * The plan to publish one post to one connected account at one instant.
 * `scheduledAt` is absolute (UTC); the workspace time zone is a display concern.
 */
export interface ISchedule {
  workspace: Types.ObjectId;
  post: Types.ObjectId;
  socialAccount: Types.ObjectId;
  platform: CreatePlatformValue;
  scheduledAt: Date;
  status: ScheduleStatusValue;
  /**
   * True only while the schedule is live (queued or publishing). A unique index
   * on it stops one post ever having two live schedules.
   */
  isLive: boolean | null;
  attempts: number;
  maxAttempts: number;
  currentJob: Types.ObjectId | null;
  publishedAt: Date | null;
  result: IScheduleResult | null;
  lastError: IScheduleError | null;
  /** The platform was called but the answer never arrived; a person must check. */
  needsReview: boolean;
  createdBy: Types.ObjectId;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ScheduleDocument = HydratedDocument<ISchedule>;

const ErrorSchema = new Schema<IScheduleError>(
  {
    code: { type: String, required: true, maxlength: 100 },
    message: { type: String, required: true, maxlength: LIMITS.errorMessage },
    occurredAt: { type: Date, required: true },
  },
  { _id: false },
);

const ResultSchema = new Schema<IScheduleResult>(
  {
    providerPostId: { type: String, required: true, maxlength: 300 },
    url: { type: String, default: null, maxlength: 2048 },
  },
  { _id: false },
);

const ScheduleSchema = new Schema<ISchedule>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    socialAccount: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    platform: { type: String, enum: CREATE_PLATFORMS, required: true },
    scheduledAt: { type: Date, required: true },
    status: {
      type: String,
      enum: SCHEDULE_STATUSES,
      default: ScheduleStatus.SCHEDULED,
      required: true,
    },
    isLive: { type: Boolean, default: true },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, min: 1 },
    currentJob: { type: Schema.Types.ObjectId, ref: "PublishJob", default: null },
    publishedAt: { type: Date, default: null },
    result: { type: ResultSchema, default: null },
    lastError: { type: ErrorSchema, default: null },
    needsReview: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

ScheduleSchema.index({ workspace: 1, scheduledAt: 1 });
ScheduleSchema.index({ post: 1, createdAt: -1 });
ScheduleSchema.index({ status: 1, scheduledAt: 1 });
// The admin panel's publishing failures, newest first.
ScheduleSchema.index({ status: 1, updatedAt: -1 });
// Plan quota counts schedules created this period; analytics finds an account's published posts.
ScheduleSchema.index({ workspace: 1, createdAt: 1 });
ScheduleSchema.index({ workspace: 1, socialAccount: 1, publishedAt: -1 });
// At most one live schedule per post: the database rejects a second one.
ScheduleSchema.index(
  { post: 1, isLive: 1 },
  {
    unique: true,
    partialFilterExpression: { isLive: true },
    name: "one_live_schedule_per_post",
  },
);

ScheduleSchema.plugin(workspaceScopedPlugin);

export const Schedule: Model<ISchedule> = mongoose.model<ISchedule>("Schedule", ScheduleSchema);
