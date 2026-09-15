import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  primary: "bg-primary/10 text-primary",
  success: "bg-green-50 text-green-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-50 text-red-700",
} as const;

interface BadgeProps {
  tone?: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}

function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default Badge;
