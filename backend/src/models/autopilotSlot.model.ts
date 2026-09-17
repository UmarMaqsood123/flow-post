import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  AUTOPILOT_FORMAT_VALUES,
  type AutopilotFormatValue,
  SLOT_STATUSES,
  type SlotStatusValue,
} from "../constants/autopilot.constant";
import { CREATE_PLATFORMS, type CreatePlatformValue } from "../constants/post.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

/**
 * One planned posting time. It's the unit of Autopilot's work: claimed by one
 * worker, written once, and never planned twice (unique per workspace and time).
 */
export interface IAutopilotSlot {
  workspace: Types.ObjectId;
  scheduledAt: Date;
  /** `YYYY-MM-DD` on the workspace clock, for daily limits. */
  localDay: string;
  /** Monday of the slot's week on the workspace clock, for weekly limits. */
  weekStart: string;
  status: SlotStatusValue;
  platforms: CreatePlatformValue[];
  pillar: string | null;
  format: AutopilotFormatValue | null;
  topic: string | null;
  angle: string | null;
  posts: Types.ObjectId[];
  attempts: number;
  nextAttemptAt: Date | null;
  lockedAt: Date | null;
  lastError: { code: string; message: string; occurredAt: Date } | null;
  skipReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AutopilotSlotDocument = HydratedDocument<IAutopilotSlot>;

const AutopilotSlotSchema = new Schema<IAutopilotSlot>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    scheduledAt: { type: Date, required: true },
    localDay: { type: String, required: true, maxlength: 10 },
    weekStart: { type: String, required: true, maxlength: 10 },
    status: { type: String, enum: SLOT_STATUSES, default: "PLANNED" },
    platforms: { type: [{ type: String, enum: CREATE_PLATFORMS }], default: [] },
    pillar: { type: String, default: null, maxlength: 120 },
    format: { type: String, enum: [...AUTOPILOT_FORMAT_VALUES, null], default: null },
    topic: { type: String, default: null, maxlength: 500 },
    angle: { type: String, default: null, maxlength: 500 },
    posts: { type: [{ type: Schema.Types.ObjectId, ref: "Post" }], default: [] },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    lastError: {
      type: new Schema(
        {
          code: { type: String, required: true, maxlength: 100 },
          message: { type: String, required: true, maxlength: 500 },
          occurredAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    skipReason: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true },
);

// A posting time is planned at most once, even with several workers.
AutopilotSlotSchema.index({ workspace: 1, scheduledAt: 1 }, { unique: true });
AutopilotSlotSchema.index({ workspace: 1, status: 1, scheduledAt: 1 });
AutopilotSlotSchema.index({ workspace: 1, weekStart: 1, status: 1 });

AutopilotSlotSchema.plugin(workspaceScopedPlugin);

export const AutopilotSlot: Model<IAutopilotSlot> = mongoose.model<IAutopilotSlot>(
  "AutopilotSlot",
  AutopilotSlotSchema,
);
