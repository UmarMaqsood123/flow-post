import type { CreatePlatformValue } from "./post.constant";

/** How a video is published where a platform has more than one kind. */
export const VIDEO_FORMATS = ["standard", "short"] as const;
export type VideoFormatValue = (typeof VIDEO_FORMATS)[number];

/** A post can hold at most this many attachments, whatever the platform. */
export const MAX_ATTACHMENTS = 10;

export interface PlatformMediaRule {
  /** True when the platform has no text-only post, so media must be attached. */
  required: boolean;
  /** Images the platform accepts, or null when it takes none. */
  images: { max: number; mimeTypes: readonly string[] } | null;
  /** Video the platform accepts (always exactly one), or null when it takes none. */
  video: { mimeTypes: readonly string[]; formats: readonly VideoFormatValue[] } | null;
  /** Shown in the editor so people know what the platform needs before they try. */
  summary: string;
}

/**
 * What each platform can publish, taken from what the providers implement. A
 * post carries either images or one video, never both: no provider here mixes
 * them in a single post.
 *
 * Keep in sync with frontend/src/config/media.ts.
 */
export const PLATFORM_MEDIA_RULES: Record<CreatePlatformValue, PlatformMediaRule> = {
  LINKEDIN: {
    required: false,
    // The LinkedIn provider uploads one image; carousels and video aren't built.
    images: { max: 1, mimeTypes: ["image/jpeg", "image/png"] },
    video: null,
    summary: "Text, with one optional JPG or PNG image.",
  },
  FACEBOOK: {
    required: false,
    images: { max: 10, mimeTypes: ["image/jpeg", "image/png", "image/gif"] },
    video: { mimeTypes: ["video/mp4", "video/quicktime"], formats: ["standard", "short"] },
    summary: "Text, with up to 10 images or one video (a normal video or a Reel).",
  },
  INSTAGRAM: {
    required: true,
    // Instagram only accepts JPEG for image posts and carousels.
    images: { max: 10, mimeTypes: ["image/jpeg"] },
    // Every Instagram video is published as a Reel.
    video: { mimeTypes: ["video/mp4", "video/quicktime"], formats: ["short"] },
    summary: "Needs media: one JPEG image, a carousel of up to 10, or one video as a Reel.",
  },
  TIKTOK: {
    required: true,
    images: null,
    video: { mimeTypes: ["video/mp4", "video/quicktime", "video/webm"], formats: ["short"] },
    summary: "Needs one video (MP4, MOV or WebM).",
  },
  YOUTUBE: {
    required: true,
    images: null,
    video: {
      mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
      formats: ["standard", "short"],
    },
    summary: "Needs one video, as a normal video or a Short (vertical, three minutes or less).",
  },
};

/** The format a platform uses when it only has one. */
export const defaultVideoFormat = (platform: CreatePlatformValue): VideoFormatValue =>
  PLATFORM_MEDIA_RULES[platform].video?.formats[0] ?? "standard";
