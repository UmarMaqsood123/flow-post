/**
 * Repeat detection for topics, hooks and posts. Deliberately simple and
 * explainable: normalized word sets compared by overlap (Jaccard), so any
 * rejection can be shown with the text it matched and a score.
 */

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from how i if in into is it its just me my no not of on or our so that the their them then there these they this to up us was we what when where which who why will with you your".split(
    " ",
  ),
);

/** Lowercase words without punctuation, stopwords, or simple plural and tense endings. */
export const significantWords = (text: string): string[] =>
  text
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[#@]\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map((word) => (word.length > 4 ? word.replace(/(ing|ed|es|s|e)$/u, "") : word));

const jaccard = (left: Set<string>, right: Set<string>) => {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  return shared / (left.size + right.size - shared);
};

export const wordSimilarity = (left: string, right: string) =>
  jaccard(new Set(significantWords(left)), new Set(significantWords(right)));

/** Overlapping three-word runs: catches reworded copies that share most sentences. */
const shingles = (text: string) => {
  const words = significantWords(text);
  const result = new Set<string>();
  for (let index = 0; index + 3 <= words.length; index += 1) {
    result.add(words.slice(index, index + 3).join(" "));
  }
  return result.size > 0 ? result : new Set(words);
};

export const textSimilarity = (left: string, right: string) =>
  jaccard(shingles(left), shingles(right));

export interface SimilarMatch {
  match: string;
  score: number;
}

/** The closest earlier text at or above the threshold, or null. */
export const findSimilar = (
  candidate: string,
  previous: string[],
  threshold: number,
  compare: (left: string, right: string) => number = wordSimilarity,
): SimilarMatch | null => {
  let best: SimilarMatch | null = null;
  for (const text of previous) {
    const score = compare(candidate, text);
    if (score >= threshold && (!best || score > best.score)) {
      best = { match: text, score: Math.round(score * 100) / 100 };
    }
  }
  return best;
};

/** The line a reader sees first: the hook, or the first line of the text. */
export const openingOf = (hook: string | null | undefined, text: string) =>
  (hook?.trim() || text.split("\n").find((line) => line.trim().length > 0) || "").trim();
