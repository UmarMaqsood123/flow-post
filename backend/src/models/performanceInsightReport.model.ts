import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  FACT_CONFIDENCE,
  type FactConfidenceValue,
  INSIGHT_CATEGORIES,
  INSIGHT_STATUSES,
  type InsightCategoryValue,
  type InsightStatusValue,
  REPORT_STATUSES,
  type ReportStatusValue,
} from "../constants/insights.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

/**
 * One calculated result: a group of posts and how they performed. Every number
 * here comes from collected analytics, computed in code. None of it is written
 * by the AI.
 */
export interface IPerformanceFact {
  /** Stable within a report, e.g. "PILLAR:brewing". The AI cites these. */
  id: string;
  category: InsightCategoryValue;
  key: string;
  label: string;
  posts: number;
  totalEngagement: number;
  avgEngagement: number;
  /** Average views over the posts whose platform reports views; null when none do. */
  avgViews: number | null;
  /** Engagement divided by views, over posts that report views; null when none do. */
  engagementRate: number | null;
  /** This group's average engagement divided by the workspace average. */
  liftVsAverage: number | null;
  confidence: FactConfidenceValue;
}

/**
 * The AI's reading of the facts. It cites fact ids and carries no numbers of its
 * own: any text containing a digit is rejected before it's stored, so the only
 * figures a person sees are the calculated ones beside it.
 */
export interface IPerformanceInsight {
  _id: Types.ObjectId;
  category: InsightCategoryValue;
  title: string;
  interpretation: string;
  recommendation: string;
  factIds: string[];
  status: InsightStatusValue;
  decidedBy: Types.ObjectId | null;
  decidedAt: Date | null;
}

export interface IPerformanceInsightReport {
  workspace: Types.ObjectId;
  /** Monday of the report's week, `YYYY-MM-DD` in the workspace time zone. */
  weekStart: string;
  periodStart: Date;
  periodEnd: Date;
  status: ReportStatusValue;
  postsAnalyzed: number;
  baseline: { avgEngagement: number; avgViews: number | null };
  facts: IPerformanceFact[];
  insights: IPerformanceInsight[];
  /** Null when the AI wasn't called (not enough data) or wasn't available. */
  generation: { provider: string; model: string; promptVersion: string } | null;
  /** Why no insights were written, when the calculation still succeeded. */
  aiError: string | null;
  /** Insights the AI returned that broke the rules and were thrown away. */
  rejectedInsights: number;
  /** Null for the automatic weekly run. */
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PerformanceInsightReportDocument = HydratedDocument<IPerformanceInsightReport>;

const FactSchema = new Schema<IPerformanceFact>(
  {
    id: { type: String, required: true, maxlength: 200 },
    category: { type: String, enum: INSIGHT_CATEGORIES, required: true },
    key: { type: String, required: true, maxlength: 200 },
    label: { type: String, required: true, maxlength: 300 },
    posts: { type: Number, required: true, min: 0 },
    totalEngagement: { type: Number, required: true, min: 0 },
    avgEngagement: { type: Number, required: true, min: 0 },
    avgViews: { type: Number, default: null },
    engagementRate: { type: Number, default: null },
    liftVsAverage: { type: Number, default: null },
    confidence: { type: String, enum: FACT_CONFIDENCE, required: true },
  },
  { _id: false },
);

const InsightSchema = new Schema<IPerformanceInsight>({
  category: { type: String, enum: INSIGHT_CATEGORIES, required: true },
  title: { type: String, required: true, maxlength: 120 },
  interpretation: { type: String, required: true, maxlength: 600 },
  recommendation: { type: String, required: true, maxlength: 400 },
  factIds: { type: [String], default: [] },
  status: { type: String, enum: INSIGHT_STATUSES, default: "PENDING" },
  decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  decidedAt: { type: Date, default: null },
});

const ReportSchema = new Schema<IPerformanceInsightReport>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    weekStart: { type: String, required: true, maxlength: 10 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: { type: String, enum: REPORT_STATUSES, required: true },
    postsAnalyzed: { type: Number, required: true, min: 0 },
    baseline: {
      avgEngagement: { type: Number, required: true, min: 0 },
      avgViews: { type: Number, default: null },
    },
    facts: { type: [FactSchema], default: [] },
    insights: { type: [InsightSchema], default: [] },
    generation: {
      type: new Schema(
        {
          provider: { type: String, required: true },
          model: { type: String, required: true },
          promptVersion: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    aiError: { type: String, default: null, maxlength: 300 },
    rejectedInsights: { type: Number, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

ReportSchema.index({ workspace: 1, createdAt: -1 });
// The weekly sweep looks for this week's report before writing one.
ReportSchema.index({ workspace: 1, weekStart: 1 });
// At most one automatic report per workspace per week, even with several workers.
ReportSchema.index(
  { workspace: 1, weekStart: 1 },
  {
    unique: true,
    partialFilterExpression: { createdBy: { $type: "null" } },
    name: "one_automatic_report_per_week",
  },
);
// Approved insights are read on every post generation.
ReportSchema.index({ workspace: 1, "insights.status": 1, "insights.decidedAt": -1 });

ReportSchema.plugin(workspaceScopedPlugin);

export const PerformanceInsightReport: Model<IPerformanceInsightReport> =
  mongoose.model<IPerformanceInsightReport>("PerformanceInsightReport", ReportSchema);
