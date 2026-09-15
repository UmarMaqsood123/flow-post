import type { SocialPlatform } from "./brandProfile";

/**
 * Dashboard data. Served by a mock (services/dashboard/dashboardApi.ts) until
 * analytics and social integrations exist; the shape is what the API will return.
 */

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
  /** Percentage, e.g. 4.2. */
  engagementRate: MetricWithChange;
}

export interface DailyEngagement {
  /** YYYY-MM-DD */
  date: string;
  engagements: number;
}

export interface EngagementSummary {
  totals: { impressions: number; likes: number; comments: number; shares: number };
  daily: DailyEngagement[];
}

export interface DashboardPost {
  id: string;
  platform: SocialPlatform;
  caption: string;
  status: "scheduled" | "published";
  /** Scheduled time for upcoming posts, publish time for recent ones (ISO). */
  date: string;
  mediaType: "image" | "video" | "text";
  metrics: { likes: number; comments: number; shares: number } | null;
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
  /** True while the numbers are generated sample data. */
  isSample: boolean;
  stats: DashboardStats;
  engagement: EngagementSummary;
  upcomingPosts: DashboardPost[];
  recentPosts: DashboardPost[];
  recommendations: AiRecommendation[];
}

/** Development-only `?preview=` override for checking dashboard states. */
export type DashboardPreview = "loading" | "empty" | "error";
