import { Play } from "lucide-react";
import { PLATFORM_TEXT_LABELS, platformLabel, usesField } from "@/config/post";
import { cn } from "@/lib/utils";
import type { CreatePlatform, PostContent } from "@/types/post";

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

function Script({ content }: { content: PostContent }) {
  if (content.script.length === 0) return null;
  return (
    <ol className="divide-y divide-line rounded-lg border border-line">
      {content.script.map((scene, index) => (
        <li key={`${index}-${scene.scene}`} className="flex gap-3 p-3">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-muted">
            {index + 1}
          </span>
          <div className="min-w-0 text-sm">
            {scene.scene && <p className="font-medium">{scene.scene}</p>}
            {scene.voiceover && <p className="mt-0.5 text-muted">“{scene.voiceover}”</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

interface PostPreviewProps {
  platform: CreatePlatform;
  content: PostContent;
  workspaceName: string;
  className?: string;
}

/** A light impression of the post on its platform — not a pixel-exact mock-up. */
function PostPreview({ platform, content, workspaceName, className }: PostPreviewProps) {
  const isVideo = platform === "TIKTOK" || platform === "YOUTUBE";
  const showsHashtagsSeparately =
    content.hashtags.length > 0 && !content.hashtags.every((tag) => content.text.includes(tag));

  return (
    <div className={cn("rounded-xl border border-line bg-surface p-4", className)}>
      <Header workspaceName={workspaceName} subtitle={`${platformLabel(platform)} · preview`} />

      <div className="mt-4 flex flex-col gap-4">
        {platform === "YOUTUBE" && content.title && (
          <h3 className="text-base leading-snug font-semibold">{content.title}</h3>
        )}

        {isVideo && (
          <>
            {content.hook && (
              <div className="relative flex aspect-[9/16] max-h-80 items-center justify-center overflow-hidden rounded-lg bg-slate-900 p-6 text-center">
                <p className="text-sm font-semibold text-balance text-white">{content.hook}</p>
                <Play
                  className="absolute bottom-3 left-3 size-5 text-white/70"
                  aria-hidden="true"
                />
              </div>
            )}
            <Script content={content} />
          </>
        )}

        {platform === "INSTAGRAM" && (
          <div className="flex aspect-square max-h-72 items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 p-5 text-center">
            <p className="text-xs text-muted">
              {content.visualIdea ? content.visualIdea.split("\n")[0] : "Your image or carousel"}
            </p>
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
