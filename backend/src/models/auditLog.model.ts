import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  AUDIT_ACTIONS,
  AUDIT_SOURCES,
  AUDIT_TARGET_TYPES,
  type AuditActionValue,
  type AuditSourceValue,
  type AuditTargetTypeValue,
} from "../constants/audit.constant";

/**
 * A record of a sensitive super admin action. Append-only: the schema refuses
 * updates and deletes, and there's no API to change or remove records.
 */
export interface IAuditLog {
  action: AuditActionValue;
  /** Null for actions from the command line. */
  actor: Types.ObjectId | null;
  /** Copied at the time, so the record still reads correctly if the account changes. */
  actorEmail: string | null;
  targetType: AuditTargetTypeValue;
  targetId: Types.ObjectId;
  targetLabel: string | null;
  /** Required for changes such as suspension. */
  reason: string | null;
  /** Small structured context, e.g. before/after status or which filters were used. */
  metadata: Record<string, unknown> | null;
  source: AuditSourceValue;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<IAuditLog>;

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorEmail: { type: String, default: null, maxlength: 254 },
    targetType: { type: String, enum: AUDIT_TARGET_TYPES, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetLabel: { type: String, default: null, maxlength: 300 },
    reason: { type: String, default: null, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: null },
    source: { type: String, enum: AUDIT_SOURCES, required: true },
    ip: { type: String, default: null, maxlength: 100 },
    userAgent: { type: String, default: null, maxlength: 512 },
    requestId: { type: String, default: null, maxlength: 100 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
// A target's history is looked up by id alone.
AuditLogSchema.index({ targetId: 1, createdAt: -1 });

const refuse = () => {
  throw new Error("Audit log records are append-only");
};
for (const operation of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] as const) {
  AuditLogSchema.pre(operation, refuse);
}
AuditLogSchema.pre("save", function guardSave() {
  if (!this.isNew) refuse();
});

export const AuditLog: Model<IAuditLog> = mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
