/** Platforms AI Create writes for. A subset of SOCIAL_PLATFORMS. */
export const CREATE_PLATFORMS = ["LINKEDIN", "INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE"] as const;
export type CreatePlatformValue = (typeof CREATE_PLATFORMS)[number];

export const POST_STATUSES = ["DRAFT", "READY", "ARCHIVED"] as const;
export type PostStatusValue = (typeof POST_STATUSES)[number];
export const PostStatus = {
  /** Being worked on. */
  DRAFT: "DRAFT",
  /** Approved, waiting to be published. */
  READY: "READY",
  ARCHIVED: "ARCHIVED",
} as const satisfies Record<PostStatusValue, PostStatusValue>;

/** What the user asked for when refining a post. */
export const REFINE_ACTIONS = [
  "SHORTEN",
  "EXPAND",
  "CHANGE_TONE",
  "IMPROVE_HOOK",
  "IMPROVE_CTA",
  "ADD_EMOJIS",
  "REMOVE_EMOJIS",
  "GENERATE_HASHTAGS",
] as const;
export type RefineActionValue = (typeof REFINE_ACTIONS)[number];

/** Emoji removal is deterministic, so it never costs an AI request. */
export const LOCAL_REFINE_ACTIONS = ["REMOVE_EMOJIS"] as const;

/** How a version came to be. */
export const VERSION_SOURCES = [
  "GENERATE",
  "REGENERATE",
  "EDIT",
  "RESTORE",
  ...REFINE_ACTIONS,
] as const;
export type VersionSourceValue = (typeof VERSION_SOURCES)[number];

/**
 * Which content fields each platform uses. Fields outside the list are cleared,
 * so an Instagram caption never carries a YouTube title.
 */
export const PLATFORM_CONTENT_FIELDS = {
  LINKEDIN: ["hook", "body", "cta", "text", "hashtags"],
  INSTAGRAM: ["text", "hashtags", "visualIdea"],
  FACEBOOK: ["text", "hashtags"],
  TIKTOK: ["hook", "script", "text", "hashtags", "visualIdea"],
  YOUTUBE: ["title", "hook", "script", "text", "hashtags"],
} as const satisfies Record<CreatePlatformValue, readonly string[]>;

/** What the main `text` field is called on each platform. */
export const PLATFORM_TEXT_LABELS = {
  LINKEDIN: "Post",
  INSTAGRAM: "Caption",
  FACEBOOK: "Post",
  TIKTOK: "Caption",
  YOUTUBE: "Description",
} as const satisfies Record<CreatePlatformValue, string>;

export const POST_LIMITS = {
  topic: 500,
  instructions: 1000,
  title: 200,
  hook: 500,
  body: 6000,
  text: 10_000,
  cta: 300,
  visualIdea: 2000,
  scriptLine: 600,
  scenes: 12,
  hashtag: 60,
  hashtags: 30,
  /** Versions kept per post; older ones are dropped. */
  versions: 50,
  listLimit: 50,
} as const;
