export const AI_OPERATIONS = [
  "CONTENT_STRATEGY",
  "CONTENT_IDEAS",
  "GENERATE_POST",
  "REWRITE_POST",
  "HASHTAGS",
  "HOOK",
  "CTA",
  "ADAPT_FOR_PLATFORM",
  "CREATE_POSTS",
  "REFINE_POST",
  "PERFORMANCE_INSIGHTS",
  "AUTOPILOT_TOPIC",
] as const;
export type AIOperationValue = (typeof AI_OPERATIONS)[number];

export const POST_FORMATS = [
  "TEXT",
  "IMAGE",
  "CAROUSEL",
  "VIDEO",
  "SHORT_VIDEO",
  "POLL",
  "ARTICLE",
] as const;
export type PostFormatValue = (typeof POST_FORMATS)[number];

export const HOOK_STYLES = [
  "QUESTION",
  "BOLD_STATEMENT",
  "STORY",
  "HOW_TO",
  "CONTRARIAN",
  "CURIOSITY",
] as const;

export const HASHTAG_CATEGORIES = ["BROAD", "NICHE", "BRANDED", "LOCATION"] as const;

export const STRATEGY_TIMEFRAMES = ["WEEK", "MONTH", "QUARTER"] as const;
export type StrategyTimeframeValue = (typeof STRATEGY_TIMEFRAMES)[number];

export const POST_LENGTHS = ["SHORT", "MEDIUM", "LONG"] as const;
export type PostLengthValue = (typeof POST_LENGTHS)[number];

export const REWRITE_LENGTHS = ["SHORTER", "SAME", "LONGER"] as const;
export type RewriteLengthValue = (typeof REWRITE_LENGTHS)[number];

export const AIUsageStatus = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
} as const;
export type AIUsageStatusValue = (typeof AIUsageStatus)[keyof typeof AIUsageStatus];
