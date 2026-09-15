import ChoiceGroup from "@/components/ui/ChoiceGroup";
import TextAreaField from "@/components/ui/TextAreaField";
import { SOCIAL_PLATFORM_OPTIONS } from "@/config/brandProfile";
import {
  optionLabel,
  POST_FORMAT_OPTIONS,
  STRATEGY_LIMITS as LIMITS,
} from "@/config/contentStrategy";
import type { PlatformPlan } from "@/types/contentStrategy";
import type { SocialPlatform } from "@/types/brandProfile";
import { ListEditor, SelectField } from "../fields";
import StrategySection, { type SectionProps } from "../StrategySection";
import { Chips, Detail, EmptyNote } from "../view";

/** Suggests the first platform that isn't planned yet. */
const newPlan = (existing: PlatformPlan[]): PlatformPlan => {
  const used = new Set<SocialPlatform>(existing.map((plan) => plan.platform));
  const platform =
    SOCIAL_PLATFORM_OPTIONS.find((option) => !used.has(option.value))?.value ?? "LINKEDIN";
  return { platform, role: "", audienceFit: "", contentFocus: "", formats: [] };
};

function PlatformStrategySection(props: SectionProps<PlatformPlan[]>) {
  return (
    <StrategySection
      {...props}
      section="platformStrategy"
      renderView={(plans) =>
        plans.length === 0 ? (
          <EmptyNote>No platforms planned yet.</EmptyNote>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {plans.map((plan) => (
              <article key={plan.platform} className="rounded-lg border border-line p-4">
                <h3 className="font-medium">
                  {optionLabel(SOCIAL_PLATFORM_OPTIONS, plan.platform)}
                </h3>
                {plan.role && <p className="mt-1 text-sm text-muted">{plan.role}</p>}
                <div className="mt-4 flex flex-col gap-4">
                  {plan.audienceFit && (
                    <Detail label="Why it fits">
                      <p className="text-sm">{plan.audienceFit}</p>
                    </Detail>
                  )}
                  {plan.contentFocus && (
                    <Detail label="Content focus">
                      <p className="text-sm">{plan.contentFocus}</p>
                    </Detail>
                  )}
                  <Detail label="Best formats">
                    <Chips
                      labels={plan.formats.map((format) =>
                        optionLabel(POST_FORMAT_OPTIONS, format),
                      )}
                    />
                  </Detail>
                </div>
              </article>
            ))}
          </div>
        )
      }
      renderEditor={({ value, onChange, errorAt }) => (
        <ListEditor
          label="Platforms"
          itemName="Platform"
          items={value}
          max={LIMITS.platforms}
          createItem={() => newPlan(value)}
          onChange={onChange}
          errorAt={errorAt}
          renderItem={(plan, update, itemError) => (
            <>
              <SelectField
                label="Platform"
                options={SOCIAL_PLATFORM_OPTIONS}
                value={plan.platform}
                onChange={(platform) => update({ ...plan, platform })}
                error={itemError("platform")}
              />
              <TextAreaField
                label="Role in the strategy"
                rows={2}
                maxLength={LIMITS.text}
                value={plan.role}
                onChange={(event) => update({ ...plan, role: event.target.value })}
                error={itemError("role")}
              />
              <TextAreaField
                label="Why it fits the audience"
                rows={2}
                maxLength={LIMITS.text}
                value={plan.audienceFit}
                onChange={(event) => update({ ...plan, audienceFit: event.target.value })}
                error={itemError("audienceFit")}
              />
              <TextAreaField
                label="Content focus"
                rows={2}
                maxLength={LIMITS.text}
                value={plan.contentFocus}
                onChange={(event) => update({ ...plan, contentFocus: event.target.value })}
                error={itemError("contentFocus")}
              />
              <ChoiceGroup
                label="Best formats"
                layout="chips"
                multiple
                options={POST_FORMAT_OPTIONS}
                value={plan.formats}
                onChange={(formats) => update({ ...plan, formats })}
                error={itemError("formats")}
              />
            </>
          )}
        />
      )}
    />
  );
}

export default PlatformStrategySection;
