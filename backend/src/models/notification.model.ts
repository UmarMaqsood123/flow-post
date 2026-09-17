import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  NOTIFICATION_LIMITS as LIMITS,
  NOTIFICATION_TYPES,
  type NotificationTypeValue,
} from "../constants/notification.constant";

/**
 * One notification for one person. Owned by the user rather than the workspace
 * (some, like billing, have no workspace), so it isn't workspace-scoped: every
 * query filters by `user`.
 */
export interface INotification {
  user: Types.ObjectId;
  workspace: Types.ObjectId | null;
  type: NotificationTypeValue;
  title: string;
  body: string;
  /** In-app path to open, e.g. `/create?post=…`. Never an external URL. */
  href: string;
  /** Stops the same event notifying twice (job retries, webhook redelivery). */
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export type NotificationDocument = HydratedDocument<INotification>;

const NotificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", default: null },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: LIMITS.title },
    body: { type: String, required: true, maxlength: LIMITS.body },
    href: { type: String, required: true, maxlength: LIMITS.href },
    dedupeKey: { type: String, default: null, maxlength: 200 },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

NotificationSchema.index({ user: 1, workspace: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, workspace: 1, readAt: 1 });
NotificationSchema.index(
  { user: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: LIMITS.retentionDays * 24 * 60 * 60 },
);

export const Notification: Model<INotification> = mongoose.model<INotification>(
  "Notification",
  NotificationSchema,
);
