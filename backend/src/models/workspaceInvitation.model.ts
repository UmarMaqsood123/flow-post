import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  INVITABLE_ROLES,
  InvitationStatus,
  type InvitationStatusValue,
} from "../constants/workspace.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

export interface IWorkspaceInvitation {
  workspace: Types.ObjectId;
  email: string;
  role: (typeof INVITABLE_ROLES)[number];
  /** SHA-256 of the emailed token — the raw token is never stored. */
  tokenHash: string;
  invitedBy: Types.ObjectId;
  status: InvitationStatusValue;
  expiresAt: Date;
  acceptedBy: Types.ObjectId | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkspaceInvitationDocument = HydratedDocument<IWorkspaceInvitation>;

const WorkspaceInvitationSchema = new Schema<IWorkspaceInvitation>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    role: { type: String, enum: INVITABLE_ROLES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: Object.values(InvitationStatus),
      default: InvitationStatus.PENDING,
    },
    expiresAt: { type: Date, required: true },
    acceptedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    acceptedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// At most one pending invitation per email per workspace.
WorkspaceInvitationSchema.index(
  { workspace: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: InvitationStatus.PENDING } },
);
WorkspaceInvitationSchema.index({ workspace: 1, status: 1 });

WorkspaceInvitationSchema.plugin(workspaceScopedPlugin);

export const WorkspaceInvitation: Model<IWorkspaceInvitation> =
  mongoose.model<IWorkspaceInvitation>("WorkspaceInvitation", WorkspaceInvitationSchema);
