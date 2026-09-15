import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import { WORKSPACE_ROLES, type WorkspaceRoleValue } from "../constants/workspace.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

export interface IWorkspaceMember {
  workspace: Types.ObjectId;
  user: Types.ObjectId;
  role: WorkspaceRoleValue;
  invitedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkspaceMemberDocument = HydratedDocument<IWorkspaceMember>;

const WorkspaceMemberSchema = new Schema<IWorkspaceMember>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: WORKSPACE_ROLES, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// One membership per user per workspace; also the lookup index for authorization checks.
WorkspaceMemberSchema.index({ workspace: 1, user: 1 }, { unique: true });
WorkspaceMemberSchema.index({ user: 1 });
WorkspaceMemberSchema.index({ workspace: 1, role: 1 });

WorkspaceMemberSchema.plugin(workspaceScopedPlugin);

export const WorkspaceMember: Model<IWorkspaceMember> = mongoose.model<IWorkspaceMember>(
  "WorkspaceMember",
  WorkspaceMemberSchema,
);
