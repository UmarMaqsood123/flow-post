import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  AUTOPILOT_FORMAT_VALUES,
  AUTOPILOT_LIMITS as LIMITS,
  AUTOPILOT_STATUSES,
  AUTOPILOT_WEEKDAYS,
  type AutopilotFormatValue,
  type AutopilotStatusValue,
  type AutopilotWeekdayValue,
} from "../constants/autopilot.constant";
import { CREATE_PLATFORMS, type CreatePlatformValue } from "../constants/post.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

export interface IAutopilotAccountChoice {
  platform: CreatePlatformValue;
  socialAccount: Types.ObjectId;
}

/** One Autopilot setup per workspace. */
export interface IAutopilotSettings {
  workspace: Types.ObjectId;
  status: AutopilotStatusValue;
  platforms: CreatePlatformValue[];
  /** Which account to publish to, for platforms with more than one connected. */
  accounts: IAutopilotAccountChoice[];
  postsPerWeek: number;
  postingDays: AutopilotWeekdayValue[];
  /** `HH:mm` on the workspace clock. */
  postingTimes: string[];
  pillars: string[];
  formats: AutopilotFormatValue[];
  approvalRequired: boolean;
  maxPostsPerDay: number;
  /** Autopilot writes as this person, so AI usage and posts are attributed to them. */
  startedBy: Types.ObjectId | null;
  startedAt: Date | null;
  pausedAt: Date | null;
  /** Null when Autopilot paused itself. */
  pausedBy: Types.ObjectId | null;
  pauseReason: string | null;
  consecutiveGenerationFailures: number;
  consecutivePublishFailures: number;
  lastSweepAt: Date | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AutopilotSettingsDocument = HydratedDocument<IAutopilotSettings>;

const AccountChoiceSchema = new Schema<IAutopilotAccountChoice>(
  {
    platform: { type: String, enum: CREATE_PLATFORMS, required: true },
    socialAccount: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
  },
  { _id: false },
);

const AutopilotSettingsSchema = new Schema<IAutopilotSettings>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    status: { type: String, enum: AUTOPILOT_STATUSES, default: "OFF" },
    platforms: { type: [{ type: String, enum: CREATE_PLATFORMS }], default: [] },
    accounts: { type: [AccountChoiceSchema], default: [] },
    postsPerWeek: { type: Number, default: 3, min: 1, max: LIMITS.postsPerWeek },
    postingDays: {
      type: [{ type: String, enum: AUTOPILOT_WEEKDAYS }],
      default: ["TUESDAY", "THURSDAY"],
    },
    postingTimes: { type: [String], default: ["09:00"] },
    pillars: { type: [{ type: String, maxlength: LIMITS.pillar }], default: [] },
    formats: { type: [{ type: String, enum: AUTOPILOT_FORMAT_VALUES }], default: ["TIPS"] },
    approvalRequired: { type: Boolean, default: true },
    maxPostsPerDay: { type: Number, default: 3, min: 1, max: LIMITS.postsPerDay },
    startedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    startedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    pausedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    pauseReason: { type: String, default: null, maxlength: LIMITS.pauseReason },
    consecutiveGenerationFailures: { type: Number, default: 0, min: 0 },
    consecutivePublishFailures: { type: Number, default: 0, min: 0 },
    lastSweepAt: { type: Date, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

AutopilotSettingsSchema.index({ workspace: 1 }, { unique: true });
// The worker's sweep reads active setups across workspaces.
AutopilotSettingsSchema.index({ status: 1 });

AutopilotSettingsSchema.plugin(workspaceScopedPlugin);

export const AutopilotSettings: Model<IAutopilotSettings> = mongoose.model<IAutopilotSettings>(
  "AutopilotSettings",
  AutopilotSettingsSchema,
);
