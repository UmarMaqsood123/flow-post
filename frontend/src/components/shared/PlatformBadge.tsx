import { optionLabel, SOCIAL_PLATFORM_OPTIONS } from "@/config/brandProfile";
import { cn } from "@/lib/utils";
import type { SocialPlatform } from "@/types/brandProfile";

/** Brand-coloured monogram (the icon set has no brand logos). */
const PLATFORM_STYLES: Record<SocialPlatform, { mark: string; className: string }> = {
  LINKEDIN: { mark: "in", className: "bg-[#0a66c2]" },
  INSTAGRAM: { mark: "IG", className: "bg-linear-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]" },
  FACEBOOK: { mark: "f", className: "bg-[#1877f2]" },
  X: { mark: "X", className: "bg-black" },
  TIKTOK: { mark: "TT", className: "bg-slate-900" },
  YOUTUBE: { mark: "YT", className: "bg-[#ff0000]" },
  PINTEREST: { mark: "P", className: "bg-[#e60023]" },
  THREADS: { mark: "@", className: "bg-slate-800" },
};

interface PlatformBadgeProps {
  platform: SocialPlatform;
  size?: "sm" | "md";
  className?: string;
}

function PlatformBadge({ platform, size = "md", className }: PlatformBadgeProps) {
  const style = PLATFORM_STYLES[platform];
  return (
    <span
      role="img"
      aria-label={optionLabel(SOCIAL_PLATFORM_OPTIONS, platform)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-bold text-white",
        size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs",
        style.className,
        className,
      )}
    >
      <span aria-hidden="true">{style.mark}</span>
    </span>
  );
}

export default PlatformBadge;
