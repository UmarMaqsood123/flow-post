/** Mirrors backend/src/services/analytics.service.ts and constants/analytics.constant.ts. */
import type { ConnectablePlatform } from "./socialAccount";

export const ANALYTICS_METRICS = [
  "impressions",
  "reach",
  "views",
  "likes",
  "comments",
  "shares",
  "clicks",
  "saves",
  "followers",
] as const;
export type AnalyticsMetric = (typeof ANALYTICS_METRICS)[number];

export type AnalyticsRange = "7d" | "30d" | "90d" | "custom";

export interface AnalyticsQuery {
  range: AnalyticsRange;
  /** ISO instants, required when range is "custom". */
  from?: string;
  to?: string;
  platform?: ConnectablePlatform[];
}

export interface FollowerGrowth {
  platform: ConnectablePlatform;
  accountName: string;
  first: number | null;
  last: number | null;
  change: number | null;
}

export interface TopPost {
  postId: string;
  platform: ConnectablePlatform;
  topic: string;
  pillar: string | null;
  publishedAt: string | null;
  url: string | null;
  engagement: number;
  metrics: Partial<Record<AnalyticsMetric, number>>;
}

export interface AnalyticsReport {
  range: { from: string; to: string };
  totals: { totals: Partial<Record<AnalyticsMetric, number>>; engagement: number };
  /** Metrics the connected platforms actually report. */
  availableMetrics: AnalyticsMetric[];
  /** Metrics no connected platform reports, shown as "not reported" rather than zero. */
  unavailableMetrics: AnalyticsMetric[];
  followerGrowth: FollowerGrowth[];
  series: { date: string; engagement: number; views: number }[];
  topPosts: TopPost[];
  bestPlatform: { platform: ConnectablePlatform; engagement: number; posts: number } | null;
  bestPillar: { pillar: string; engagement: number; posts: number } | null;
  bestTimes: { weekday: number; hour: number; engagement: number; posts: number }[];
  platformNotes: { platform: ConnectablePlatform; note: string }[];
  isEmpty: boolean;
}
