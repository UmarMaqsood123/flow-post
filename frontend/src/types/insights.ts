/** Mirrors backend/src/services/performanceInsights.service.ts and constants/insights.constant.ts. */
export type InsightCategory =
  "PILLAR" | "TOPIC" | "PLATFORM" | "WEEKDAY" | "TIME_OF_DAY" | "FORMAT" | "HOOK" | "CTA";

export const INSIGHT_CATEGORY_LABELS: Record<InsightCategory, string> = {
  PILLAR: "Content pillars",
  TOPIC: "Topics",
  PLATFORM: "Platforms",
  WEEKDAY: "Posting days",
  TIME_OF_DAY: "Posting times",
  FORMAT: "Content formats",
  HOOK: "Hook patterns",
  CTA: "Calls to action",
};

export type FactConfidence = "HIGH" | "MEDIUM" | "LOW";
export type InsightStatus = "PENDING" | "APPROVED" | "DISMISSED";

/** Calculated in code from collected metrics. Never written by the AI. */
export interface PerformanceFact {
  id: string;
  category: InsightCategory;
  key: string;
  label: string;
  posts: number;
  totalEngagement: number;
  avgEngagement: number;
  avgViews: number | null;
  engagementRate: number | null;
  liftVsAverage: number | null;
  confidence: FactConfidence;
}

/** The AI's reading of the cited facts. Contains no numbers of its own. */
export interface PerformanceInsight {
  id: string;
  category: InsightCategory;
  title: string;
  interpretation: string;
  recommendation: string;
  factIds: string[];
  status: InsightStatus;
  decidedAt: string | null;
}

export interface InsightReport {
  id: string;
  weekStart: string;
  periodStart: string;
  periodEnd: string;
  status: "READY" | "INSUFFICIENT_DATA";
  postsAnalyzed: number;
  minPostsNeeded: number;
  baseline: { avgEngagement: number; avgViews: number | null };
  facts: PerformanceFact[];
  insights: PerformanceInsight[];
  generation: { provider: string; model: string; promptVersion: string } | null;
  aiError: string | null;
  rejectedInsights: number;
  automatic: boolean;
  createdAt: string;
}

export interface InsightReportSummary {
  id: string;
  weekStart: string;
  status: InsightReport["status"];
  postsAnalyzed: number;
  insights: number;
  approved: number;
  automatic: boolean;
  createdAt: string;
}

export interface ApprovedInsight {
  reportId: string;
  id: string;
  category: InsightCategory;
  title: string;
  recommendation: string;
  decidedAt: string | null;
}

export interface InsightsOverview {
  latest: InsightReport | null;
  reports: InsightReportSummary[];
  approved: ApprovedInsight[];
}
