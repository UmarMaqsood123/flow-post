import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import { SOCIAL_PLATFORMS, type SocialPlatformValue } from "../constants/social.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

/**
 * A pending OAuth authorization. The `state` sent to the platform and the
 * browser-binding cookie value are stored only as SHA-256 hashes. A state is
 * single-use, expires quickly, and belongs to the user, workspace and platform
 * that started the flow.
 */
export interface ISocialOAuthState {
  workspace: Types.ObjectId;
  user: Types.ObjectId;
  platform: SocialPlatformValue;
  stateHash: string;
  /** Hash of the httpOnly cookie set when the flow started; the callback must present it. */
  bindingHash: string;
  redirectUri: string;
  /** PKCE verifier, encrypted. */
  encryptedCodeVerifier: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SocialOAuthStateDocument = HydratedDocument<ISocialOAuthState>;

const SocialOAuthStateSchema = new Schema<ISocialOAuthState>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    platform: { type: String, enum: SOCIAL_PLATFORMS, required: true },
    stateHash: { type: String, required: true, unique: true },
    bindingHash: { type: String, required: true, select: false },
    redirectUri: { type: String, required: true, maxlength: 2048 },
    encryptedCodeVerifier: { type: String, default: null, select: false },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// MongoDB removes expired states automatically.
SocialOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

SocialOAuthStateSchema.plugin(workspaceScopedPlugin);

export const SocialOAuthState: Model<ISocialOAuthState> = mongoose.model<ISocialOAuthState>(
  "SocialOAuthState",
  SocialOAuthStateSchema,
);
