import type { Types } from "mongoose";
import {
  MAX_ATTACHMENTS,
  PLATFORM_MEDIA_RULES,
  type VideoFormatValue,
} from "../constants/media.constant";
import type { CreatePlatformValue } from "../constants/post.constant";
import { PLATFORM_GUIDELINES } from "../integrations/ai/prompts/platforms";
import type { SocialCapability } from "../integrations/social/capabilities";
import type { MediaAsset } from "../integrations/social/types";
import { StoredFile, type StoredFileDocument } from "../models/file.model";
import { AppError } from "../utils/appError.util";
import { getStorage } from "../utils/storage.util";

const label = (platform: CreatePlatformValue) => PLATFORM_GUIDELINES[platform].label;

export interface PublicAttachment {
  id: string;
  url: string;
  name: string;
  description: string | null;
  kind: "image" | "video" | "document";
  mimeType: string;
  size: number;
}

export const toPublicAttachment = (file: StoredFileDocument): PublicAttachment => ({
  id: file._id.toString(),
  url: file.url,
  name: file.title ?? file.originalName,
  description: file.description ?? null,
  kind: file.kind,
  mimeType: file.mimeType,
  size: file.size,
});

/**
 * The workspace's files for these ids, in the order given. A file deleted from
 * the library since it was attached is simply left out, so it shows as missing
 * rather than breaking the whole post.
 */
export const loadAttachments = async (
  workspaceId: Types.ObjectId,
  fileIds: readonly (Types.ObjectId | string)[],
): Promise<StoredFileDocument[]> => {
  if (fileIds.length === 0) return [];
  const files = await StoredFile.find({ workspace: workspaceId, _id: { $in: fileIds } });
  const byId = new Map(files.map((file) => [file._id.toString(), file]));
  return fileIds.flatMap((id) => {
    const file = byId.get(id.toString());
    return file ? [file] : [];
  });
};

/**
 * What's wrong with these attachments for this platform, or null when they're
 * fine. `requireMedia` is only set when the post is about to be scheduled: a
 * draft can be saved before its video has been chosen.
 */
export const attachmentProblem = (
  platform: CreatePlatformValue,
  files: StoredFileDocument[],
  { requireMedia }: { requireMedia: boolean },
): string | null => {
  const rule = PLATFORM_MEDIA_RULES[platform];
  const name = label(platform);

  if (files.length === 0) {
    return requireMedia && rule.required ? `${name} posts need media. ${rule.summary}` : null;
  }
  if (files.length > MAX_ATTACHMENTS) {
    return `Attach up to ${MAX_ATTACHMENTS} files.`;
  }

  const documents = files.filter((file) => file.kind === "document");
  if (documents.length > 0) {
    return `Documents can't be posted. Remove "${documents[0].title ?? documents[0].originalName}".`;
  }

  const videos = files.filter((file) => file.kind === "video");
  const images = files.filter((file) => file.kind === "image");

  if (videos.length > 0 && images.length > 0) {
    return "A post can have images or a video, not both.";
  }

  if (videos.length > 0) {
    if (!rule.video) return `${name} posts can't include video. ${rule.summary}`;
    if (videos.length > 1) return `${name} posts take one video.`;
    const [video] = videos;
    if (!rule.video.mimeTypes.includes(video.mimeType)) {
      return `${name} doesn't accept this video format. ${rule.summary}`;
    }
    return null;
  }

  if (!rule.images) return `${name} posts can't include images. ${rule.summary}`;
  if (images.length > rule.images.max) {
    return rule.images.max === 1
      ? `${name} posts take one image.`
      : `${name} posts take up to ${rule.images.max} images.`;
  }
  const unsupported = images.find((file) => !rule.images!.mimeTypes.includes(file.mimeType));
  if (unsupported) {
    return `${name} doesn't accept "${unsupported.title ?? unsupported.originalName}". ${rule.summary}`;
  }
  return null;
};

/** Throws a 400 with the problem, for API writes. */
export const assertAttachments = (
  platform: CreatePlatformValue,
  files: StoredFileDocument[],
  options: { requireMedia: boolean },
) => {
  const problem = attachmentProblem(platform, files, options);
  if (problem) {
    throw AppError.badRequest(problem, [{ path: "media", message: problem }]);
  }
};

/** A video format valid for the platform, falling back to its default. */
export const resolveVideoFormat = (
  platform: CreatePlatformValue,
  files: StoredFileDocument[],
  requested: VideoFormatValue | null | undefined,
): VideoFormatValue | null => {
  const rule = PLATFORM_MEDIA_RULES[platform].video;
  if (!rule || !files.some((file) => file.kind === "video")) return null;
  return requested && rule.formats.includes(requested) ? requested : rule.formats[0];
};

export type PublishKind = "TEXT" | "IMAGES" | "VIDEO";

/** Which provider method a post needs, from what's attached to it. */
export const publishKindOf = (files: StoredFileDocument[]): PublishKind =>
  files.length === 0 ? "TEXT" : files.some((file) => file.kind === "video") ? "VIDEO" : "IMAGES";

/** The capability the provider must declare for this post. */
export const requiredCapability = (
  files: StoredFileDocument[],
  videoFormat: VideoFormatValue | null,
): SocialCapability => {
  const kind = publishKindOf(files);
  if (kind === "TEXT") return "TEXT_POST";
  if (kind === "VIDEO") return videoFormat === "short" ? "SHORT_VIDEO" : "VIDEO_POST";
  return files.length > 1 ? "CAROUSEL" : "IMAGE_POST";
};

/**
 * A library file as a provider sees it. `read` streams the bytes from our own
 * storage for platforms that upload the file; the rest fetch `url` themselves.
 */
export const toMediaAsset = (file: StoredFileDocument): MediaAsset => ({
  url: file.url,
  mimeType: file.mimeType,
  size: file.size,
  altText: file.description ?? undefined,
  read: () => getStorage().getObject(file.key),
});
