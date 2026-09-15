import Button from "@/components/ui/Button";
import TextAreaField from "@/components/ui/TextAreaField";
import {
  balancePercentages,
  optionLabel,
  POST_FORMAT_OPTIONS,
  STRATEGY_LIMITS as LIMITS,
} from "@/config/contentStrategy";
import { cn } from "@/lib/utils";
import type { FormatShare, PostFormat } from "@/types/contentStrategy";
import { ListEditor, NumberField, SelectField } from "../fields";
import StrategySection, { type SectionProps } from "../StrategySection";
import { EmptyNote } from "../view";

const newFormat = (existing: FormatShare[]): FormatShare => {
  const used = new Set<PostFormat>(existing.map((item) => item.format));
  const format = POST_FORMAT_OPTIONS.find((option) => !used.has(option.value))?.value ?? "TEXT";
  return { format, sharePercent: 0, purpose: "" };
};

function FormatsSection(props: SectionProps<FormatShare[]>) {
  return (
    <StrategySection
      {...props}
      section="contentFormats"
      renderView={(formats) =>
        formats.length === 0 ? (
          <EmptyNote>No content formats yet.</EmptyNote>
        ) : (
          <ul className="flex flex-col gap-4">
            {formats.map((item) => (
              <li key={item.format}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {optionLabel(POST_FORMAT_OPTIONS, item.format)}
                  </span>
                  <span className="text-muted tabular-nums">{item.sharePercent}%</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-slate-100" aria-hidden="true">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(0, item.sharePercent))}%` }}
                  />
                </div>
                {item.purpose && <p className="mt-1.5 text-xs text-muted">{item.purpose}</p>}
              </li>
            ))}
          </ul>
        )
      }
      renderEditor={({ value, onChange, errorAt }) => {
        const total = value.reduce((sum, item) => sum + item.sharePercent, 0);
        const balanced = value.length === 0 || total === 100;
        return (
          <>
            <ListEditor
              label="Formats"
              itemName="Format"
              items={value}
              max={LIMITS.formats}
              createItem={() => newFormat(value)}
              onChange={onChange}
              errorAt={errorAt}
              renderItem={(item, update, itemError) => (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      label="Format"
                      options={POST_FORMAT_OPTIONS}
                      value={item.format}
                      onChange={(format) => update({ ...item, format })}
                      error={itemError("format")}
                    />
                    <NumberField
                      label="Share of posts (%)"
                      max={100}
                      value={item.sharePercent}
                      onChange={(sharePercent) => update({ ...item, sharePercent })}
                      error={itemError("sharePercent")}
                    />
                  </div>
                  <TextAreaField
                    label="Purpose"
                    rows={2}
                    maxLength={LIMITS.text}
                    value={item.purpose}
                    onChange={(event) => update({ ...item, purpose: event.target.value })}
                    error={itemError("purpose")}
                  />
                </>
              )}
            />
            {value.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <p
                  role="status"
                  className={cn("text-sm", balanced ? "text-muted" : "font-medium text-red-700")}
                >
                  Total: {total}%{balanced ? "" : " (shares must add up to 100%)"}
                </p>
                {!balanced && (
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5"
                    onClick={() => {
                      const shares = balancePercentages(value.map((item) => item.sharePercent));
                      onChange(
                        value.map((item, index) => ({ ...item, sharePercent: shares[index] })),
                      );
                    }}
                  >
                    Balance to 100%
                  </Button>
                )}
              </div>
            )}
          </>
        );
      }}
    />
  );
}

export default FormatsSection;
