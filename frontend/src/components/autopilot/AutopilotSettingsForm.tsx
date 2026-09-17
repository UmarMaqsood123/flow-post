import { type FormEvent, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import TagInput from "@/components/ui/TagInput";
import TextField from "@/components/ui/TextField";
import { AUTOPILOT_FORMAT_OPTIONS, WEEKDAY_OPTIONS } from "@/config/autopilot";
import { PLATFORM_MEDIA_RULES } from "@/config/media";
import { CREATE_PLATFORM_OPTIONS, platformLabel } from "@/config/post";
import { ApiError } from "@/lib/apiError";
import { getErrorMessage } from "@/lib/forms";
import type {
  AutopilotOverview,
  AutopilotSettings,
  AutopilotSettingsPayload,
} from "@/types/autopilot";
import type { SocialAccount } from "@/types/socialAccount";
import Dropdown from "@/components/ui/Dropdown";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const toForm = (settings: AutopilotSettings): AutopilotSettingsPayload => ({
  platforms: settings.platforms,
  accounts: settings.accounts,
  postsPerWeek: settings.postsPerWeek,
  postingDays: settings.postingDays,
  postingTimes: settings.postingTimes,
  pillars: settings.pillars,
  formats: settings.formats,
  approvalRequired: settings.approvalRequired,
  maxPostsPerDay: settings.maxPostsPerDay,
});

/** "9:5" and "0930" become "09:05" and "09:30"; anything else is left for validation. */
const normalizeTime = (value: string) => {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(value.trim());
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : value.trim();
};

/** Field errors from the API, keyed by top-level field. */
const fieldErrorsOf = (error: unknown): Record<string, string> => {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};
  const errors: Record<string, string> = {};
  for (const detail of error.details as { path?: unknown; message?: unknown }[]) {
    if (typeof detail.path === "string" && typeof detail.message === "string") {
      errors[detail.path.split(".")[0]] ??= detail.message;
    }
  }
  return errors;
};

interface AutopilotSettingsFormProps {
  overview: AutopilotOverview;
  accounts: SocialAccount[];
  strategyPillars: string[];
  canEdit: boolean;
  isSaving: boolean;
  error: unknown;
  onSave: (payload: AutopilotSettingsPayload) => void;
}

