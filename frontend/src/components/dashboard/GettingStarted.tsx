import { CheckCircle2, Circle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ChecklistStep {
  label: string;
  description: string;
  done: boolean;
  /** Link or button shown for incomplete steps. */
  action?: ReactNode;
  comingSoon?: boolean;
}

function GettingStarted({ steps }: { steps: ChecklistStep[] }) {
  const completed = steps.filter((step) => step.done).length;
  const percent = Math.round((completed / steps.length) * 100);

  return (
    <section
      aria-labelledby="getting-started-heading"
      className="rounded-xl border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="getting-started-heading" className="font-semibold">
            Getting started
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {completed} of {steps.length} steps complete
          </p>
        </div>
        <div
          className="h-2 w-40 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ol className="mt-5 divide-y divide-line">
        {steps.map((step) => (
          <li key={step.label} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {step.done ? (
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-green-600"
                  aria-hidden="true"
                />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-slate-300" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", step.done && "text-muted line-through")}>
                  {step.label}
                  <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                </p>
                <p className="text-sm text-muted">{step.description}</p>
              </div>
            </div>
            {!step.done && (step.comingSoon || step.action) && (
              <div className="shrink-0 pl-8 sm:pl-0">
                {step.comingSoon ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-muted">
                    Coming soon
                  </span>
                ) : (
                  step.action
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default GettingStarted;
