import type {
  ContentStrategyStatus,
  PostFormat,
  StrategySectionKey,
  StrategyTimeframe,
  Weekday,
} from "@/types/contentStrategy";
import type { ChoiceOption } from "./brandProfile";

export const STRATEGY_SECTION_DETAILS: Record<
  StrategySectionKey,
  { title: string; description: string }
> = {
  audienceAnalysis: {
    title: "Audience analysis",
    description: "Who you're talking to and what they need from you.",
  },
  contentPillars: {
    title: "Content pillars",
    description: "The recurring themes your content is built on.",
  },
  recommendedTopics: {
    title: "Recommended topics",
    description: "Specific post ideas, each tied to a pillar.",
  },
  platformStrategy: {
    title: "Platform strategy",
    description: "The role each platform plays and what to post there.",
  },
  brandTone: { title: "Brand tone", description: "How your posts should sound." },
  ctaStrategy: {
    title: "CTA strategy",
    description: "What you ask people to do, and where.",
  },
  postingFrequency: {
    title: "Posting frequency",
    description: "How often to post on each platform.",
  },
  contentFormats: { title: "Content formats", description: "The mix of post types to use." },
  hashtagApproach: {
    title: "Hashtag approach",
    description: "How to use hashtags so the right people find you.",
  },
};

/** Section order on the strategy page. */
export const STRATEGY_SECTION_ORDER = Object.keys(STRATEGY_SECTION_DETAILS) as StrategySectionKey[];

export const POST_FORMAT_OPTIONS: ChoiceOption<PostFormat>[] = [
  { value: "TEXT", label: "Text" },
  { value: "IMAGE", label: "Image" },
  { value: "CAROUSEL", label: "Carousel" },
  { value: "VIDEO", label: "Video" },
  { value: "SHORT_VIDEO", label: "Short video" },
  { value: "POLL", label: "Poll" },
  { value: "ARTICLE", label: "Article" },
];

export const WEEKDAY_OPTIONS: ChoiceOption<Weekday>[] = [
  { value: "MONDAY", label: "Mon" },
  { value: "TUESDAY", label: "Tue" },
  { value: "WEDNESDAY", label: "Wed" },
  { value: "THURSDAY", label: "Thu" },
  { value: "FRIDAY", label: "Fri" },
  { value: "SATURDAY", label: "Sat" },
  { value: "SUNDAY", label: "Sun" },
];

export const TIMEFRAME_OPTIONS: ChoiceOption<StrategyTimeframe>[] = [
  { value: "WEEK", label: "Next week" },
  { value: "MONTH", label: "Next month" },
  { value: "QUARTER", label: "Next 3 months" },
];

export const STRATEGY_STATUS_DETAILS: Record<
  ContentStrategyStatus,
  { label: string; tone: "primary" | "success" | "neutral" }
> = {
  DRAFT: { label: "Draft", tone: "primary" },
  ACTIVE: { label: "Active", tone: "success" },
  ARCHIVED: { label: "Previous", tone: "neutral" },
};

/** Mirrors CONTENT_STRATEGY_LIMITS in backend/src/constants/contentStrategy.constant.ts. */
export const STRATEGY_LIMITS = {
  name: 120,
  instructions: 500,
  summary: 2000,
  text: 1000,
  label: 120,
  item: 300,
  hashtag: 60,
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

export const optionLabel = <T extends string>(options: ChoiceOption<T>[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

export const strategyTitle = ({ version, name }: { version: number; name: string | null }) =>
  name ? `${name} (v${version})` : `Version ${version}`;

/** Scales weights to whole percentages that add up to exactly 100. Mirrors the backend. */
export const balancePercentages = (weights: number[]): number[] => {
  if (weights.length === 0) return [];
  const positive = weights.map((weight) => Math.max(0, weight));
  const total = positive.reduce((sum, weight) => sum + weight, 0);
  const safe = total > 0 ? positive : positive.map(() => 1);
  const safeTotal = total > 0 ? total : safe.length;
  const exact = safe.map((weight) => (weight / safeTotal) * 100);
  const result = exact.map(Math.floor);
  let remainder = 100 - result.reduce((sum, value) => sum + value, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { index } of byFraction) {
    if (remainder <= 0) break;
    result[index] += 1;
    remainder -= 1;
  }
  return result;
};
