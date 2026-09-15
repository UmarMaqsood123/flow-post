import type { BrandGoal, BrandTone } from "./brandProfile";

/** Mirrors backend/src/validators/post.validator.ts and models/post.model.ts. */

export type CreatePlatform = "LINKEDIN" | "INSTAGRAM" | "FACEBOOK" | "TIKTOK" | "YOUTUBE";
export type PostStatus = "DRAFT" | "READY" | "ARCHIVED";

export type RefineAction =
  | "SHORTEN"
  | "EXPAND"
  | "CHANGE_TONE"
  | "IMPROVE_HOOK"
  | "IMPROVE_CTA"
  | "ADD_EMOJIS"
  | "REMOVE_EMOJIS"
  | "GENERATE_HASHTAGS";

export type VersionSource = "GENERATE" | "REGENERATE" | "EDIT" | "RESTORE" | RefineAction;

export interface ScriptScene {
  scene: string;
  voiceover: string;
}

export interface PostContent {
  /** YouTube Shorts title. */
  title: string | null;
  hook: string | null;
  /** LinkedIn body between the hook and the call to action. */
  body: string | null;
  /** What gets published: the post, caption or description. */
  text: string;
  cta: string | null;
  script: ScriptScene[];
  /** Carousel outline or reel/video concept. */
  visualIdea: string | null;
  hashtags: string[];
}

export type PostField = keyof PostContent;

export interface UserReference {
  id: string;
  name: string;
}

export interface PostVersion {
  id: string;
  version: number;
  content: PostContent;
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
}

export interface ListPostsQuery {
  platform?: CreatePlatform;
  status?: PostStatus;
  page?: number;
  limit?: number;
}
