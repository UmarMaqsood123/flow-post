import type { BrandGoal, BrandTone } from "./brandProfile";

/** Mirrors backend/src/validators/post.validator.ts and models/post.model.ts. */

export type CreatePlatform = "LINKEDIN" | "INSTAGRAM" | "FACEBOOK" | "TIKTOK" | "YOUTUBE";
export type PostStatus =
  "IDEA" | "DRAFT" | "READY" | "APPROVED" | "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "FAILED";

/** The statuses a person sets; scheduling and publishing move the rest. */
export type ManualPostStatus = "IDEA" | "DRAFT" | "READY" | "APPROVED";

export type RefineAction =
  | "SHORTEN"
  | "EXPAND"
  | "CHANGE_TONE"
  | "IMPROVE_HOOK"
  | "IMPROVE_CTA"
  | "ADD_EMOJIS"
  | "REMOVE_EMOJIS"
  | "GENERATE_HASHTAGS";

export type VersionSource =
  "CREATE" | "GENERATE" | "REGENERATE" | "DUPLICATE" | "EDIT" | "RESTORE" | RefineAction;

export interface PostContent {
  /** YouTube Shorts title. */
  title: string | null;
  hook: string | null;
  /** LinkedIn body between the hook and the call to action. */
  body: string | null;
  /** What gets published: the post, caption or description. */
  text: string;
  cta: string | null;
  hashtags: string[];
}

export type PostField = keyof PostContent;

export interface UserReference {
  id: string;
  name: string;
}

/** A media library file attached to a post version. */
export interface PostAttachment {
  id: string;
  url: string;
  name: string;
  description: string | null;
  kind: "image" | "video" | "document";
  mimeType: string;
  size: number;
}

export type VideoFormat = "standard" | "short";

export interface PostVersion {
  id: string;
  version: number;
  content: PostContent;
  /** In posting order. Files deleted from the library are left out. */
  media: PostAttachment[];
  videoFormat: VideoFormat | null;
  /** Why the media isn't ready to publish yet, or null. */
  mediaIssue: string | null;
  source: VersionSource;
  label: string;
  instructions: string | null;
  tone: BrandTone | null;
  generation: {
    provider: string;
    model: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number | null;
  } | null;
  createdBy: UserReference | null;
  createdAt: string;
}

export interface Post {
  id: string;
  platform: CreatePlatform;
  brief: {
    topic: string;
    goal: BrandGoal | null;
    tone: BrandTone | null;
    instructions: string | null;
  };
  status: PostStatus;
  pillar: string | null;
  /** Absolute instant (UTC), shown in the workspace time zone. */
  scheduledAt: string | null;
  publishedAt: string | null;
  versionCount: number;
  currentVersion: PostVersion | null;
  createdBy: UserReference | null;
  updatedBy: UserReference | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostWithVersions {
  post: Post;
  versions: PostVersion[];
}

export interface GeneratedPosts {
  posts: Post[];
  warnings: string[];
}

export interface GeneratePostsPayload {
  topic: string;
  goal?: BrandGoal;
  platforms: CreatePlatform[];
  tone?: BrandTone;
  instructions?: string;
}

export interface RegeneratePostPayload {
  tone?: BrandTone;
  instructions?: string;
}

export interface RefinePostPayload {
  action: RefineAction;
  tone?: BrandTone;
  instructions?: string;
}

export interface UpdatePostContentPayload {
  baseVersion: number;
  content: PostContent;
  /** File ids in posting order. Left out, the current media is kept. */
  media?: string[];
  videoFormat?: VideoFormat | null;
}

export interface ListPostsQuery {
  platform?: CreatePlatform[];
  status?: PostStatus[];
  pillar?: string[];
  /** Matches the topic or the post's text. */
  q?: string;
  hasMedia?: boolean;
  scheduled?: "true" | "false";
  page?: number;
  limit?: number;
}

/** A light row for the calendar: enough to draw a card without the full content. */
export interface CalendarItem {
  id: string;
  platform: CreatePlatform;
  status: PostStatus;
  pillar: string | null;
  topic: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  preview: string;
  versionCount: number;
  updatedAt: string;
}

export interface CalendarResponse {
  range: { from: string; to: string };
  items: CalendarItem[];
  /** Posts with no slot yet. */
  unscheduled: CalendarItem[];
}

export interface CalendarQuery {
  /** Absolute instants covering the visible grid in the workspace time zone. */
  from: string;
  to: string;
  platform?: CreatePlatform[];
  status?: PostStatus[];
  pillar?: string[];
  includeUnscheduled?: boolean;
}

/** Mirrors PublicSchedule in backend/src/services/publishing.service.ts. */
export type ScheduleStatus = "SCHEDULED" | "PROCESSING" | "PUBLISHED" | "FAILED" | "CANCELLED";

export interface PostSchedule {
  id: string;
  postId: string;
  platform: CreatePlatform;
  socialAccountId: string;
  scheduledAt: string;
  status: ScheduleStatus;
  attempts: number;
  maxAttempts: number;
  publishedAt: string | null;
  result: { providerPostId: string; url: string | null } | null;
  lastError: { code: string; message: string; occurredAt: string } | null;
  /** The platform was called but never answered: check before trying again. */
  needsReview: boolean;
  createdAt: string;
}

export interface PublishAttemptSummary {
  attempt: number;
  status: "IN_FLIGHT" | "SUCCEEDED" | "FAILED";
  requestSent: boolean;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

export interface PublishJobSummary {
  id: string;
  status: "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  runAt: string;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  outcomeUnknown: boolean;
  error: { code: string; message: string; retryable: boolean } | null;
  attemptHistory: PublishAttemptSummary[];
}

export interface ScheduleHistory {
  schedule: PostSchedule | null;
  jobs: PublishJobSummary[];
}

export interface SchedulePostInput {
  /** An ISO instant with an offset; null unschedules. */
  scheduledAt: string | null;
  /** Which connected account publishes it; only needed when there are several. */
  socialAccountId?: string;
  /**
   * True when the user pressed Schedule, so an idea or draft is moved on and
   * queued. Dragging a card leaves this off: it only changes the date.
   */
  publish?: boolean;
}

export interface UpdatePostDetailsPayload {
  topic?: string;
  pillar?: string | null;
  goal?: BrandGoal | null;
  tone?: BrandTone | null;
  instructions?: string | null;
}
