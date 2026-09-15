export const ContentStrategyStatus = {
  /** Generated or edited, not in use yet. */
  DRAFT: "DRAFT",
  /** The strategy the workspace follows. At most one per workspace. */
  ACTIVE: "ACTIVE",
  /** Previously active. Read-only, but can be activated again. */
  ARCHIVED: "ARCHIVED",
} as const;
export type ContentStrategyStatusValue =
  (typeof ContentStrategyStatus)[keyof typeof ContentStrategyStatus];
export const CONTENT_STRATEGY_STATUSES = Object.values(ContentStrategyStatus);

export const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
export type WeekdayValue = (typeof WEEKDAYS)[number];

/** Sections of a strategy, in display order. */
export const STRATEGY_SECTIONS = [
  "audienceAnalysis",
  "contentPillars",
  "recommendedTopics",
  "platformStrategy",
  "brandTone",
  "ctaStrategy",
  "postingFrequency",
  "contentFormats",
  "hashtagApproach",
] as const;
export type StrategySectionValue = (typeof STRATEGY_SECTIONS)[number];

export const CONTENT_STRATEGY_LIMITS = {
  name: 120,
  instructions: 500,
  /** Section summaries. */
  summary: 2000,
  /** Descriptions and other short paragraphs. */
  text: 1000,
  /** Names and short labels. */
  label: 120,
  /** List items such as pain points, do's and CTA text. */
  item: 300,
  hashtag: 60,
  /** Items in simple lists (pain points, do's, guidelines…). */
  items: 10,
  segments: 6,
  pillars: 8,
  topics: 30,
  platforms: 8,
  ctas: 12,
  formats: 7,
  hashtags: 20,
  postsPerWeek: 100,
  hashtagsPerPost: 30,
} as const;
