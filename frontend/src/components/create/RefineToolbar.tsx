import { RefreshCw } from "lucide-react";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import { BRAND_TONE_OPTIONS } from "@/config/brandProfile";
import { REFINE_ACTIONS } from "@/config/post";
import type { BrandTone } from "@/types/brandProfile";
import type { RefineAction } from "@/types/post";

interface RefineToolbarProps {
  /** Unsaved edits block AI actions, which would overwrite them. */
  disabledReason: string | null;
  pendingAction: RefineAction | "REGENERATE" | null;
  onRefine: (action: RefineAction, tone?: BrandTone) => void;
  onRegenerate: () => void;
}

const toneOptions = BRAND_TONE_OPTIONS.map((option) => ({
  name: option.label,
  value: option.value,
}));

function RefineToolbar({
  disabledReason,
  pendingAction,
  onRefine,
  onRegenerate,
}: RefineToolbarProps) {
  const [tone, setTone] = useState<BrandTone>("FRIENDLY");
  const busy = pendingAction !== null;
  const disabled = busy || disabledReason !== null;

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-sm"
          onClick={onRegenerate}
          isLoading={pendingAction === "REGENERATE"}
          disabled={disabled}
        >
          {pendingAction !== "REGENERATE" && <RefreshCw className="size-4" aria-hidden="true" />}
          Regenerate
        </Button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
        {REFINE_ACTIONS.map(({ value, label, icon: Icon, needsTone }) => (
          <Button
            key={value}
            variant="secondary"
            className="px-3 py-1.5 text-sm"
            onClick={() => onRefine(value, needsTone ? tone : undefined)}
            isLoading={pendingAction === value}
            disabled={disabled}
          >
            {pendingAction !== value && <Icon className="size-4" aria-hidden="true" />}
            {label}
          </Button>
        ))}
        <Dropdown
          ariaLabel="Tone to change to"
          size="sm"
          className="w-40"
          options={toneOptions}
          selected={toneOptions.find((option) => option.value === tone) ?? null}
          onChange={(option) => setTone(option.value)}
          disabled={disabled}
        />
      </div>
      {disabledReason && <p className="mt-2 text-xs text-muted">{disabledReason}</p>}
    </section>
  );
}

export default RefineToolbar;
