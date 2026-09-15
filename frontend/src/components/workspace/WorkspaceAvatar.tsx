import { useState } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-6 rounded-md text-[10px]",
  md: "size-9 rounded-lg text-sm",
  lg: "size-14 rounded-xl text-lg",
} as const;

interface WorkspaceAvatarProps {
  name: string;
  logo?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "W";

/** Logo image with an initials fallback. Decorative — the name is always shown alongside. */
function WorkspaceAvatar({ name, logo, size = "md", className }: WorkspaceAvatarProps) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);

  if (logo && failedLogo !== logo) {
    return (
      <img
        src={logo}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailedLogo(logo)}
        className={cn(
          "shrink-0 border border-line bg-surface object-cover",
          SIZES[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-primary/10 font-semibold text-primary",
        SIZES[size],
        className,
      )}
    >
      {initialsFor(name)}
    </span>
  );
}

export default WorkspaceAvatar;
