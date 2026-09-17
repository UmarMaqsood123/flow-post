/** What a calculated fact groups posts by. */
export const INSIGHT_CATEGORIES = [
  "PILLAR",
  "TOPIC",
  "PLATFORM",
  "WEEKDAY",
  "TIME_OF_DAY",
  "FORMAT",
  "HOOK",
  "CTA",
] as const;
export type InsightCategoryValue = (typeof INSIGHT_CATEGORIES)[number];

export const INSIGHT_CATEGORY_LABELS: Record<InsightCategoryValue, string> = {
  PILLAR: "Content pillars",
  TOPIC: "Topics",
  PLATFORM: "Platforms",
  WEEKDAY: "Posting days",
  TIME_OF_DAY: "Posting times",
  FORMAT: "Content formats",
  HOOK: "Hook patterns",
  CTA: "Calls to action",
};

/**
 * How much a group's numbers can be trusted, from how many posts are behind them.
 * Recommendations are never built on LOW alone.
 */
export const FACT_CONFIDENCE = ["HIGH", "MEDIUM", "LOW"] as const;
export type FactConfidenceValue = (typeof FACT_CONFIDENCE)[number];
export const CONFIDENCE_MIN_POSTS = { HIGH: 5, MEDIUM: 3 } as const;

export const INSIGHT_STATUSES = ["PENDING", "APPROVED", "DISMISSED"] as const;
export type InsightStatusValue = (typeof INSIGHT_STATUSES)[number];

export const REPORT_STATUSES = ["READY", "INSUFFICIENT_DATA"] as const;
export type ReportStatusValue = (typeof REPORT_STATUSES)[number];

/** Published posts with metrics needed before a report is worth writing. */
export const MIN_POSTS_FOR_INSIGHTS = 5;
/** How far back a report looks. */
export const INSIGHTS_LOOKBACK_DAYS = 90;
/** Most insights the AI may return in one report. */
export const MAX_INSIGHTS_PER_REPORT = 8;
/** Approved insights passed into generation, newest first. */
export const MAX_APPROVED_INSIGHTS_IN_PROMPT = 8;

/** Time-of-day buckets, in the workspace's own time zone. Sparse data makes single hours noise. */
export const TIME_OF_DAY_BUCKETS = [
  { key: "EARLY_MORNING", label: "Early morning (5:00 to 9:00)", from: 5, to: 9 },
  { key: "MORNING", label: "Morning (9:00 to 12:00)", from: 9, to: 12 },
  { key: "AFTERNOON", label: "Afternoon (12:00 to 17:00)", from: 12, to: 17 },
  { key: "EVENING", label: "Evening (17:00 to 21:00)", from: 17, to: 21 },
  { key: "NIGHT", label: "Night (21:00 to 5:00)", from: 21, to: 5 },
] as const;

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const FORMAT_LABELS = {
  TEXT: "Text only",
  IMAGE: "Single image",
  CAROUSEL: "Carousel",
  VIDEO: "Video",
  SHORT_VIDEO: "Short video",
} as const;
export type ContentFormatValue = keyof typeof FORMAT_LABELS;

export const HOOK_PATTERN_LABELS = {
  QUESTION: "Opens with a question",
  HOW_TO: "Opens with how-to",
  NUMBER: "Opens with a number or list",
  CONTRARIAN: "Opens by challenging a belief",
  STATEMENT: "Opens with a plain statement",
} as const;
export type HookPatternValue = keyof typeof HOOK_PATTERN_LABELS;

export const CTA_TYPE_LABELS = {
  COMMENT: "Asks for comments or replies",
  LINK: "Sends people to a link or shop",
  FOLLOW: "Asks to follow, share or save",
  OTHER: "Another call to action",
  NONE: "No call to action",
} as const;
export type CtaTypeValue = keyof typeof CTA_TYPE_LABELS;
