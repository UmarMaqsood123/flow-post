/**
 * Turns published posts and their collected metrics into performance facts.
 *
 * Everything here is plain arithmetic over real numbers, with no AI involved,
 * so a fact can always be recomputed and checked. The AI only ever reads these.
 */
import {
  CONFIDENCE_MIN_POSTS,
  type ContentFormatValue,
  CTA_TYPE_LABELS,
  type CtaTypeValue,
  type FactConfidenceValue,
  FORMAT_LABELS,
  HOOK_PATTERN_LABELS,
  type HookPatternValue,
  type InsightCategoryValue,
  TIME_OF_DAY_BUCKETS,
  WEEKDAY_LABELS,
} from "../../constants/insights.constant";
import type { CreatePlatformValue } from "../../constants/post.constant";
import type { IPerformanceFact } from "../../models/performanceInsightReport.model";
import { PLATFORM_GUIDELINES } from "../ai/prompts/platforms";

/** One published post with the metrics collected for it. */
export interface PostSample {
  postId: string;
  platform: CreatePlatformValue;
  pillar: string | null;
  topic: string;
  publishedAt: Date;
  hook: string | null;
  text: string;
  cta: string | null;
  format: ContentFormatValue;
  /** Likes, comments, shares and saves, counting only what the platform reports. */
  engagement: number;
  /** Null when the platform doesn't report views. */
  views: number | null;
}

// ── Classification ─────────────────────────────────────────

/** The opening line people see first: the hook when there is one, else the first line of text. */
const openingLine = (hook: string | null, text: string) =>
  (hook?.trim() || text.split("\n").find((line) => line.trim().length > 0) || "").trim();

