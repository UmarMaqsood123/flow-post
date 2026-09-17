import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  ANALYTICS_SCOPES,
  type AnalyticsMetric,
  type AnalyticsScopeValue,
} from "../constants/analytics.constant";
import { CREATE_PLATFORMS, type CreatePlatformValue } from "../constants/post.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

/**
 * One reading of a post's or an account's metrics at a point in time.
 *
 * Platforms report lifetime counters, not per-day figures, so a time series is
 * built by keeping a snapshot per day and comparing them. That is also how
 * follower growth is worked out: nobody exposes "followers gained", only the
 * total at the moment you ask.
 *
 * `metrics` holds the normalized numbers and only ever contains what the
 * provider actually returned. `raw` keeps the provider's own payload beside it,
 * so a metric we don't model yet isn't lost and a number can be traced back to
 * what the platform said.
 */
export interface IAnalyticsSnapshot {
  workspace: Types.ObjectId;
  socialAccount: Types.ObjectId;
  platform: CreatePlatformValue;
  scope: AnalyticsScopeValue;
  /** The post these metrics belong to; null for account-level snapshots. */
  post: Types.ObjectId | null;
  /** The platform's own id for the post, as stored on the schedule result. */
  providerPostId: string | null;
  /** Normalized metrics. A metric the platform doesn't report is simply absent. */
  metrics: Partial<Record<AnalyticsMetric, number>>;
  /** The provider's untouched response, for tracing and for metrics we don't model. */
  raw: Record<string, unknown>;
  capturedAt: Date;
  /** `YYYY-MM-DD` in UTC, so one entity keeps one snapshot per day. */
  capturedOn: string;
  /** The window the provider's numbers cover, when it says. */
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AnalyticsSnapshotDocument = HydratedDocument<IAnalyticsSnapshot>;

const AnalyticsSnapshotSchema = new Schema<IAnalyticsSnapshot>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    socialAccount: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    platform: { type: String, enum: CREATE_PLATFORMS, required: true },
    scope: { type: String, enum: ANALYTICS_SCOPES, required: true },
    post: { type: Schema.Types.ObjectId, ref: "Post", default: null },
    providerPostId: { type: String, default: null, maxlength: 256 },
    metrics: { type: Schema.Types.Map, of: Number, default: {} },
    raw: { type: Schema.Types.Mixed, default: {} },
    capturedAt: { type: Date, required: true },
    capturedOn: { type: String, required: true, maxlength: 10 },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

// One snapshot per entity per day: re-collecting the same day updates in place
// rather than piling up readings that would double-count in a trend.
AnalyticsSnapshotSchema.index(
  { workspace: 1, socialAccount: 1, scope: 1, providerPostId: 1, capturedOn: 1 },
  { unique: true },
);
// The dashboard and analytics page both read a workspace over a date range.
AnalyticsSnapshotSchema.index({ workspace: 1, capturedAt: -1 });
AnalyticsSnapshotSchema.index({ workspace: 1, post: 1, capturedAt: -1 });
AnalyticsSnapshotSchema.index({ workspace: 1, platform: 1, scope: 1, capturedAt: -1 });

AnalyticsSnapshotSchema.plugin(workspaceScopedPlugin);

export const AnalyticsSnapshot: Model<IAnalyticsSnapshot> = mongoose.model<IAnalyticsSnapshot>(
  "AnalyticsSnapshot",
  AnalyticsSnapshotSchema,
);
