/** Platforms AI Create writes for. A subset of SOCIAL_PLATFORMS. */
export const CREATE_PLATFORMS = ["LINKEDIN", "INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE"] as const;
export type CreatePlatformValue = (typeof CREATE_PLATFORMS)[number];

export const POST_STATUSES = [
  "IDEA",
  "DRAFT",
  "READY",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
] as const;
export type PostStatusValue = (typeof POST_STATUSES)[number];
export const PostStatus = {
  /** A slot on the calendar with a topic, not written yet. */
  IDEA: "IDEA",
  /** Being worked on. */
  DRAFT: "DRAFT",
  /** Written and ready for review. */
  READY: "READY",
  /** Reviewed and cleared to publish. */
  APPROVED: "APPROVED",
  /** Queued for its scheduled time. */
  SCHEDULED: "SCHEDULED",
  /** Being sent to the platform. */
  PUBLISHING: "PUBLISHING",
  PUBLISHED: "PUBLISHED",
  /** Publishing failed; the post can be fixed and scheduled again. */
  FAILED: "FAILED",
} as const satisfies Record<PostStatusValue, PostStatusValue>;

/** Statuses a person sets directly. Scheduling has its own endpoint; publishing owns the rest. */
export const MANUAL_POST_STATUSES = ["IDEA", "DRAFT", "READY", "APPROVED"] as const;
export type ManualPostStatusValue = (typeof MANUAL_POST_STATUSES)[number];

/** While a post is being sent or is live, its content can't change. */
export const LOCKED_POST_STATUSES = ["PUBLISHING", "PUBLISHED"] as const;

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
  "CREATE",
  "GENERATE",
  "REGENERATE",
  "DUPLICATE",
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
  INSTAGRAM: ["text", "hashtags"],
  FACEBOOK: ["text", "hashtags"],
  TIKTOK: ["hook", "text", "hashtags"],
  YOUTUBE: ["title", "hook", "text", "hashtags"],
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
  hashtag: 60,
  hashtags: 30,
  /** Versions kept per post; older ones are dropped. */
  versions: 50,
  listLimit: 50,
  /** Content pillar name, matched against the active strategy's pillars. */
  pillar: 120,
  /** Longest calendar range one request can ask for. */
  calendarDays: 120,
  calendarItems: 1000,
  /** Unscheduled posts returned alongside a calendar range. */
  unscheduled: 100,
  /** Preview text shown on a calendar card. */
  preview: 200,
} as const;
