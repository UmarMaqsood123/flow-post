import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  PUBLISH_ATTEMPT_STATUSES,
  PublishAttemptStatus,
  type PublishAttemptStatusValue,
  PUBLISHING_LIMITS as LIMITS,
} from "../constants/publishing.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";
import type { IScheduleResult } from "./schedule.model";

/**
 * One run of a publish job. `requestSent` is the important bit: if it's true and
 * the attempt never finished, the platform may hold a post we don't know about,
 * so nothing may be published again without a person checking.
 */
export interface IPublishAttempt {
  workspace: Types.ObjectId;
  publishJob: Types.ObjectId;
  schedule: Types.ObjectId;
  post: Types.ObjectId;
  attempt: number;
  status: PublishAttemptStatusValue;
  /** The platform request was actually sent. */
  requestSent: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  result: IScheduleResult | null;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  /** Worker that ran it, as `host:pid`. */
  worker: string;
  createdAt: Date;
}

export type PublishAttemptDocument = HydratedDocument<IPublishAttempt>;

const ResultSchema = new Schema<IScheduleResult>(
  {
    providerPostId: { type: String, required: true, maxlength: 300 },
    url: { type: String, default: null, maxlength: 2048 },
  },
  { _id: false },
);

const AttemptErrorSchema = new Schema<NonNullable<IPublishAttempt["error"]>>(
  {
    code: { type: String, required: true, maxlength: 100 },
    message: { type: String, required: true, maxlength: LIMITS.errorMessage },
    retryable: { type: Boolean, required: true },
  },
  { _id: false },
);

const PublishAttemptSchema = new Schema<IPublishAttempt>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    publishJob: { type: Schema.Types.ObjectId, ref: "PublishJob", required: true },
    schedule: { type: Schema.Types.ObjectId, ref: "Schedule", required: true },
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    attempt: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: PUBLISH_ATTEMPT_STATUSES,
      default: PublishAttemptStatus.IN_FLIGHT,
      required: true,
    },
    requestSent: { type: Boolean, default: false },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null, min: 0 },
    result: { type: ResultSchema, default: null },
    error: { type: AttemptErrorSchema, default: null },
    worker: { type: String, required: true, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

PublishAttemptSchema.index({ publishJob: 1, attempt: 1 }, { unique: true });
PublishAttemptSchema.index({ schedule: 1, startedAt: -1 });

PublishAttemptSchema.plugin(workspaceScopedPlugin);

export const PublishAttempt: Model<IPublishAttempt> = mongoose.model<IPublishAttempt>(
  "PublishAttempt",
  PublishAttemptSchema,
);
