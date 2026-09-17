import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { cn } from "@/lib/utils";
import type { AnalyticsRange } from "@/types/analytics";

const PRESETS: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "custom", label: "Custom" },
];

export interface RangeState {
  range: AnalyticsRange;
  /** `YYYY-MM-DD`, only used when range is "custom". */
  from: string;
  to: string;
}

interface RangeFilterProps {
  value: RangeState;
  onChange: (value: RangeState) => void;
  disabled?: boolean;
}

function RangeFilter({ value, onChange, disabled }: RangeFilterProps) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Date range" className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const isActive = preset.value === value.range;
          return (
            <Button
              key={preset.value}
              variant={isActive ? "primary" : "secondary"}
              aria-pressed={isActive}
              className="px-3 py-1.5 text-sm"
              disabled={disabled}
              onClick={() => onChange({ ...value, range: preset.value })}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>

      {value.range === "custom" && (
        <div className={cn("grid gap-3 sm:max-w-md sm:grid-cols-2")}>
          <TextField
            label="From"
            type="date"
            max={value.to || today}
            value={value.from}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
          />
          <TextField
            label="To"
            type="date"
            min={value.from}
            max={today}
            value={value.to}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export default RangeFilter;
