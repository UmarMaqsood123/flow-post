import {
  Eraser,
  Hash,
  type LucideIcon,
  Maximize2,
  Megaphone,
  Minimize2,
  Palette,
  Smile,
  Zap,
} from "lucide-react";
import type {
  CreatePlatform,
  ManualPostStatus,
  PostField,
  PostStatus,
  RefineAction,
} from "@/types/post";
import type { ChoiceOption } from "./brandProfile";

/** Mirrors backend/src/constants/post.constant.ts. */

export const CREATE_PLATFORM_OPTIONS: ChoiceOption<CreatePlatform>[] = [
  {
    value: "LINKEDIN",
    label: "LinkedIn",
    description: "Professional post with a hook, body and call to action",
  },
  {
    value: "INSTAGRAM",
    label: "Instagram",
    description: "Caption and hashtags, with an image, carousel or reel",
  },
  { value: "FACEBOOK", label: "Facebook", description: "Conversational post that invites replies" },
  {
    value: "TIKTOK",
    label: "TikTok",
    description: "Hook, caption and hashtags for your video",
  },
  {
    value: "YOUTUBE",
    label: "YouTube Shorts",
    description: "Title, hook, description and hashtags",
  },
];

export const platformLabel = (platform: CreatePlatform) =>
  CREATE_PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? platform;

/** Which fields each platform uses, in editing order. */
export const PLATFORM_FIELDS: Record<CreatePlatform, PostField[]> = {
  LINKEDIN: ["hook", "body", "cta", "text", "hashtags"],
  INSTAGRAM: ["text", "hashtags"],
  FACEBOOK: ["text", "hashtags"],
  TIKTOK: ["hook", "text", "hashtags"],
  YOUTUBE: ["title", "hook", "text", "hashtags"],
};

/** What the main `text` field is called on each platform. */
export const PLATFORM_TEXT_LABELS: Record<CreatePlatform, string> = {
  LINKEDIN: "Post",
  INSTAGRAM: "Caption",
  FACEBOOK: "Post",
  TIKTOK: "Caption",
  YOUTUBE: "Description",
};

/** Practical limits for the published text, used for the character counter. */
export const PLATFORM_TEXT_LIMITS: Record<CreatePlatform, number> = {
  LINKEDIN: 3000,
  INSTAGRAM: 2200,
  FACEBOOK: 63_206,
  TIKTOK: 2200,
  YOUTUBE: 5000,
};

export const FIELD_LABELS: Record<Exclude<PostField, "text">, string> = {
  title: "Title",
  hook: "Hook",
  body: "Body",
  cta: "Call to action",
  hashtags: "Hashtags",
};

export const REFINE_ACTIONS: {
  value: RefineAction;
  label: string;
  icon: LucideIcon;
  needsTone?: boolean;
}[] = [
  { value: "SHORTEN", label: "Shorten", icon: Minimize2 },
  { value: "EXPAND", label: "Expand", icon: Maximize2 },
  { value: "CHANGE_TONE", label: "Change tone", icon: Palette, needsTone: true },
  { value: "IMPROVE_HOOK", label: "Improve hook", icon: Zap },
  { value: "IMPROVE_CTA", label: "Improve CTA", icon: Megaphone },
  { value: "ADD_EMOJIS", label: "Add emojis", icon: Smile },
  { value: "REMOVE_EMOJIS", label: "Remove emojis", icon: Eraser },
  { value: "GENERATE_HASHTAGS", label: "New hashtags", icon: Hash },
];

export const POST_STATUS_DETAILS: Record<
  PostStatus,
  {
    label: string;
    tone: "primary" | "success" | "neutral" | "warning" | "danger";
    /** Calendar card accent. */
    dot: string;
  }
> = {
  IDEA: { label: "Idea", tone: "neutral", dot: "bg-slate-400" },
  DRAFT: { label: "Draft", tone: "primary", dot: "bg-primary" },
  READY: { label: "Ready", tone: "warning", dot: "bg-amber-500" },
  APPROVED: { label: "Approved", tone: "success", dot: "bg-green-600" },
  SCHEDULED: { label: "Scheduled", tone: "primary", dot: "bg-indigo-500" },
  PUBLISHING: { label: "Publishing", tone: "warning", dot: "bg-amber-600" },
  PUBLISHED: { label: "Published", tone: "success", dot: "bg-emerald-600" },
  FAILED: { label: "Failed", tone: "danger", dot: "bg-red-600" },
};

/** Statuses a person can set directly, in workflow order. */
export const MANUAL_POST_STATUSES: ManualPostStatus[] = ["IDEA", "DRAFT", "READY", "APPROVED"];

export const POST_STATUS_OPTIONS = (Object.keys(POST_STATUS_DETAILS) as PostStatus[]).map(
  (status) => ({ value: status, label: POST_STATUS_DETAILS[status].label }),
);

/** Published posts (and ones mid-publish) can't be changed. */
export const isPostLocked = (status: PostStatus) =>
  status === "PUBLISHING" || status === "PUBLISHED";

export const POST_LIMITS = {
  topic: 500,
  instructions: 1000,
  pillar: 120,
  title: 200,
  hook: 500,
  body: 6000,
  text: 10_000,
  cta: 300,
  hashtag: 60,
  hashtags: 30,
} as const;

export const usesField = (platform: CreatePlatform, field: PostField) =>
  PLATFORM_FIELDS[platform].includes(field);
