import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import TagInput from "@/components/ui/TagInput";
import TextField from "@/components/ui/TextField";
import type { ChoiceOption } from "@/config/brandProfile";
import { STRATEGY_LIMITS } from "@/config/contentStrategy";

import { type ErrorAt, nestErrors } from "./errorPaths";

export type { ErrorAt } from "./errorPaths";

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 text-muted transition-colors hover:bg-slate-100 hover:text-ink disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

interface ListEditorProps<T> {
  label: string;
  /** Singular, e.g. "Segment". */
  itemName: string;
  items: T[];
  onChange: (items: T[]) => void;
  createItem: () => T;
  renderItem: (item: T, update: (item: T) => void, errorAt: ErrorAt, index: number) => ReactNode;
  max: number;
  errorAt: ErrorAt;
}

/** Repeatable group of fields with add, remove and reorder. */
export function ListEditor<T>({
  label,
  itemName,
  items,
  onChange,
  createItem,
  renderItem,
  max,
  errorAt,
}: ListEditorProps<T>) {
  const replace = (index: number, item: T) =>
    onChange(items.map((current, position) => (position === index ? item : current)));
  const remove = (index: number) => onChange(items.filter((_, position) => position !== index));
  const move = (index: number, offset: number) => {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + offset, 0, moved);
    onChange(next);
  };
  const listError = errorAt("");

  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium">{label}</legend>
      {listError && (
        <p data-field-error="true" className="mt-1 text-xs text-red-700">
          {listError}
        </p>
      )}
      {items.length === 0 && <p className="mt-2 text-sm text-muted">None yet.</p>}
      <ol className="mt-3 flex flex-col gap-3">
        {items.map((item, index) => {
          const itemError = errorAt(String(index));
          const position = `${itemName} ${index + 1}`;
          return (
            // Items have no stable id; fields are controlled, so index keys are safe here.
            <li key={index} className="rounded-lg border border-line bg-slate-50/60 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-medium tracking-wide text-muted uppercase">
                  {position}
                </span>
                <div className="flex gap-0.5">
                  <IconButton
                    label={`Move ${position} up`}
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUp aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`Move ${position} down`}
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                  >
                    <ArrowDown aria-hidden="true" />
                  </IconButton>
                  <IconButton label={`Remove ${position}`} onClick={() => remove(index)}>
                    <Trash2 aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
              {itemError && <p className="mb-3 text-xs text-red-700">{itemError}</p>}
              <div className="flex flex-col gap-3">
                {renderItem(
                  item,
                  (next) => replace(index, next),
                  nestErrors(errorAt, index),
                  index,
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {items.length < max ? (
        <Button
          variant="secondary"
          className="mt-3 px-3 py-1.5"
          onClick={() => onChange([...items, createItem()])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add {itemName.toLowerCase()}
        </Button>
      ) : (
        <p className="mt-3 text-xs text-muted">
          You can add up to {max} {itemName.toLowerCase()}s.
        </p>
      )}
    </fieldset>
  );
}

interface TextListFieldProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
  hint?: string;
  max?: number;
  maxLength?: number;
  /** Short labels can be comma-separated; sentences can contain commas. */
  commaSeparates?: boolean;
}

export function TextListField({
  label,
  value,
  onChange,
  error,
  hint,
  max = STRATEGY_LIMITS.items,
  maxLength = STRATEGY_LIMITS.item,
  commaSeparates = false,
}: TextListFieldProps) {
  return (
    <TagInput
      label={label}
      value={value}
      onChange={onChange}
      error={error}
      hint={hint}
      maxItems={max}
      maxLength={maxLength}
      commaSeparates={commaSeparates}
      optional
    />
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max: number;
  error?: string;
  hint?: string;
  className?: string;
}

export function NumberField({
  label,
  value,
  onChange,
  max,
  error,
  hint,
  className,
}: NumberFieldProps) {
  return (
    <TextField
      label={label}
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      step={1}
      value={Number.isFinite(value) ? String(value) : ""}
      onChange={(event) => {
        const next = event.target.valueAsNumber;
        onChange(Number.isNaN(next) ? 0 : next);
      }}
      error={error}
      hint={hint}
      className={className}
    />
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  error?: string;
}

export function SelectField<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: SelectFieldProps<T>) {
  const dropdownOptions = options.map((option) => ({ name: option.label, value: option.value }));
  return (
    <Dropdown
      label={label}
      options={dropdownOptions}
      selected={dropdownOptions.find((option) => option.value === value) ?? null}
      onChange={(option) => onChange(option.value)}
      error={error}
    />
  );
}
