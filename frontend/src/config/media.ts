import type { CreatePlatform, PostAttachment, VideoFormat } from "@/types/post";

/** Mirrors PLATFORM_MEDIA_RULES in backend/src/constants/media.constant.ts. */
export interface PlatformMediaRule {
  required: boolean;
  images: { max: number; mimeTypes: readonly string[] } | null;
  video: { mimeTypes: readonly string[]; formats: readonly VideoFormat[] } | null;
  summary: string;
}

export const PLATFORM_MEDIA_RULES: Record<CreatePlatform, PlatformMediaRule> = {
  LINKEDIN: {
    required: false,
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
    images: { max: 10, mimeTypes: ["image/jpeg"] },
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

export const VIDEO_FORMAT_LABELS: Record<CreatePlatform, Record<VideoFormat, string>> = {
  LINKEDIN: { standard: "Video", short: "Short video" },
  FACEBOOK: { standard: "Video", short: "Reel" },
  INSTAGRAM: { standard: "Reel", short: "Reel" },
  TIKTOK: { standard: "Video", short: "Video" },
  YOUTUBE: { standard: "Video", short: "Short" },
};

/**
 * Why this file can't be added to what's already attached, or null when it can.
 * Instant feedback only; the API checks again on save.
 */
export const attachBlocker = (
  platform: CreatePlatform,
  file: Pick<PostAttachment, "kind" | "mimeType">,
  attached: Pick<PostAttachment, "kind">[],
): string | null => {
  const rule = PLATFORM_MEDIA_RULES[platform];
  if (file.kind === "document") return "Documents can't be posted";
  if (file.kind === "video") {
    if (!rule.video) return "This platform doesn't take video";
    if (!rule.video.mimeTypes.includes(file.mimeType)) return "Video format not accepted";
    if (attached.length > 0) return "A video has to be the only attachment";
    return null;
  }
  if (!rule.images) return "This platform doesn't take images";
  if (!rule.images.mimeTypes.includes(file.mimeType)) {
    return rule.images.mimeTypes.length === 1
      ? "Only JPEG images are accepted"
      : "Image format not accepted";
  }
  if (attached.some((item) => item.kind === "video")) return "Remove the video to add images";
  if (attached.length >= rule.images.max) {
    return rule.images.max === 1 ? "Only one image fits" : `Up to ${rule.images.max} images`;
  }
  return null;
};
