import {
  type CreatePlatformValue,
  PLATFORM_CONTENT_FIELDS,
  PLATFORM_TEXT_LABELS,
} from "../../constants/post.constant";
import type { BrandGoalValue, BrandToneValue } from "../../constants/brandProfile.constant";
import type { RefineActionValue } from "../../constants/post.constant";
import type { PostContent } from "../../validators/post.validator";

/** What the create-posts prompt needs: the user's brief plus workspace context. */
export interface CreatePostsPromptInput {
  topic: string;
  goal?: BrandGoalValue;
  platforms: CreatePlatformValue[];
  tone?: BrandToneValue;
  instructions?: string;
  /** Prompt-ready summary of the active content strategy, when there is one. */
  strategy: string | null;
}

/** What the refine prompt needs: the post as it stands, plus what to change. */
export interface RefinePostPromptInput {
  platform: CreatePlatformValue;
  action: Exclude<RefineActionValue, "REMOVE_EMOJIS">;
  tone?: BrandToneValue;
  instructions?: string;
  brief: {
    topic: string;
    goal?: BrandGoalValue;
    tone?: BrandToneValue;
    instructions?: string;
  };
  content: PostContent;
  strategy: string | null;
}

const uses = (platform: CreatePlatformValue, field: string) =>
  (PLATFORM_CONTENT_FIELDS[platform] as readonly string[]).includes(field);

/** Clears the fields a platform doesn't use, so drafts never carry another platform's parts. */
export const preparePostContent = (
  platform: CreatePlatformValue,
  content: PostContent,
): PostContent => ({
  title: uses(platform, "title") ? content.title : null,
  hook: uses(platform, "hook") ? content.hook : null,
  body: uses(platform, "body") ? content.body : null,
  text: content.text,
  cta: uses(platform, "cta") ? content.cta : null,
  script: uses(platform, "script") ? content.script : [],
  visualIdea: uses(platform, "visualIdea") ? content.visualIdea : null,
  hashtags: uses(platform, "hashtags") ? content.hashtags : [],
});

// Alternatives rather than one class: skin tones, flags and joiners combine with
// the pictographs around them, which a single character class can't express safely.
const EMOJI_PATTERN =
  /\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|[\u{1F1E6}-\u{1F1FF}]|️|⃣|‍/gu;

export const containsEmojis = (content: PostContent): boolean =>
  JSON.stringify(content).match(EMOJI_PATTERN) !== null;

/** Collapses the spaces left behind when emoji are removed, keeping line breaks. */
const stripEmojis = (value: string): string =>
  value
    .replace(EMOJI_PATTERN, "")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]{2,}/g, " ").trimEnd())
    .join("\n")
    .trim();

/** Removing emoji is deterministic, so it doesn't need an AI request. */
export const removeEmojis = (content: PostContent): PostContent => ({
  ...content,
  title: content.title === null ? null : stripEmojis(content.title) || null,
  hook: content.hook === null ? null : stripEmojis(content.hook) || null,
  body: content.body === null ? null : stripEmojis(content.body) || null,
  text: stripEmojis(content.text),
  cta: content.cta === null ? null : stripEmojis(content.cta) || null,
  script: content.script.map((scene) => ({
    scene: stripEmojis(scene.scene),
    voiceover: stripEmojis(scene.voiceover),
  })),
  visualIdea: content.visualIdea === null ? null : stripEmojis(content.visualIdea) || null,
  hashtags: content.hashtags.map((tag) => stripEmojis(tag)).filter((tag) => tag.length > 1),
});

/** Prompt-ready rendering of a post, used when asking the model to improve it. */
export const describePostContent = (
  platform: CreatePlatformValue,
  content: PostContent,
): string => {
  const parts: (string | null)[] = [
    content.title && `Title: ${content.title}`,
    content.hook && `Hook: ${content.hook}`,
    content.body && `Body:\n${content.body}`,
    content.cta && `Call to action: ${content.cta}`,
    content.script.length > 0
      ? `Script:\n${content.script
          .map(
            (scene, index) =>
              `${index + 1}. On screen: ${scene.scene} | Voiceover: ${scene.voiceover}`,
          )
          .join("\n")}`
      : null,
    content.visualIdea && `Visual idea:\n${content.visualIdea}`,
    `${PLATFORM_TEXT_LABELS[platform]}:\n${content.text}`,
    content.hashtags.length > 0 ? `Hashtags: ${content.hashtags.join(" ")}` : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join("\n\n");
};

/** Loose comparison used to spot platforms that got near-identical copy. */
export const comparableText = (text: string) =>
  text
    .toLocaleLowerCase()
    .replace(EMOJI_PATTERN, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
