import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  AUTOPILOT_EVENT_TYPES,
  type AutopilotEventTypeValue,
} from "../constants/autopilot.constant";
import { CREATE_PLATFORMS, type CreatePlatformValue } from "../constants/post.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

/**
 * Autopilot's audit trail: one row per decision or action, by a person or by
 * the system. Append-only; the schema refuses updates, and rows are only removed
 * with their workspace.
 */
export interface IAutopilotEvent {
  workspace: Types.ObjectId;
  type: AutopilotEventTypeValue;
  /** Null when Autopilot acted on its own. */
  actor: Types.ObjectId | null;
  slot: Types.ObjectId | null;
  post: Types.ObjectId | null;
  platform: CreatePlatformValue | null;
  message: string;
  /** Small structured context: before/after values, error codes, similarity scores. */
  details: Record<string, unknown> | null;
  createdAt: Date;
}

export type AutopilotEventDocument = HydratedDocument<IAutopilotEvent>;

const AutopilotEventSchema = new Schema<IAutopilotEvent>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    type: { type: String, enum: AUTOPILOT_EVENT_TYPES, required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    slot: { type: Schema.Types.ObjectId, ref: "AutopilotSlot", default: null },
    post: { type: Schema.Types.ObjectId, ref: "Post", default: null },
    platform: { type: String, enum: [...CREATE_PLATFORMS, null], default: null },
    message: { type: String, required: true, maxlength: 1000 },
    details: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AutopilotEventSchema.index({ workspace: 1, createdAt: -1 });
AutopilotEventSchema.index({ workspace: 1, type: 1, createdAt: -1 });
AutopilotEventSchema.index({ workspace: 1, post: 1, createdAt: -1 });

const refuseChange = () => {
  throw new Error("Autopilot events are append-only");
};
for (const operation of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
] as const) {
  AutopilotEventSchema.pre(operation, refuseChange);
}
AutopilotEventSchema.pre("save", function guardSave() {
  if (!this.isNew) refuseChange();
});

AutopilotEventSchema.plugin(workspaceScopedPlugin);

export const AutopilotEvent: Model<IAutopilotEvent> = mongoose.model<IAutopilotEvent>(
  "AutopilotEvent",
  AutopilotEventSchema,
);