function AutopilotSettingsForm({
  overview,
  accounts,
  strategyPillars,
  canEdit,
  isSaving,
  error,
  onSave,
}: AutopilotSettingsFormProps) {
  const { plan } = overview;
  const [form, setForm] = useState(() => toForm(overview.settings));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const errors = { ...fieldErrorsOf(error), ...localErrors };
  const set = <K extends keyof AutopilotSettingsPayload>(
    key: K,
    value: AutopilotSettingsPayload[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const slotsPerWeek = form.postingDays.length * form.postingTimes.length;
  const mediaPlatforms = form.platforms.filter(
    (platform) => PLATFORM_MEDIA_RULES[platform].required,
  );
  const unusedStrategyPillars = strategyPillars.filter((pillar) => !form.pillars.includes(pillar));

  const accountsFor = (platform: AutopilotSettingsPayload["platforms"][number]) =>
    accounts.filter((account) => account.platform === platform && account.status === "CONNECTED");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const postingTimes = form.postingTimes.map(normalizeTime);
    const invalid = postingTimes.find((time) => !TIME_PATTERN.test(time));
    if (invalid) {
      setLocalErrors({ postingTimes: `"${invalid}" isn't a 24-hour time like 09:30.` });
      return;
    }
    setLocalErrors({});
    onSave({
      ...form,
      postingTimes,
      accounts: form.accounts.filter((choice) => form.platforms.includes(choice.platform)),
    });
  };

  const formError = error && Object.keys(fieldErrorsOf(error)).length === 0 ? error : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <fieldset disabled={!canEdit || isSaving} className="flex min-w-0 flex-col gap-6">
        <ChoiceGroup
          label="Platforms"
          layout="chips"
          multiple
          maxSelected={plan.autopilotPlatforms}
          options={CREATE_PLATFORM_OPTIONS}
          value={form.platforms}
          onChange={(platforms) => set("platforms", platforms)}
          error={errors.platforms}
          hint="Every post Autopilot writes goes to each platform you choose."
        />
        {mediaPlatforms.length > 0 && (
          <Alert variant="info">
            {mediaPlatforms.map(platformLabel).join(" and ")}{" "}
            {mediaPlatforms.length === 1 ? "needs" : "need"} an image or video. Autopilot writes the
            caption and holds the post in the review queue until someone attaches media, even with
            approval off.
          </Alert>
        )}

        {form.platforms.map((platform) => {
          const options = accountsFor(platform);
          if (options.length < 2) return null;
          const chosen = form.accounts.find((choice) => choice.platform === platform);
          return (
            <Dropdown
              key={platform}
              label={`${platformLabel(platform)} account`}
              placeholder="Choose an account"
              disabled={!canEdit || isSaving}
              options={options.map((account) => ({ value: account.id, name: account.accountName }))}
              selected={
                chosen
                  ? {
                      value: chosen.socialAccountId,
                      name:
                        options.find((account) => account.id === chosen.socialAccountId)
                          ?.accountName ?? "Account no longer connected",
                    }
                  : null
              }
              onChange={(option) =>
                set("accounts", [
                  ...form.accounts.filter((choice) => choice.platform !== platform),
                  { platform, socialAccountId: option.value },
                ])
              }
            />
          );
        })}

        <ChoiceGroup
          label="Posting days"
          layout="chips"
          multiple
          options={WEEKDAY_OPTIONS}
          value={form.postingDays}
          onChange={(days) =>
            set(
              "postingDays",
              WEEKDAY_OPTIONS.map((option) => option.value).filter((day) => days.includes(day)),
            )
          }
          error={errors.postingDays}
        />

        <TagInput
          label="Posting times"
          value={form.postingTimes}
          onChange={(times) => set("postingTimes", times.map(normalizeTime))}
          placeholder="09:30"
          maxItems={6}
          maxLength={5}
          error={errors.postingTimes}
          hint="24-hour times on your workspace clock. Press Enter after each one."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Posts per week"
            type="number"
            min={1}
            max={plan.autopilotPostsPerWeek}
            value={form.postsPerWeek}
            onChange={(event) => set("postsPerWeek", Number(event.target.value))}
            error={errors.postsPerWeek}
            hint={`Your ${plan.label} plan allows ${plan.autopilotPostsPerWeek}. Your days and times give ${slotsPerWeek} slots.`}
          />
          <TextField
            label="Most posts per day"
            type="number"
            min={1}
            max={plan.autopilotPostsPerDay}
            value={form.maxPostsPerDay}
            onChange={(event) => set("maxPostsPerDay", Number(event.target.value))}
            error={errors.maxPostsPerDay}
            hint="Counts everything publishing that day, not only Autopilot's posts."
          />
        </div>

        <div className="flex flex-col gap-2">
          <TagInput
            label="Content pillars"
            optional
            value={form.pillars}
            onChange={(pillars) => set("pillars", pillars)}
            maxItems={8}
            maxLength={120}
            commaSeparates={false}
            error={errors.pillars}
            hint="Autopilot rotates through these. Leave empty to let it pick from your brand and strategy."
          />
          {canEdit && unusedStrategyPillars.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              From your active strategy:
              {unusedStrategyPillars.map((pillar) => (
                <button
                  key={pillar}
                  type="button"
                  className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-ink hover:bg-slate-50"
                  onClick={() => set("pillars", [...form.pillars, pillar].slice(0, 8))}
                >
                  + {pillar}
                </button>
              ))}
            </div>
          )}
        </div>

        <ChoiceGroup
          label="Content formats"
          layout="chips"
          multiple
          options={AUTOPILOT_FORMAT_OPTIONS}
          value={form.formats}
          onChange={(formats) => set("formats", formats)}
          error={errors.formats}
          hint="Autopilot rotates through the formats you choose."
        />

        <ChoiceGroup
          label="Approval"
          options={[
            {
              value: "on",
              label: "Approve every post",
              description:
                "Posts wait in the review queue. Nothing publishes until someone approves it.",
            },
            {
              value: "off",
              label: "Publish automatically",
              description:
                "Posts that pass the repeat and quality checks are scheduled and published on their own.",
            },
          ]}
          value={form.approvalRequired ? "on" : "off"}
          onChange={(value) => set("approvalRequired", value === "on")}
        />
        {!form.approvalRequired && (
          <Alert variant="warning">
            With approval off, posts go live without anyone reading them first. Pausing Autopilot
            stops them straight away.
          </Alert>
        )}
      </fieldset>

      {formError !== null && <Alert variant="error">{getErrorMessage(formError)}</Alert>}

      {canEdit && (
        <div>
          <Button type="submit" isLoading={isSaving}>
            Save settings
          </Button>
        </div>
      )}
    </form>
  );
}

export default AutopilotSettingsForm;
