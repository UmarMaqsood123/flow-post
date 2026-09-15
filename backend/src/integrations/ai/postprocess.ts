import { CONTENT_STRATEGY_LIMITS } from "../../constants/contentStrategy.constant";
import type { StrategyContent } from "../../validators/contentStrategy.validator";

export const MAX_HASHTAGS = 30;

export const characterCount = (text: string) => [...text].length;

/** "#Coffee", "specialty coffee!" → "#Coffee", "#specialtycoffee"; drops duplicates and empties. */
export const normalizeHashtags = (tags: string[], limit = MAX_HASHTAGS): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const cleaned = tag.normalize("NFKC").replace(/[^\p{L}\p{N}_]/gu, "");
    const key = cleaned.toLocaleLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(`#${cleaned}`);
    if (result.length >= limit) break;
  }
  return result;
};

/** Scales weights to whole percentages that add up to exactly 100 (largest remainder method). */
export const toPercentages = (weights: number[]): number[] => {
  if (weights.length === 0) return [];
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  const safe = total > 0 ? weights.map((weight) => Math.max(0, weight)) : weights.map(() => 1);
  const safeTotal = total > 0 ? total : weights.length;
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

/**
 * Makes AI strategy output internally consistent before it's validated and stored:
 * format shares add up to 100, the weekly total matches the per-platform plan,
 * and the hashtag range is ordered.
 */
export const normalizeStrategyContent = (content: StrategyContent): StrategyContent => {
  const { contentFormats, postingFrequency, hashtagApproach } = content;
  const shares = toPercentages(contentFormats.map((format) => format.sharePercent));
  const platformTotal = postingFrequency.platforms.reduce(
    (sum, platform) => sum + platform.postsPerWeek,
    0,
  );

  return {
    ...content,
    contentFormats: contentFormats.map((format, index) => ({
      ...format,
      sharePercent: shares[index],
    })),
    postingFrequency: {
      ...postingFrequency,
      postsPerWeek:
        postingFrequency.platforms.length > 0
          ? Math.min(platformTotal, CONTENT_STRATEGY_LIMITS.postsPerWeek)
          : postingFrequency.postsPerWeek,
    },
    hashtagApproach: {
      ...hashtagApproach,
      minPerPost: Math.min(hashtagApproach.minPerPost, hashtagApproach.maxPerPost),
      maxPerPost: Math.max(hashtagApproach.minPerPost, hashtagApproach.maxPerPost),
    },
  };
};
