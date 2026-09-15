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
import type { CreatePlatform, PostField, PostStatus, RefineAction } from "@/types/post";
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
    description: "Caption, hashtags and a carousel or reel idea",
  },
  { value: "FACEBOOK", label: "Facebook", description: "Conversational post that invites replies" },
  {
    value: "TIKTOK",
    label: "TikTok",
    description: "Hook, short-video script, caption and hashtags",
  },
  {
    value: "YOUTUBE",
    label: "YouTube Shorts",
    description: "Title, hook, script, description and hashtags",
  },
];

export const platformLabel = (platform: CreatePlatform) =>
  CREATE_PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? platform;

/** Which fields each platform uses, in editing order. */
export const PLATFORM_FIELDS: Record<CreatePlatform, PostField[]> = {
  LINKEDIN: ["hook", "body", "cta", "text", "hashtags"],
  INSTAGRAM: ["text", "hashtags", "visualIdea"],
  FACEBOOK: ["text", "hashtags"],
  TIKTOK: ["hook", "script", "visualIdea", "text", "hashtags"],
  YOUTUBE: ["title", "hook", "script", "text", "hashtags"],
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
  script: "Script",
  visualIdea: "Visual idea",
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
  { label: string; tone: "primary" | "success" | "neutral" }
> = {
  DRAFT: { label: "Draft", tone: "primary" },
  READY: { label: "Ready", tone: "success" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

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
} as const;

export const usesField = (platform: CreatePlatform, field: PostField) =>
  PLATFORM_FIELDS[platform].includes(field);
