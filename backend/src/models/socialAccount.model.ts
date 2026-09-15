import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  SOCIAL_ACCOUNT_STATUSES,
  SOCIAL_PLATFORMS,
  SocialAccountStatus,
  type SocialAccountStatusValue,
  type SocialPlatformValue,
} from "../constants/social.constant";
import type { SocialCapability } from "../integrations/social/capabilities";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

export interface SocialAccountError {
  code: string;
  message: string;
  occurredAt: Date;
}

/** A social profile, page or channel connected to a workspace. */
export interface ISocialAccount {
  workspace: Types.ObjectId;
  platform: SocialPlatformValue;
  /** The account's id on the platform. */
  providerAccountId: string;
  accountName: string;
  username: string | null;
  profileImage: string | null;
  /** AES-256-GCM ciphertext (utils/encryption.util.ts). Never selected by default, never serialized. */
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scopes: string[];
  status: SocialAccountStatusValue;
  /** Non-secret platform details. Not returned by the API. */
  metadata: Record<string, unknown>;
  connectedBy: Types.ObjectId;
  lastConnectedAt: Date;
  lastRefreshedAt: Date | null;
  /** Last successful connection test. */
  lastCheckedAt: Date | null;
  disconnectedAt: Date | null;
  lastError: SocialAccountError | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SocialAccountDocument = HydratedDocument<ISocialAccount>;

const SocialAccountErrorSchema = new Schema<SocialAccountError>(
  {
    code: { type: String, required: true, maxlength: 100 },
    message: { type: String, required: true, maxlength: 500 },
    occurredAt: { type: Date, required: true },
  },
  { _id: false },
);

const SocialAccountSchema = new Schema<ISocialAccount>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    platform: { type: String, enum: SOCIAL_PLATFORMS, required: true },
    providerAccountId: { type: String, required: true, maxlength: 256 },
    accountName: { type: String, required: true, maxlength: 256 },
    username: { type: String, default: null, maxlength: 256 },
    profileImage: { type: String, default: null, maxlength: 2048 },
    encryptedAccessToken: { type: String, default: null, select: false },
    encryptedRefreshToken: { type: String, default: null, select: false },
    tokenExpiresAt: { type: Date, default: null },
    refreshTokenExpiresAt: { type: Date, default: null },
    scopes: { type: [String], default: [] },
    status: {
      type: String,
      enum: SOCIAL_ACCOUNT_STATUSES,
      default: SocialAccountStatus.CONNECTED,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    connectedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastConnectedAt: { type: Date, required: true },
    lastRefreshedAt: { type: Date, default: null },
    lastCheckedAt: { type: Date, default: null },
    disconnectedAt: { type: Date, default: null },
    lastError: { type: SocialAccountErrorSchema, default: null },
  },
  {
    timestamps: true,
    minimize: false,
    toJSON: {
      // Defense in depth: even an explicitly selected document never serializes tokens.
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.encryptedAccessToken;
        delete ret.encryptedRefreshToken;
        return ret;
      },
    },
  },
);

// One record per platform account per workspace; reconnecting updates it.
SocialAccountSchema.index({ workspace: 1, platform: 1, providerAccountId: 1 }, { unique: true });
SocialAccountSchema.index({ workspace: 1, status: 1 });

SocialAccountSchema.plugin(workspaceScopedPlugin);

export const SocialAccount: Model<ISocialAccount> = mongoose.model<ISocialAccount>(
  "SocialAccount",
  SocialAccountSchema,
);

/** API shape. Deliberately built field by field so tokens and metadata can't leak. */
export interface PublicSocialAccount {
  id: string;
  workspaceId: string;
  platform: SocialPlatformValue;
  providerAccountId: string;
  accountName: string;
  username: string | null;
  profileImage: string | null;
  status: SocialAccountStatusValue;
  scopes: string[];
  capabilities: SocialCapability[];
  tokenExpiresAt: Date | null;
  lastConnectedAt: Date;
  lastRefreshedAt: Date | null;
  lastCheckedAt: Date | null;
  lastError: SocialAccountError | null;
  createdAt: Date;
  updatedAt: Date;
}

export const toPublicSocialAccount = (
  account: SocialAccountDocument,
  capabilities: SocialCapability[],
): PublicSocialAccount => ({
  id: account._id.toString(),
  workspaceId: account.workspace.toString(),
  platform: account.platform,
  providerAccountId: account.providerAccountId,
  accountName: account.accountName,
  username: account.username ?? null,
  profileImage: account.profileImage ?? null,
  status: account.status,
  scopes: [...account.scopes],
  capabilities,
  tokenExpiresAt: account.tokenExpiresAt ?? null,
  lastConnectedAt: account.lastConnectedAt,
  lastRefreshedAt: account.lastRefreshedAt ?? null,
  lastCheckedAt: account.lastCheckedAt ?? null,
  lastError: account.lastError
    ? {
        code: account.lastError.code,
        message: account.lastError.message,
        occurredAt: account.lastError.occurredAt,
      }
    : null,
  createdAt: account.createdAt,
  updatedAt: account.updatedAt,
});
