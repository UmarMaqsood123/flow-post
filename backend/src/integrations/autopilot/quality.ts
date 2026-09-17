/**
 * Checks a written post before Autopilot uses it. `blocking` problems mean the
 * draft is thrown away (and rewritten once); `review` problems mean it's kept
 * but a person has to look before it can publish, even with approval off.
 */
import type { CreatePlatformValue } from "../../constants/post.constant";
import type { PostContent } from "../../validators/post.validator";
import { PLATFORM_GUIDELINES } from "../ai/prompts/platforms";
import { characterCount, findBuzzwords } from "../ai/postprocess";

export interface QualityResult {
  blocking: string[];
  review: string[];
}

const MIN_TEXT_CHARACTERS = 40;
const PLACEHOLDER =
  /\[[^\]\n]{1,40}\]|\{\{?[^}\n]{1,40}\}?\}|\b(TBD|TODO|lorem ipsum|insert [a-z ]+ here)\b/i;

export const checkQuality = (
  platform: CreatePlatformValue,
  content: PostContent,
): QualityResult => {
  const { label, maxCharacters } = PLATFORM_GUIDELINES[platform];
  const blocking: string[] = [];
  const review: string[] = [];
  const text = content.text.trim();

  if (characterCount(text) < MIN_TEXT_CHARACTERS) {
    blocking.push(`The ${label} text is too short to publish.`);
  }
  if (characterCount(text) > maxCharacters) {
    blocking.push(
      `The ${label} text is over the ${maxCharacters.toLocaleString("en-US")} character limit.`,
    );
  }
  if (platform === "YOUTUBE" && !content.title?.trim()) {
    blocking.push("The YouTube version has no title.");
  }
  if (platform === "LINKEDIN" && !content.hook?.trim()) {
    blocking.push("The LinkedIn version has no hook.");
  }

  const placeholder = PLACEHOLDER.exec([content.title, content.text].filter(Boolean).join("\n"));
  if (placeholder) {
    review.push(`Contains a placeholder ("${placeholder[0]}") that needs filling in.`);
  }
  const buzzwords = findBuzzwords(JSON.stringify(content));
  if (buzzwords.length > 0) {
    review.push(`Uses ${buzzwords.map((word) => `"${word}"`).join(", ")}.`);
  }
  return { blocking, review };
};
