import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import { CREATE_PLATFORMS, type CreatePlatformValue } from "../constants/post.constant";
import {
  PUBLISH_JOB_STATUSES,
  PublishJobStatus,
  type PublishJobStatusValue,
  PUBLISHING_LIMITS as LIMITS,
} from "../constants/publishing.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";
import type { IScheduleError, IScheduleResult } from "./schedule.model";

/**
 * One queued execution of a schedule, mirroring a BullMQ job. Rescheduling or
 * retrying after a failure creates a new job, so the history is never rewritten.
 */
export interface IPublishJob {
  workspace: Types.ObjectId;
  schedule: Types.ObjectId;
  post: Types.ObjectId;
  socialAccount: Types.ObjectId;
  platform: CreatePlatformValue;
  /** BullMQ job id. Deterministic, so adding the same job twice is a no-op. */
  queueJobId: string;
  /**
   * Ties every attempt of this job to one intended platform post. Retries reuse
   * it, so a retry can never mean "post again".
   */
  idempotencyKey: string;
  status: PublishJobStatusValue;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  /** Worker holding the job, as `host:pid`, with the time it claimed it. */
  lockedBy: string | null;
  lockedAt: Date | null;
  result: IScheduleResult | null;
  error: (IScheduleError & { retryable: boolean }) | null;
  /** A platform call started but never reported back. */
  outcomeUnknown: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PublishJobDocument = HydratedDocument<IPublishJob>;

const ErrorSchema = new Schema<IScheduleError & { retryable: boolean }>(
  {
    code: { type: String, required: true, maxlength: 100 },
    message: { type: String, required: true, maxlength: LIMITS.errorMessage },
    occurredAt: { type: Date, required: true },
    retryable: { type: Boolean, required: true },
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

const PublishJobSchema = new Schema<IPublishJob>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    schedule: { type: Schema.Types.ObjectId, ref: "Schedule", required: true },
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    socialAccount: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    platform: { type: String, enum: CREATE_PLATFORMS, required: true },
    queueJobId: { type: String, required: true, maxlength: 200 },
    idempotencyKey: { type: String, required: true, maxlength: 200 },
    status: {
      type: String,
      enum: PUBLISH_JOB_STATUSES,
      default: PublishJobStatus.QUEUED,
      required: true,
    },
    runAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, min: 1 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null, maxlength: 200 },
    lockedAt: { type: Date, default: null },
    result: { type: ResultSchema, default: null },
    error: { type: ErrorSchema, default: null },
    outcomeUnknown: { type: Boolean, default: false },
  },
  { timestamps: true },
);

PublishJobSchema.index({ queueJobId: 1 }, { unique: true });
PublishJobSchema.index({ idempotencyKey: 1 }, { unique: true });
PublishJobSchema.index({ schedule: 1, createdAt: -1 });
// Used by the recovery sweep to find jobs a crashed worker left behind.
PublishJobSchema.index({ status: 1, lockedAt: 1 });
// Recovery checks queue entries for jobs coming due.
PublishJobSchema.index({ status: 1, runAt: 1 });

PublishJobSchema.plugin(workspaceScopedPlugin);

export const PublishJob: Model<IPublishJob> = mongoose.model<IPublishJob>(
  "PublishJob",
  PublishJobSchema,
);
