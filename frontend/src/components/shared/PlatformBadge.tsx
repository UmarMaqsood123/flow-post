import facebookLogo from "@/assets/platforms/facebook.svg";
import instagramLogo from "@/assets/platforms/instagram.svg";
import linkedinLogo from "@/assets/platforms/linkedin.svg";
import pinterestLogo from "@/assets/platforms/pinterest.svg";
import threadsLogo from "@/assets/platforms/threads.svg";
import tiktokLogo from "@/assets/platforms/tiktok.svg";
import xLogo from "@/assets/platforms/x.svg";
import youtubeLogo from "@/assets/platforms/youtube.svg";
import { optionLabel, SOCIAL_PLATFORM_OPTIONS } from "@/config/brandProfile";
import { cn } from "@/lib/utils";
import type { SocialPlatform } from "@/types/brandProfile";

/** Official full-colour platform logos (vector, via svgl.app). */
const PLATFORM_LOGOS: Record<SocialPlatform, string> = {
  LINKEDIN: linkedinLogo,
  INSTAGRAM: instagramLogo,
  FACEBOOK: facebookLogo,
  X: xLogo,
  TIKTOK: tiktokLogo,
  YOUTUBE: youtubeLogo,
  PINTEREST: pinterestLogo,
  THREADS: threadsLogo,
};

interface PlatformBadgeProps {
  platform: SocialPlatform;
  size?: "sm" | "md";
  className?: string;
}

function PlatformBadge({ platform, size = "md", className }: PlatformBadgeProps) {
  return (
    <span
      role="img"
      aria-label={optionLabel(SOCIAL_PLATFORM_OPTIONS, platform)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border border-line bg-white",
        size === "sm" ? "size-7" : "size-9",
        className,
      )}
    >
      <img
        src={PLATFORM_LOGOS[platform]}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="size-3/5 object-contain"
      />
    </span>
  );
}

export default PlatformBadge;
