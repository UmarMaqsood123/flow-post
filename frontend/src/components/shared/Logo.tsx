import { useId } from "react";
import { env } from "@/config/env";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Classes for the "FlowPost" wordmark, e.g. `hidden sm:inline` to show only the mark on phones. */
  wordmarkClassName?: string;
}

/**
 * The FlowPost mark: an "F" whose top stroke flows forward into an arrow, for
 * posts moving out to each platform. Keep public/favicon.svg in sync.
 */
function Logo({ className, wordmarkClassName }: LogoProps) {
  // Unique per instance: the header and footer both render a logo on the same page.
  const gradientId = useId();

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            y1="0"
            x2="32"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#6366f1" />
            <stop offset="1" stopColor="#4338ca" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
        <g
          fill="none"
          stroke="#fff"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(-1.4 1.4)"
        >
          <path d="M10.5 24V14a5 5 0 0 1 5-5h6.5M10.5 17.5h7" strokeWidth="3.2" />
          <path d="m20.5 5.25 3.75 3.75-3.75 3.75" strokeWidth="2.6" />
        </g>
      </svg>
      <span className={cn("text-lg font-semibold tracking-tight text-ink", wordmarkClassName)}>
        {env.appName}
      </span>
    </span>
  );
}

export default Logo;