export const classifyHook = (hook: string | null, text: string): HookPatternValue => {
  const line = openingLine(hook, text);
  if (/\?\s*$/.test(line) || /^[^.!]*\?/.test(line)) return "QUESTION";
  if (/^\W*how\b/i.test(line)) return "HOW_TO";
  if (
    /^\W*\d/.test(line) ||
    /\b\d+\s+(ways|tips|things|reasons|steps|mistakes|ideas)\b/i.test(line)
  ) {
    return "NUMBER";
  }
  if (
    /^\W*(stop|don'?t|never|forget|quit|the truth|unpopular opinion|why (you|most))\b/i.test(line)
  ) {
    return "CONTRARIAN";
  }
  return "STATEMENT";
};

const COMMENT_PATTERN =
  /\b(comment|reply|replies|tell (us|me)|let (us|me) know|what do you think|share your|drop a|in the comments)\b/i;
const LINK_PATTERN =
  /\b(link|shop|buy|order|visit|sign up|signup|book|download|learn more|get yours|register)\b|https?:\/\//i;
const FOLLOW_PATTERN =
  /\b(follow|share this|save this|save it|tag (a|someone|your)|subscribe|repost)\b/i;

/**
 * What the post asks people to do. The explicit call-to-action field wins; posts
 * without one are judged by their last lines, ignoring the hashtag block.
 */
export const classifyCta = (cta: string | null, text: string): CtaTypeValue => {
  const tail = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^(#\S+\s*)+$/.test(line))
    .slice(-2)
    .join(" ");
  const candidate = cta?.trim() || tail;
  if (!candidate) return "NONE";
  if (COMMENT_PATTERN.test(candidate)) return "COMMENT";
  if (LINK_PATTERN.test(candidate)) return "LINK";
  if (FOLLOW_PATTERN.test(candidate)) return "FOLLOW";
  // An explicit call to action we couldn't place is still a call to action.
  return cta?.trim() ? "OTHER" : "NONE";
};

export const classifyFormat = (
  media: { kind: string }[],
  videoFormat: string | null,
): ContentFormatValue => {
  if (media.length === 0) return "TEXT";
  if (media.some((file) => file.kind === "video")) {
    return videoFormat === "short" ? "SHORT_VIDEO" : "VIDEO";
  }
  return media.length > 1 ? "CAROUSEL" : "IMAGE";
};

/** Weekday (0 = Sunday) and hour, as the workspace's own clock showed them. */
export const localTime = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  return { weekday: Math.max(0, weekday), hour };
};

export const timeOfDayBucket = (hour: number) =>
  TIME_OF_DAY_BUCKETS.find((bucket) =>
    bucket.from < bucket.to
      ? hour >= bucket.from && hour < bucket.to
      : hour >= bucket.from || hour < bucket.to,
  ) ?? TIME_OF_DAY_BUCKETS[0];

const slug = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "untitled";

// ── Aggregation ────────────────────────────────────────────

export const confidenceFor = (posts: number): FactConfidenceValue =>
  posts >= CONFIDENCE_MIN_POSTS.HIGH
    ? "HIGH"
    : posts >= CONFIDENCE_MIN_POSTS.MEDIUM
      ? "MEDIUM"
      : "LOW";

/** Rounded for display and storage; the underlying sums are exact. */
const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

interface Group {
  category: InsightCategoryValue;
  key: string;
  label: string;
  samples: PostSample[];
}

const summarize = (samples: PostSample[]) => {
  const totalEngagement = samples.reduce((sum, sample) => sum + sample.engagement, 0);
  const withViews = samples.filter((sample) => sample.views !== null);
  const totalViews = withViews.reduce((sum, sample) => sum + (sample.views ?? 0), 0);
  return {
    posts: samples.length,
    totalEngagement,
    avgEngagement: samples.length > 0 ? totalEngagement / samples.length : 0,
    avgViews: withViews.length > 0 ? totalViews / withViews.length : null,
    engagementRate:
      withViews.length > 0 && totalViews > 0
        ? withViews.reduce((sum, sample) => sum + sample.engagement, 0) / totalViews
        : null,
  };
};

export interface CalculatedPerformance {
  postsAnalyzed: number;
  baseline: { avgEngagement: number; avgViews: number | null };
  facts: IPerformanceFact[];
}

/**
 * Groups posts every way the insights look at them and measures each group
 * against the workspace's own average. Groups are sorted best first within each
 * category, which is also the order the AI sees them in.
 */
export const calculatePerformance = (
  samples: PostSample[],
  timeZone: string,
): CalculatedPerformance => {
  const overall = summarize(samples);
  const groups = new Map<string, Group>();

  const add = (category: InsightCategoryValue, key: string, label: string, sample: PostSample) => {
    const id = `${category}:${key}`;
    const group = groups.get(id) ?? { category, key, label, samples: [] };
    group.samples.push(sample);
    groups.set(id, group);
  };

  for (const sample of samples) {
    if (sample.pillar) add("PILLAR", slug(sample.pillar), sample.pillar, sample);
    if (sample.topic.trim()) add("TOPIC", slug(sample.topic), sample.topic.trim(), sample);
    add("PLATFORM", sample.platform, PLATFORM_GUIDELINES[sample.platform].label, sample);

    const { weekday, hour } = localTime(sample.publishedAt, timeZone);
    add("WEEKDAY", String(weekday), WEEKDAY_LABELS[weekday], sample);
    const bucket = timeOfDayBucket(hour);
    add("TIME_OF_DAY", bucket.key, bucket.label, sample);

    add("FORMAT", sample.format, FORMAT_LABELS[sample.format], sample);
    const hook = classifyHook(sample.hook, sample.text);
    add("HOOK", hook, HOOK_PATTERN_LABELS[hook], sample);
    const cta = classifyCta(sample.cta, sample.text);
    add("CTA", cta, CTA_TYPE_LABELS[cta], sample);
  }

  const facts = [...groups.entries()].map(([id, group]): IPerformanceFact => {
    const stats = summarize(group.samples);
    return {
      id,
      category: group.category,
      key: group.key,
      label: group.label,
      posts: stats.posts,
      totalEngagement: stats.totalEngagement,
      avgEngagement: round(stats.avgEngagement),
      avgViews: stats.avgViews === null ? null : round(stats.avgViews),
      engagementRate: stats.engagementRate === null ? null : round(stats.engagementRate, 4),
      liftVsAverage:
        overall.avgEngagement > 0 ? round(stats.avgEngagement / overall.avgEngagement) : null,
      confidence: confidenceFor(stats.posts),
    };
  });

  facts.sort(
    (left, right) =>
      left.category.localeCompare(right.category) || right.avgEngagement - left.avgEngagement,
  );

  return {
    postsAnalyzed: samples.length,
    baseline: {
      avgEngagement: round(overall.avgEngagement),
      avgViews: overall.avgViews === null ? null : round(overall.avgViews),
    },
    facts,
  };
};
