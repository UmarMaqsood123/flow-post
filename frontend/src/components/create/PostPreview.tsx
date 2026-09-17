import { Play } from "lucide-react";
import { PLATFORM_TEXT_LABELS, platformLabel, usesField } from "@/config/post";
import { cn } from "@/lib/utils";
import type { CreatePlatform, PostAttachment, PostContent } from "@/types/post";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

function Header({ workspaceName, subtitle }: { workspaceName: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {initials(workspaceName) || "FP"}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{workspaceName}</p>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function Body({ text }: { text: string }) {
  return text.trim() ? (
    <p className="text-sm leading-relaxed whitespace-pre-line">{text}</p>
  ) : (
    <p className="text-sm text-muted">Nothing written yet.</p>
  );
}

interface PostPreviewProps {
  platform: CreatePlatform;
  content: PostContent;
  /** Attached media; the preview shows it in place of the placeholders. */
  media?: PostAttachment[];
  workspaceName: string;
  className?: string;
}

/** Attached media as it would sit in the post: one video, or images in order. */
function MediaPreview({ media, vertical }: { media: PostAttachment[]; vertical: boolean }) {
  const [first] = media;
  if (!first) return null;
  if (first.kind === "video") {
    return (
      <video
        src={first.url}
        controls
        preload="metadata"
        playsInline
        className={cn(
          "w-full rounded-lg bg-slate-900 object-contain",
          vertical ? "aspect-[9/16] max-h-96" : "aspect-video",
        )}
      />
    );
  }
  return (
    <div className="relative">
      <img
        src={first.url}
        alt={first.description ?? ""}
        referrerPolicy="no-referrer"
        className="aspect-square w-full rounded-lg object-cover"
      />
      {media.length > 1 && (
        <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          1/{media.length}
        </span>
      )}
    </div>
  );
}

/** A light impression of the post on its platform — not a pixel-exact mock-up. */
function PostPreview({
  platform,
  content,
  media = [],
  workspaceName,
  className,
}: PostPreviewProps) {
  const isVideo = platform === "TIKTOK" || platform === "YOUTUBE";
  const hasMedia = media.length > 0;
  const showsHashtagsSeparately =
    content.hashtags.length > 0 && !content.hashtags.every((tag) => content.text.includes(tag));

  return (
    <div className={cn("rounded-xl border border-line bg-surface p-4", className)}>
      <Header workspaceName={workspaceName} subtitle={`${platformLabel(platform)} · preview`} />

      <div className="mt-4 flex flex-col gap-4">
        {platform === "YOUTUBE" && content.title && (
          <h3 className="text-base leading-snug font-semibold">{content.title}</h3>
        )}

        {hasMedia && (
          <MediaPreview
            media={media}
            vertical={platform === "TIKTOK" || platform === "INSTAGRAM"}
          />
        )}

        {isVideo && (
          <>
            {!hasMedia && content.hook && (
              <div className="relative flex aspect-[9/16] max-h-80 items-center justify-center overflow-hidden rounded-lg bg-slate-900 p-6 text-center">
                <p className="text-sm font-semibold text-balance text-white">{content.hook}</p>
                <Play
                  className="absolute bottom-3 left-3 size-5 text-white/70"
                  aria-hidden="true"
                />
              </div>
            )}
          </>
        )}

        {platform === "INSTAGRAM" && !hasMedia && (
          <div className="flex aspect-square max-h-72 items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 p-5 text-center">
            <p className="text-xs text-muted">Attach an image, carousel or reel</p>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
            {PLATFORM_TEXT_LABELS[platform]}
          </p>
          <Body text={content.text} />
        </div>

        {usesField(platform, "hashtags") && showsHashtagsSeparately && (
          <p className="text-sm text-primary">{content.hashtags.join(" ")}</p>
        )}
      </div>
    </div>
  );
}

export default PostPreview;
