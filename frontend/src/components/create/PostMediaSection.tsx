import { FileText, ImagePlus, Play, X } from "lucide-react";
import { useState } from "react";
import MediaPickerModal from "@/components/media/MediaPickerModal";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { PLATFORM_MEDIA_RULES, VIDEO_FORMAT_LABELS } from "@/config/media";
import { platformLabel } from "@/config/post";
import { cn } from "@/lib/utils";
import type { CreatePlatform, PostAttachment, VideoFormat } from "@/types/post";

interface PostMediaSectionProps {
  workspaceId: string;
  platform: CreatePlatform;
  media: PostAttachment[];
  videoFormat: VideoFormat | null;
  mediaIssue: string | null;
  /** Why media can't be changed right now (published, unsaved edits), or null. */
  disabledReason: string | null;
  canEdit: boolean;
  canUpload: boolean;
  isSaving: boolean;
  error: unknown;
  /** Saves a new version with this media, in order. Resolves when saved. */
  onChange: (media: string[], videoFormat: VideoFormat | null) => Promise<unknown>;
}

function AttachmentThumbnail({ item }: { item: PostAttachment }) {
  return (
    <span className="relative block size-full overflow-hidden rounded-lg bg-slate-100">
      {item.kind === "image" ? (
        <img
          src={item.url}
          alt={item.description ?? ""}
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : item.kind === "video" ? (
        <>
          <video
            src={`${item.url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            aria-hidden="true"
            className="size-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Play className="size-6 text-white" aria-hidden="true" />
          </span>
        </>
      ) : (
        <span className="flex size-full items-center justify-center text-primary">
          <FileText className="size-6" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

/**
 * The media a post publishes with. Each change saves a new version, the same
 * way the AI actions do, so it can always be undone from the history.
 */
function PostMediaSection({
  workspaceId,
  platform,
  media,
  videoFormat,
  mediaIssue,
  disabledReason,
  canEdit,
  canUpload,
  isSaving,
  error,
  onChange,
}: PostMediaSectionProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const rule = PLATFORM_MEDIA_RULES[platform];
  const hasVideo = media.some((item) => item.kind === "video");
  const formats = rule.video?.formats ?? [];
  const locked = !canEdit || Boolean(disabledReason) || isSaving;
  const acceptsMedia = Boolean(rule.images || rule.video);

  const save = (ids: string[], format: VideoFormat | null) =>
    onChange(ids, format).catch(() => {
      /* Shown through `error`. */
    });

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            Media
            {rule.required && <span className="ml-1 text-xs font-normal text-muted">required</span>}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{rule.summary}</p>
        </div>
        {canEdit && acceptsMedia && (
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-sm"
            onClick={() => setIsPickerOpen(true)}
            disabled={locked}
          >
            <ImagePlus className="size-4" aria-hidden="true" />
            {media.length > 0 ? "Change" : "Attach media"}
          </Button>
        )}
      </div>

      {media.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map((item, index) => (
            <li key={item.id} className="relative aspect-square">
              <AttachmentThumbnail item={item} />
              {media.length > 1 && (
                <span className="absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-[11px] font-semibold text-white">
                  {index + 1}
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    void save(
                      media.filter((other) => other.id !== item.id).map((other) => other.id),
                      videoFormat,
                    )
                  }
                  disabled={locked}
                  aria-label={`Remove ${item.name}`}
                  className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-40"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
              <span className="sr-only">{item.name}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Only where the platform really offers a choice, like Facebook's video or Reel. */}
      {hasVideo && formats.length > 1 && (
        <div role="group" aria-label="Publish the video as" className="mt-3 flex flex-wrap gap-2">
          {formats.map((format) => {
            const active = (videoFormat ?? formats[0]) === format;
            return (
              <button
                key={format}
                type="button"
                aria-pressed={active}
                disabled={!canEdit || locked || active}
                onClick={() =>
                  void save(
                    media.map((item) => item.id),
                    format,
                  )
                }
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-line text-muted hover:text-ink disabled:opacity-50",
                )}
              >
                {VIDEO_FORMAT_LABELS[platform][format]}
              </button>
            );
          })}
        </div>
      )}

      {media.length === 0 && !rule.required && acceptsMedia && (
        <p className="mt-3 text-sm text-muted">
          No media. This {platformLabel(platform)} post publishes as text.
        </p>
      )}
      {mediaIssue && (
        <Alert variant="warning" className="mt-3">
          {mediaIssue}
        </Alert>
      )}
      {canEdit && disabledReason && <p className="mt-3 text-xs text-muted">{disabledReason}</p>}

      {isPickerOpen && (
        <MediaPickerModal
          open
          workspaceId={workspaceId}
          platform={platform}
          attached={media}
          isSaving={isSaving}
          error={error}
          canUpload={canUpload}
          onClose={() => setIsPickerOpen(false)}
          onConfirm={(files) => {
            void onChange(
              files.map((file) => file.id),
              videoFormat,
            )
              .then(() => setIsPickerOpen(false))
              .catch(() => {
                /* The picker stays open and shows the error. */
              });
          }}
        />
      )}
    </section>
  );
}

export default PostMediaSection;
