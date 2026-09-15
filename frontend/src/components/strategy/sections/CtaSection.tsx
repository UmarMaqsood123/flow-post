import Badge from "@/components/ui/Badge";
import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import { BRAND_GOAL_OPTIONS } from "@/config/brandProfile";
import { optionLabel, STRATEGY_LIMITS as LIMITS } from "@/config/contentStrategy";
import type { CallToAction, CtaStrategy } from "@/types/contentStrategy";
import { nestErrors } from "../errorPaths";
import { ListEditor, SelectField } from "../fields";
import StrategySection, { type SectionProps } from "../StrategySection";
import { Detail, EmptyNote, Prose } from "../view";

function CtaSection(props: SectionProps<CtaStrategy>) {
  return (
    <StrategySection
      {...props}
      section="ctaStrategy"
      renderView={(strategy) => (
        <div className="flex flex-col gap-5">
          <Prose text={strategy.summary} />
          <Detail label="Primary goal">
            <Badge tone="primary">{optionLabel(BRAND_GOAL_OPTIONS, strategy.primaryGoal)}</Badge>
          </Detail>
          <Detail label="Calls to action">
            {strategy.ctas.length === 0 ? (
              <EmptyNote>No calls to action yet.</EmptyNote>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {strategy.ctas.map((cta) => (
                  <li
                    key={cta.text}
                    className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">“{cta.text}”</p>
                      {cta.placement && (
                        <p className="mt-0.5 text-xs text-muted">{cta.placement}</p>
                      )}
                    </div>
                    <Badge className="self-start">
                      {optionLabel(BRAND_GOAL_OPTIONS, cta.goal)}
                    </Badge>
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
          <SelectField
            label="Primary goal"
            options={BRAND_GOAL_OPTIONS}
            value={value.primaryGoal}
            onChange={(primaryGoal) => onChange({ ...value, primaryGoal })}
            error={errorAt("primaryGoal")}
          />
          <ListEditor
            label="Calls to action"
            itemName="CTA"
            items={value.ctas}
            max={LIMITS.ctas}
            createItem={(): CallToAction => ({ text: "", goal: value.primaryGoal, placement: "" })}
            onChange={(ctas) => onChange({ ...value, ctas })}
            errorAt={nestErrors(errorAt, "ctas")}
            renderItem={(cta, update, itemError) => (
              <>
                <TextField
                  label="Text"
                  maxLength={LIMITS.item}
                  value={cta.text}
                  onChange={(event) => update({ ...cta, text: event.target.value })}
                  error={itemError("text")}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Goal"
                    options={BRAND_GOAL_OPTIONS}
                    value={cta.goal}
                    onChange={(goal) => update({ ...cta, goal })}
                    error={itemError("goal")}
                  />
                  <TextField
                    label="Where to use it"
                    maxLength={LIMITS.item}
                    value={cta.placement}
                    onChange={(event) => update({ ...cta, placement: event.target.value })}
                    error={itemError("placement")}
                  />
                </div>
              </>
            )}
          />
        </>
      )}
    />
  );
}

export default CtaSection;
