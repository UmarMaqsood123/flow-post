import { Search } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import Dropdown from "@/components/ui/Dropdown";

/**
 * Search box that waits for typing to pause before updating the filter.
 * Give it `key={value}` if the value can change from outside (e.g. back button).
 */
export function SearchFilter({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <label className="relative flex min-w-0 flex-1 sm:max-w-xs">
      <span className="sr-only">{label}</span>
      <Search
        className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        className="w-full rounded-md border border-line bg-surface py-2 pr-3 pl-9 text-sm"
      />
    </label>
  );
}

export function SelectFilter({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** The "no filter" choice; pass null for filters that always have a value. */
  allLabel?: string | null;
}) {
  const choices = [
    ...(allLabel === null ? [] : [{ value: "", name: allLabel }]),
    ...options.map((option) => ({ value: option.value, name: option.label })),
  ];
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted" aria-hidden="true">
        {label}
      </span>
      <Dropdown
        ariaLabel={label}
        size="sm"
        options={choices}
        selected={choices.find((choice) => choice.value === value) ?? choices[0] ?? null}
        onChange={(choice) => onChange(choice.value)}
        className="min-w-36"
        menuClassName="w-64"
      />
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}
