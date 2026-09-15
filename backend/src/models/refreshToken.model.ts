import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  RefreshTokenRevokeReason,
  type RefreshTokenRevokeReasonValue,
} from "../constants/auth.constant";

export interface IRefreshToken {
  user: Types.ObjectId;
  /** SHA-256 of the opaque token — the raw token is never stored. */
  tokenHash: string;
  /** Shared by every token rotated from the same login; revoked together on reuse. */
  family: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: RefreshTokenRevokeReasonValue | null;
  replacedBy: Types.ObjectId | null;
  createdByIp: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RefreshTokenDocument = HydratedDocument<IRefreshToken>;

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: [...Object.values(RefreshTokenRevokeReason), null],
      default: null,
    },
    replacedBy: { type: Schema.Types.ObjectId, ref: "RefreshToken", default: null },
    createdByIp: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 512 },
  },
  { timestamps: true },
);

// MongoDB deletes tokens once expired. Revoked tokens are kept until then so reuse is detectable.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken: Model<IRefreshToken> = mongoose.model<IRefreshToken>(
  "RefreshToken",
  RefreshTokenSchema,
);
