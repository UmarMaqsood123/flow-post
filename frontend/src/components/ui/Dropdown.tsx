import { Check, ChevronDown, Search } from "lucide-react";
import { type KeyboardEvent, type Ref, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface DropdownOption<T extends string = string> {
  name: string;
  value: T;
  /** Optional secondary line shown under the option name. */
  description?: string;
}

interface DropdownProps<T extends string> {
  options: DropdownOption<T>[];
  selected: DropdownOption<T> | null;
  onChange: (option: DropdownOption<T>) => void;
  placeholder?: string;
  /** Visible label. Use `ariaLabel` instead when there is no visible label. */
  label?: string;
  ariaLabel?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  /** Adds a filter box — use for long lists such as time zones. */
  searchable?: boolean;
  searchPlaceholder?: string;
  size?: "sm" | "md";
  id?: string;
  className?: string;
  /** Extra classes for the options panel, e.g. a wider `w-72`. */
  menuClassName?: string;
  /** Called when the menu closes — wire to react-hook-form's `field.onBlur`. */
  onBlur?: () => void;
  /** Forwarded to the trigger button so forms can focus the field on error. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Accessible custom select (listbox pattern) used instead of native `<select>`.
 * Keyboard: ↑/↓ to move, Home/End, Enter to choose, Escape to close.
 */
function Dropdown<T extends string>({
  options,
  selected,
  onChange,
  placeholder = "Select an option",
  label,
  ariaLabel,
  hint,
  error,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search…",
  size = "md",
  id,
  className,
  menuClassName,
  onBlur,
  ref,
}: DropdownProps<T>) {
  const generatedId = useId();
  const buttonId = id ?? `${generatedId}-button`;
  const labelId = `${generatedId}-label`;
  const listId = `${generatedId}-listbox`;
  const descriptionId = `${generatedId}-description`;
  const description = error ?? hint;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!searchable || !term) return options;
    return options.filter((option) =>
      `${option.name} ${option.value}`.toLowerCase().replaceAll("_", " ").includes(term),
    );
  }, [options, query, searchable]);

  const optionId = (index: number) => `${generatedId}-option-${index}`;

  const openMenu = () => {
    if (disabled) return;
    const selectedIndex = options.findIndex((option) => option.value === selected?.value);
    setQuery("");
    setActiveIndex(Math.max(selectedIndex, 0));
    setOpen(true);
  };

  const closeMenu = ({ restoreFocus = false } = {}) => {
    setOpen(false);
    onBlur?.();
    if (restoreFocus) buttonRef.current?.focus();
  };

  const choose = (option: DropdownOption<T> | undefined) => {
    if (!option) return;
    onChange(option);
    closeMenu({ restoreFocus: true });
  };

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, onBlur]);

  // Focus the search box when the menu opens.
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  // Keep the active option visible while navigating.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled) return;

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    const lastIndex = filtered.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, lastIndex));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(Math.max(lastIndex, 0));
        break;
      case "Enter":
        event.preventDefault();
        choose(filtered[activeIndex]);
        break;
      case " ":
        // Space types into the search box; it only selects when there is no search box.
        if (!searchable) {
          event.preventDefault();
          choose(filtered[activeIndex]);
        }
        break;
      case "Escape":
        event.preventDefault();
        closeMenu({ restoreFocus: true });
        break;
      case "Tab":
        closeMenu();
        break;
    }
  };

  const setButtonRef = (node: HTMLButtonElement | null) => {
    buttonRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  const activeDescendant = open && filtered.length > 0 ? optionId(activeIndex) : undefined;

  return (
    <div ref={containerRef} className={cn("relative flex flex-col gap-1.5", className)}>
      {label && (
        <label id={labelId} htmlFor={buttonId} className="text-sm font-medium">
          {label}
        </label>
      )}

      <button
        ref={setButtonRef}
        id={buttonId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-labelledby={label ? `${labelId} ${buttonId}` : undefined}
        aria-activedescendant={searchable ? undefined : activeDescendant}
        aria-invalid={error ? true : undefined}
        aria-describedby={description ? descriptionId : undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={searchable && open ? undefined : handleKeyDown}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-line bg-surface text-left transition-shadow outline-none",
          "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted",
          size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-3 py-2 text-sm",
          open && "border-primary ring-2 ring-primary/20",
          error && "border-danger focus-visible:border-danger focus-visible:ring-danger/20",
        )}
      >
        <span className={cn("truncate", !selected && "text-muted")}>
          {selected?.name ?? placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute top-full left-0 z-30 mt-1 min-w-full overflow-hidden rounded-md border border-line bg-surface shadow-lg",
            "max-w-[calc(100vw-2rem)]",
            menuClassName,
          )}
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search aria-hidden="true" className="size-4 shrink-0 text-muted" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                aria-activedescendant={activeDescendant}
                aria-autocomplete="list"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
          )}

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            aria-label={label ? undefined : ariaLabel}
            className="max-h-60 overflow-y-auto py-1"
          >
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted">No matches</li>}
            {filtered.map((option, index) => {
              const isSelected = option.value === selected?.value;
              const isActive = index === activeIndex;
              return (
                <li
                  key={option.value || `empty-${index}`}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  // Keep focus on the trigger/search box while clicking.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex cursor-pointer items-start justify-between gap-3 px-3 py-2 text-sm",
                    isActive && "bg-slate-100",
                    isSelected && "font-medium text-primary",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.name}</span>
                    {option.description && (
                      <span className="mt-0.5 block text-xs font-normal text-muted">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {description && (
        <p id={descriptionId} className={cn("text-xs", error ? "text-red-700" : "text-muted")}>
          {description}
        </p>
      )}
    </div>
  );
}

export default Dropdown;
