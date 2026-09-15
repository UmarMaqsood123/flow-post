import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Pulsing placeholder block. Decorative — wrap loading regions in role="status". */
function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn("animate-pulse rounded-md bg-slate-100", className)}
    />
  );
}

export default Skeleton;
