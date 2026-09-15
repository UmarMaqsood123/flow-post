import { env } from "@/config/env";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Classes for the "FlowPost" wordmark, e.g. `hidden sm:inline` to show only the mark on phones. */
  wordmarkClassName?: string;
}

function Logo({ className, wordmarkClassName }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#4f46e5" />
        <path
          d="M9 21c3-8 7-8 14-10M9 14c3-3 6-3 10-4"
          stroke="#fff"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <span className={cn("text-lg font-semibold tracking-tight text-ink", wordmarkClassName)}>
        {env.appName}
      </span>
    </span>
  );
}

export default Logo;
