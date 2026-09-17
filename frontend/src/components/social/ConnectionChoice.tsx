import { Check } from "lucide-react";
import { useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { getErrorMessage } from "@/lib/forms";
import { cn } from "@/lib/utils";
import type { ConnectionTarget } from "@/types/socialAccount";

interface ConnectionChoiceProps {
  platformName: string;
  targets: ConnectionTarget[];
  isLoading: boolean;
  isSaving: boolean;
  error: unknown;
  onConnect: (targetId: string) => void;
  onCancel: () => void;
}

/**
 * Shown when one authorization covers several accounts: a Facebook login
 * usually grants every Page the user manages, and only they know which one
 * this workspace publishes to.
 */
function ConnectionChoice({
  platformName,
  targets,
  isLoading,
  isSaving,
  error,
  onConnect,
  onCancel,
}: ConnectionChoiceProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const choice = selected ?? targets[0]?.id ?? null;

  return (
    <section
      aria-labelledby="choose-account-heading"
      className="rounded-xl border border-line bg-surface p-5"
    >
      <h2 id="choose-account-heading" className="text-lg font-semibold">
        Which {platformName} account should FlowPost use?
      </h2>
      <p className="mt-1 text-sm text-muted">
        You gave FlowPost access to more than one. Pick the one this workspace publishes to; you can
        connect the others later.
      </p>

      {isLoading ? (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {targets.map((target) => {
            const isSelected = target.id === choice;
            return (
              <li key={target.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelected(target.id)}
                  disabled={isSaving}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-line hover:bg-slate-50 dark:hover:bg-white/5",
                  )}
                >
                  {target.image ? (
                    <img
                      src={target.image}
                      alt=""
                      className="size-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold dark:bg-white/10">
                      {target.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{target.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {target.username ? `@${target.username}` : target.description}
                    </span>
                  </span>
                  {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {Boolean(error) && (
        <Alert variant="error" className="mt-4">
          {getErrorMessage(error)}
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => choice && onConnect(choice)} disabled={!choice} isLoading={isSaving}>
          Connect
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

export default ConnectionChoice;
