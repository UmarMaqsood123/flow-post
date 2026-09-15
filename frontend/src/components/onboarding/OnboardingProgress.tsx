import { Check } from "lucide-react";
import { ONBOARDING_POSITIONS, ONBOARDING_STEP_INFO } from "@/config/brandProfile";
import { cn } from "@/lib/utils";
import type { OnboardingPosition } from "@/types/brandProfile";

interface OnboardingProgressProps {
  current: OnboardingPosition;
  percent: number;
  isDone: (position: OnboardingPosition) => boolean;
  canVisit: (position: OnboardingPosition) => boolean;
  onSelect: (position: OnboardingPosition) => void;
  disabled?: boolean;
}

function OnboardingProgress({
  current,
  percent,
  isDone,
  canVisit,
  onSelect,
  disabled = false,
}: OnboardingProgressProps) {
  const currentIndex = ONBOARDING_POSITIONS.indexOf(current);

  return (
    <nav aria-label="Onboarding steps" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="font-medium">
          Step {currentIndex + 1} of {ONBOARDING_POSITIONS.length}
          <span className="text-muted"> · {ONBOARDING_STEP_INFO[current].title}</span>
        </p>
        <p className="text-muted">{percent}% complete</p>
      </div>
      <div
        role="progressbar"
        aria-label="Brand profile progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="hidden grid-cols-6 gap-1 sm:grid">
        {ONBOARDING_POSITIONS.map((position, index) => {
          const isCurrent = position === current;
          const done = isDone(position);
          const reachable = !disabled && canVisit(position);
          return (
            <li key={position}>
              <button
                type="button"
                onClick={() => onSelect(position)}
                disabled={isCurrent || !reachable}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-1.5 rounded-md px-1 py-2 text-xs font-medium transition-colors",
                  isCurrent
                    ? "text-primary"
                    : reachable
                      ? "text-ink hover:bg-slate-50"
                      : "text-muted",
                  !isCurrent && !reachable && "cursor-not-allowed",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border",
                    isCurrent && "border-primary bg-primary text-white",
                    !isCurrent && done && "border-primary bg-primary/10 text-primary",
                    !isCurrent && !done && "border-line bg-surface",
                  )}
                >
                  {done && !isCurrent ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="max-w-full truncate">{ONBOARDING_STEP_INFO[position].title}</span>
                {done && <span className="sr-only">(done)</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default OnboardingProgress;
