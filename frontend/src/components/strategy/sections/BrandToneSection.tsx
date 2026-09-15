import { Check, Quote, X } from "lucide-react";
import TextAreaField from "@/components/ui/TextAreaField";
import { STRATEGY_LIMITS as LIMITS } from "@/config/contentStrategy";
import type { BrandTone } from "@/types/contentStrategy";
import { TextListField } from "../fields";
import StrategySection, { type SectionProps } from "../StrategySection";
import { Chips, Detail, EmptyNote, Prose } from "../view";

function IconList({ items, icon }: { items: string[]; icon: "do" | "dont" }) {
  if (items.length === 0) return <EmptyNote>None</EmptyNote>;
  const Icon = icon === "do" ? Check : X;
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <Icon
            className={
              icon === "do"
                ? "mt-0.5 size-4 shrink-0 text-green-600"
                : "mt-0.5 size-4 shrink-0 text-red-600"
            }
            aria-hidden="true"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function BrandToneSection(props: SectionProps<BrandTone>) {
  return (
    <StrategySection
      {...props}
      section="brandTone"
      renderView={(tone) => (
        <div className="flex flex-col gap-5">
          <Prose text={tone.summary} />
          <Detail label="Voice">
            <Chips labels={tone.voiceAttributes} />
          </Detail>
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="Do">
              <IconList items={tone.dos} icon="do" />
            </Detail>
            <Detail label="Don't">
              <IconList items={tone.donts} icon="dont" />
            </Detail>
          </div>
          <Detail label="Sounds like">
            {tone.examplePhrases.length === 0 ? (
              <EmptyNote>None</EmptyNote>
            ) : (
              <ul className="flex flex-col gap-2">
                {tone.examplePhrases.map((phrase) => (
                  <li key={phrase} className="flex gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <Quote className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span>{phrase}</span>
                  </li>
                ))}
              </ul>
            )}
          </Detail>
        </div>
      )}
      renderEditor={({ value, onChange, errorAt }) => (
        <>
          <TextAreaField
            label="Summary"
            rows={3}
            maxLength={LIMITS.summary}
            value={value.summary}
            onChange={(event) => onChange({ ...value, summary: event.target.value })}
            error={errorAt("summary")}
          />
          <TextListField
            label="Voice attributes"
            value={value.voiceAttributes}
            onChange={(voiceAttributes) => onChange({ ...value, voiceAttributes })}
            maxLength={LIMITS.label}
            commaSeparates
            error={errorAt("voiceAttributes")}
          />
          <TextListField
            label="Do"
            value={value.dos}
            onChange={(dos) => onChange({ ...value, dos })}
            error={errorAt("dos")}
          />
          <TextListField
            label="Don't"
            value={value.donts}
            onChange={(donts) => onChange({ ...value, donts })}
            error={errorAt("donts")}
          />
          <TextListField
            label="Example phrases"
            value={value.examplePhrases}
            onChange={(examplePhrases) => onChange({ ...value, examplePhrases })}
            error={errorAt("examplePhrases")}
          />
        </>
      )}
    />
  );
}

export default BrandToneSection;
