import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import { SOCIAL_PLATFORMS, type SocialPlatformValue } from "../constants/social.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

/**
 * A finished authorization waiting for the user to say which account to connect.
 *
 * One Facebook login usually covers several Pages, so the OAuth callback can't
 * know which one the user meant. The token it obtained is held here, encrypted
 * and short-lived, until they choose; then the account is created and this is
 * deleted. Nothing here is ever returned to the browser except the candidates.
 */
export interface ISocialConnectionDraft {
  workspace: Types.ObjectId;
  user: Types.ObjectId;
  platform: SocialPlatformValue;
  /** The user access token from the callback, encrypted at rest. */
  encryptedAccessToken: string;
  /** Kept for platforms whose chosen account uses the login's own token (LinkedIn Pages). */
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scopes: string[];
  /** Accounts the authorization could connect, as shown in the picker. */
  targets: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    description: string | null;
  }[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SocialConnectionDraftDocument = HydratedDocument<ISocialConnectionDraft>;

const TargetSchema = new Schema<ISocialConnectionDraft["targets"][number]>(
  {
    id: { type: String, required: true, maxlength: 256 },
    name: { type: String, required: true, maxlength: 256 },
    username: { type: String, default: null, maxlength: 256 },
    image: { type: String, default: null, maxlength: 2048 },
    description: { type: String, default: null, maxlength: 256 },
  },
  { _id: false },
);

const SocialConnectionDraftSchema = new Schema<ISocialConnectionDraft>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    platform: { type: String, enum: SOCIAL_PLATFORMS, required: true },
    encryptedAccessToken: { type: String, required: true, select: false },
    encryptedRefreshToken: { type: String, default: null, select: false },
    tokenExpiresAt: { type: Date, default: null },
    refreshTokenExpiresAt: { type: Date, default: null },
    scopes: { type: [String], default: [] },
    targets: { type: [TargetSchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// MongoDB removes drafts the user never finished.
SocialConnectionDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

SocialConnectionDraftSchema.plugin(workspaceScopedPlugin);

export const SocialConnectionDraft: Model<ISocialConnectionDraft> =
  mongoose.model<ISocialConnectionDraft>("SocialConnectionDraft", SocialConnectionDraftSchema);
