import ChoiceGroup from "@/components/ui/ChoiceGroup";
import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import { SOCIAL_PLATFORM_OPTIONS } from "@/config/brandProfile";
import { optionLabel, STRATEGY_LIMITS as LIMITS, WEEKDAY_OPTIONS } from "@/config/contentStrategy";
import type { PlatformSchedule, PostingFrequencyPlan } from "@/types/contentStrategy";
import { nestErrors } from "../errorPaths";
import { ListEditor, NumberField, SelectField } from "../fields";
import StrategySection, { type SectionProps } from "../StrategySection";
import { EmptyNote, Prose } from "../view";

const platformTotal = (plan: PostingFrequencyPlan) =>
  plan.platforms.reduce((sum, platform) => sum + platform.postsPerWeek, 0);

function PostingFrequencySection(props: SectionProps<PostingFrequencyPlan>) {
  return (
    <StrategySection
      {...props}
      section="postingFrequency"
      renderView={(plan) => (
        <div className="flex flex-col gap-5">
          <p className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{plan.postsPerWeek}</span>
            <span className="text-sm text-muted">
              {plan.postsPerWeek === 1 ? "post" : "posts"} per week
            </span>
          </p>
          <Prose text={plan.summary} />
          {plan.platforms.length === 0 ? (
            <EmptyNote>No platform schedule yet.</EmptyNote>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Platform
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Posts / week
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Best days
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Timing
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {plan.platforms.map((schedule) => (
                    <tr key={schedule.platform}>
                      <td className="px-3 py-2 font-medium">
                        {optionLabel(SOCIAL_PLATFORM_OPTIONS, schedule.platform)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{schedule.postsPerWeek}</td>
                      <td className="px-3 py-2">
                        {schedule.bestDays.length > 0
                          ? schedule.bestDays
                              .map((day) => optionLabel(WEEKDAY_OPTIONS, day))
                              .join(", ")
                          : "Any day"}
                      </td>
                      <td className="px-3 py-2 text-muted">{schedule.timing || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      renderEditor={({ value, onChange, errorAt }) => {
        const total = platformTotal(value);
        return (
          <>
            <NumberField
              label="Total posts per week"
              className="sm:max-w-56"
              max={LIMITS.postsPerWeek}
              value={value.postsPerWeek}
              onChange={(postsPerWeek) => onChange({ ...value, postsPerWeek })}
              error={errorAt("postsPerWeek")}
              hint={
                value.platforms.length > 0 && total !== value.postsPerWeek
                  ? `The platform schedules below add up to ${total}.`
                  : undefined
              }
            />
            <TextAreaField
              label="Summary"
              rows={3}
              maxLength={LIMITS.summary}
              value={value.summary}
              onChange={(event) => onChange({ ...value, summary: event.target.value })}
              error={errorAt("summary")}
            />
            <ListEditor
              label="Platform schedules"
              itemName="Schedule"
              items={value.platforms}
              max={LIMITS.platforms}
              createItem={(): PlatformSchedule => ({
                platform: "LINKEDIN",
                postsPerWeek: 1,
                bestDays: [],
                timing: "",
              })}
              onChange={(platforms) => onChange({ ...value, platforms })}
              errorAt={nestErrors(errorAt, "platforms")}
              renderItem={(schedule, update, itemError) => (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      label="Platform"
                      options={SOCIAL_PLATFORM_OPTIONS}
                      value={schedule.platform}
                      onChange={(platform) => update({ ...schedule, platform })}
                      error={itemError("platform")}
                    />
                    <NumberField
                      label="Posts per week"
                      max={LIMITS.postsPerWeek}
                      value={schedule.postsPerWeek}
                      onChange={(postsPerWeek) => update({ ...schedule, postsPerWeek })}
                      error={itemError("postsPerWeek")}
                    />
                  </div>
                  <ChoiceGroup
                    label="Best days"
                    layout="chips"
                    multiple
                    options={WEEKDAY_OPTIONS}
                    value={schedule.bestDays}
                    onChange={(bestDays) => update({ ...schedule, bestDays })}
                    error={itemError("bestDays")}
                  />
                  <TextField
                    label="Timing"
                    placeholder="e.g. Weekday mornings"
                    maxLength={LIMITS.item}
                    value={schedule.timing}
                    onChange={(event) => update({ ...schedule, timing: event.target.value })}
                    error={itemError("timing")}
                  />
                </>
              )}
            />
          </>
        );
      }}
    />
  );
}

export default PostingFrequencySection;
