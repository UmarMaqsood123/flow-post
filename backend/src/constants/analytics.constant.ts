import type { CreatePlatformValue } from "./post.constant";

/**
 * The normalized metrics. Every platform reports a different subset, so a metric
 * is either a real number from the provider or absent — never a zero standing in
 * for "we don't know", and never derived from a different metric.
 */
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

/** Engagement is the sum of these, counting only the ones a platform reports. */
export const ENGAGEMENT_METRICS: AnalyticsMetric[] = ["likes", "comments", "shares", "saves"];

export const AnalyticsScope = {
  /** Metrics for one published post. */
  POST: "POST",
  /** Metrics for the account itself, e.g. follower count. */
  ACCOUNT: "ACCOUNT",
} as const;
export type AnalyticsScopeValue = (typeof AnalyticsScope)[keyof typeof AnalyticsScope];
export const ANALYTICS_SCOPES = Object.values(AnalyticsScope);

/**
 * What each platform actually reports, taken from the current provider docs.
 * The UI reads this to say "not reported by X" instead of showing a zero.
 *
 * Notably **impressions is empty everywhere**. Meta replaced `post_impressions`
 * with a views metric in November 2025 and dropped Instagram's media-level
 * `impressions` for anything created after July 2024; YouTube has never exposed
 * impressions outside Studio; TikTok reports none. LinkedIn is the only platform
 * that still has it, and its analytics need partner approval we can't get.
 */
export const PLATFORM_METRICS: Record<CreatePlatformValue, readonly AnalyticsMetric[]> = {
  // Data API v3: videos.list statistics + channels.list statistics.
  YOUTUBE: ["views", "likes", "comments", "followers"],
  // Page and post insights. `post_media_view` is the views metric.
  FACEBOOK: ["views", "reach", "likes", "comments", "shares", "clicks", "followers"],
  // Media and account insights.
  INSTAGRAM: ["views", "reach", "likes", "comments", "shares", "saves", "followers"],
  // Display API video list: four lifetime counters, plus account follower count.
  TIKTOK: ["views", "likes", "comments", "shares", "followers"],
  // Nothing: member post analytics need LinkedIn's Community Management API.
  LINKEDIN: [],
};

/** Platforms whose analytics we can collect at all. */
export const ANALYTICS_PLATFORMS = (Object.keys(PLATFORM_METRICS) as CreatePlatformValue[]).filter(
  (platform) => PLATFORM_METRICS[platform].length > 0,
);

/** Why a platform reports nothing, shown instead of an empty panel. */
export const PLATFORM_ANALYTICS_NOTES: Partial<Record<CreatePlatformValue, string>> = {
  LINKEDIN:
    "LinkedIn only exposes post analytics through its Community Management API, which needs LinkedIn's approval.",
};

export const ANALYTICS_RANGES = ["7d", "30d", "90d", "custom"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const RANGE_DAYS: Record<Exclude<AnalyticsRange, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** A custom range can't be longer than this, to keep aggregation bounded. */
export const MAX_RANGE_DAYS = 365;

/**
 * How often an account's metrics are collected. Platform numbers update on their
 * own schedule (Meta refreshes roughly daily and can lag 48 hours), so anything
 * more frequent spends rate limit without producing new data.
 */
export const COLLECTION_INTERVAL_HOURS = 6;

/** Posts stop being collected once they're this old and their counters have settled. */
export const POST_COLLECTION_WINDOW_DAYS = 90;
