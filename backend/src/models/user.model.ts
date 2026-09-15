import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import { UserRole, type UserRoleValue } from "../constants/auth.constant";

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRoleValue;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  emailVerificationTokenHash: string | null;
  emailVerificationExpiresAt: Date | null;
  passwordResetTokenHash: string | null;
  passwordResetExpiresAt: Date | null;
  passwordChangedAt: Date | null;
  /** Incremented to invalidate every outstanding access token for this user. */
  tokenVersion: number;
  lastLoginAt: Date | null;
  /** Last workspace the user switched to. A preference only — access is always re-checked. */
  activeWorkspace: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

/** Fields that must never leave the server. */
const SENSITIVE_FIELDS = [
  "passwordHash",
  "emailVerificationTokenHash",
  "emailVerificationExpiresAt",
  "passwordResetTokenHash",
  "passwordResetExpiresAt",
  "tokenVersion",
  "__v",
] as const;

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.USER },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    emailVerificationTokenHash: { type: String, default: null, select: false },
    emailVerificationExpiresAt: { type: Date, default: null, select: false },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },
    passwordChangedAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
    activeWorkspace: { type: Schema.Types.ObjectId, ref: "Workspace", default: null },
  },
  {
    timestamps: true,
    toJSON: {
      // Defense in depth: even if a document is serialized directly, secrets are stripped.
      transform: (_doc, ret) => {
        const output = ret as Record<string, unknown>;
        for (const field of SENSITIVE_FIELDS) delete output[field];
        return output;
      },
    },
  },
);

// Only index documents that actually hold a pending token.
UserSchema.index(
  { emailVerificationTokenHash: 1 },
  { partialFilterExpression: { emailVerificationTokenHash: { $type: "string" } } },
);
UserSchema.index(
  { passwordResetTokenHash: 1 },
  { partialFilterExpression: { passwordResetTokenHash: { $type: "string" } } },
);

export const User: Model<IUser> = mongoose.model<IUser>("User", UserSchema);

/** The only user shape returned by the API. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRoleValue;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const toPublicUser = (user: UserDocument): PublicUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
  emailVerifiedAt: user.emailVerifiedAt ?? null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
