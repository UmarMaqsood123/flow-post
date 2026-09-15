import type { SocialPlatformValue } from "../../../constants/brandProfile.constant";

interface PlatformGuideline {
  label: string;
  /** Hard or practical caption limit used for validation warnings. */
  maxCharacters: number;
  hashtags: string;
  style: string;
}

/**
 * Writing guidance per platform, shared by every prompt. Limits are the
 * platforms' post/caption limits; bump prompt versions when this changes output.
 */
export const PLATFORM_GUIDELINES: Record<SocialPlatformValue, PlatformGuideline> = {
  LINKEDIN: {
    label: "LinkedIn",
    maxCharacters: 3000,
    hashtags: "3 to 5 relevant hashtags at the end",
    style:
      "Professional and insight-led. The first two lines must earn the 'see more' click. Short paragraphs with line breaks.",
  },
  INSTAGRAM: {
    label: "Instagram",
    maxCharacters: 2200,
    hashtags: "5 to 15 focused hashtags (30 maximum), at the end",
    style: "Caption supports a visual. Strong first line, scannable body, emojis only if on-brand.",
  },
  FACEBOOK: {
    label: "Facebook",
    maxCharacters: 63206,
    hashtags: "0 to 3 hashtags",
    style: "Conversational and community-focused. Concise posts invite comments.",
  },
  X: {
    label: "X",
    maxCharacters: 280,
    hashtags: "At most 1 or 2 hashtags",
    style: "Punchy, one idea per post, no filler.",
  },
  TIKTOK: {
    label: "TikTok",
    maxCharacters: 2200,
    hashtags: "3 to 6 hashtags",
    style: "Caption supports a short video. Casual, energetic and trend-aware.",
  },
  YOUTUBE: {
    label: "YouTube",
    maxCharacters: 5000,
    hashtags: "3 to 5 hashtags in the description",
    style:
      "Video description: first two lines summarize the value, then details. Titles stay under 100 characters.",
  },
  PINTEREST: {
    label: "Pinterest",
    maxCharacters: 500,
    hashtags: "2 to 5 keyword-style hashtags",
    style: "Keyword-rich and searchable. Describe what the pin helps people do.",
  },
  THREADS: {
    label: "Threads",
    maxCharacters: 500,
    hashtags: "At most 1 topic tag",
    style: "Conversational and short, like talking to a friend.",
  },
};

export const describePlatforms = (platforms: SocialPlatformValue[]) =>
  platforms
    .map((platform) => {
      const guideline = PLATFORM_GUIDELINES[platform];
      return `${platform} (${guideline.label}): up to ${guideline.maxCharacters.toLocaleString("en-US")} characters. Hashtags: ${guideline.hashtags}. Style: ${guideline.style}`;
    })
    .join("\n");
