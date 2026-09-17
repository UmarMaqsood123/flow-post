import type { AnalyticsMetric } from "./analytics";
import type { ConnectablePlatform } from "./socialAccount";

/** Mirrors the dashboard summary in backend/src/services/analytics.service.ts. */

export interface MetricWithChange {
  value: number;
  /** Same metric for the previous period (last month), for the trend. */
  previous: number;
}

export interface DashboardStats {
  connectedAccounts: number;
  postsThisMonth: MetricWithChange;
  scheduledPosts: number;
  publishedPosts: MetricWithChange;
  /** Total engagement over the last 30 days, against the 30 before it. */
  engagement: MetricWithChange;
}

export interface DailyEngagement {
  /** YYYY-MM-DD */
  date: string;
  engagement: number;
}

export interface EngagementSummary {
  /** Only the metrics the connected platforms actually report. */
  totals: Partial<Record<AnalyticsMetric, number>>;
  daily: DailyEngagement[];
}

export interface UpcomingPost {
  id: string;
  platform: ConnectablePlatform;
  topic: string;
  scheduledAt: string;
}

export interface RecentPost {
  id: string;
  platform: ConnectablePlatform;
  topic: string;
  publishedAt: string | null;
  url: string | null;
  /** Null when metrics haven't been collected for this post yet. */
  engagement: number | null;
}

export type RecommendationKind = "profile" | "connect" | "best_time" | "content_idea" | "hashtags";

export interface AiRecommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  description: string;
  actionLabel: string;
  actionTo: string;
}

export interface DashboardSummary {
  stats: DashboardStats;
  engagement: EngagementSummary;
  upcomingPosts: UpcomingPost[];
  recentPosts: RecentPost[];
  /** Metrics the connected platforms report, so widgets can hide the rest. */
  availableMetrics: AnalyticsMetric[];
  /** True when no metrics have been collected yet. */
  awaitingMetrics: boolean;
}
