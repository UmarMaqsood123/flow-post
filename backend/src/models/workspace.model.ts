import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  WORKSPACE_INDUSTRIES,
  WorkspaceStatus,
  type WorkspaceStatusValue,
} from "../constants/workspace.constant";

export interface IWorkspace {
  name: string;
  logo: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  /** IANA time zone used for scheduling, e.g. "America/New_York". */
  timezone: string;
  /**
   * Whose subscription covers this workspace. Starts as the creator and moves to
   * another owner if the billing owner stops being one.
   */
  billingOwner: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  status: WorkspaceStatusValue;
  archivedAt: Date | null;
  archivedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkspaceDocument = HydratedDocument<IWorkspace>;

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    logo: { type: String, default: null, maxlength: 2048 },
    website: { type: String, default: null, maxlength: 2048 },
    industry: { type: String, enum: [...WORKSPACE_INDUSTRIES, null], default: null },
    description: { type: String, default: null, maxlength: 500 },
    timezone: { type: String, required: true, default: "UTC" },
    billingOwner: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: Object.values(WorkspaceStatus),
      default: WorkspaceStatus.ACTIVE,
    },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Admin lists and the active-workspace checks in background sweeps.
WorkspaceSchema.index({ status: 1, createdAt: -1 });

export const Workspace: Model<IWorkspace> = mongoose.model<IWorkspace>(
  "Workspace",
  WorkspaceSchema,
);

export interface PublicWorkspace {
  id: string;
  name: string;
  logo: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  timezone: string;
  status: WorkspaceStatusValue;
  createdBy: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const toPublicWorkspace = (workspace: WorkspaceDocument): PublicWorkspace => ({
  id: workspace._id.toString(),
  name: workspace.name,
  logo: workspace.logo ?? null,
  website: workspace.website ?? null,
  industry: workspace.industry ?? null,
  description: workspace.description ?? null,
  timezone: workspace.timezone,
  status: workspace.status,
  createdBy: workspace.createdBy.toString(),
  archivedAt: workspace.archivedAt ?? null,
  createdAt: workspace.createdAt,
  updatedAt: workspace.updatedAt,
});
