import { Filter, X } from "lucide-react";
import Button from "@/components/ui/Button";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import { CREATE_PLATFORM_OPTIONS, POST_STATUS_OPTIONS } from "@/config/post";
import { type CalendarFilterState, countFilters, emptyFilters } from "./filterState";

interface CalendarFiltersProps {
  filters: CalendarFilterState;
  onChange: (filters: CalendarFilterState) => void;
  /** Pillars from the active strategy plus any already used by posts. */
  pillarOptions: string[];
  onClose: () => void;
}

function CalendarFilters({ filters, onChange, pillarOptions, onClose }: CalendarFiltersProps) {
  const active = countFilters(filters);

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Filter className="size-4 text-muted" aria-hidden="true" />
          Filters
        </h2>
        <div className="flex items-center gap-2">
          {active > 0 && (
            <Button
              variant="secondary"
              className="px-2.5 py-1 text-xs"
              onClick={() => onChange(emptyFilters())}
            >
              Clear all
            </Button>
          )}
          <button
            type="button"
            aria-label="Hide filters"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-muted hover:bg-slate-100 hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <ChoiceGroup
          label="Platforms"
          layout="chips"
          multiple
          options={CREATE_PLATFORM_OPTIONS.map(({ value, label }) => ({ value, label }))}
          value={filters.platforms}
          onChange={(platforms) => onChange({ ...filters, platforms })}
        />
        <ChoiceGroup
          label="Statuses"
          layout="chips"
          multiple
          options={POST_STATUS_OPTIONS}
          value={filters.statuses}
          onChange={(statuses) => onChange({ ...filters, statuses })}
        />
        {pillarOptions.length > 0 && (
          <ChoiceGroup
            label="Content pillars"
            layout="chips"
            multiple
            options={pillarOptions.map((pillar) => ({ value: pillar, label: pillar }))}
            value={filters.pillars}
            onChange={(pillars) => onChange({ ...filters, pillars })}
          />
        )}
      </div>
    </section>
  );
}

export default CalendarFilters;
