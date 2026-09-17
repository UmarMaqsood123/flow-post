import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import TextField from "@/components/ui/TextField";
import { platformLabel } from "@/config/post";
import { dayKey, formatDayKey, instantFromDayAndTime, timeKey, zoneLabel } from "@/lib/timezone";
import { paths } from "@/routing/paths";
import type { Post, SchedulePostInput } from "@/types/post";
import type { SocialAccount } from "@/types/socialAccount";

/** Latest a post can be queued, matching PUBLISHING_LIMITS.maxScheduleDays. */
const MAX_SCHEDULE_DAYS = 365;

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

interface SchedulePickerProps {
  post: Post;
  timeZone: string;
  /** Connected accounts for this post's platform. */
  accounts: SocialAccount[];
  editable: boolean;
  busy: boolean;
  onSchedule: (input: SchedulePostInput) => void;
  onUnschedule: () => void;
  /** Why the post can't be scheduled yet (e.g. a TikTok post with no video), or null. */
  blockedReason?: string | null;
  /** Hides the heading where the surrounding panel already has one. */
  headless?: boolean;
  className?: string;
}

/**
 * Date, time and account in one place, used by the post editor and the calendar
 * so scheduling works the same in both. Pressing Schedule always commits to
 * publishing: the backend moves an idea or draft on rather than setting a date
 * that would never fire.
 */
function SchedulePicker({
  post,
  timeZone,
  accounts,
  editable,
  busy,
  onSchedule,
  onUnschedule,
  blockedReason = null,
  headless = false,
  className,
}: SchedulePickerProps) {
  const scheduled = post.scheduledAt ? new Date(post.scheduledAt) : null;
  const [day, setDay] = useState(scheduled ? dayKey(scheduled, timeZone) : "");
  const [time, setTime] = useState(scheduled ? timeKey(scheduled, timeZone) : "09:00");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  const accountOptions = accounts.map((account) => ({
    name: account.accountName,
    value: account.id,
  }));
  const account = accounts.find((option) => option.id === accountId) ?? accounts[0];
  const canPublish = accounts.length > 0;

  const schedule = () =>
    onSchedule({
      scheduledAt: instantFromDayAndTime(day, time, timeZone).toISOString(),
      socialAccountId: accountId || undefined,
      publish: true,
    });

  return (
    <div className={className}>
      {!headless && (
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4 text-muted" aria-hidden="true" />
          Schedule
        </h3>
      )}

      <p className="mt-1 text-xs text-muted">
        {scheduled
          ? `${formatDayKey(dayKey(scheduled, timeZone), { weekday: "short", day: "numeric", month: "short" })} at ${timeKey(scheduled, timeZone)}`
          : "Not scheduled"}
        {` · ${timeZone.replaceAll("_", " ")} (${zoneLabel(timeZone)})`}
      </p>

      {editable && blockedReason && (
        <Alert variant="warning" className="mt-3">
          {blockedReason}
        </Alert>
      )}

      {editable && !canPublish && (
        <Alert variant="info" className="mt-3">
          Connect a {platformLabel(post.platform)} account to publish this post.{" "}
          <Link to={paths.socialAccounts} className="font-medium underline underline-offset-2">
            Connect one
          </Link>
        </Alert>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextField
          label="Date"
          type="date"
          value={day}
          min={dayKey(new Date(), timeZone)}
          max={dayKey(addDays(MAX_SCHEDULE_DAYS), timeZone)}
          onChange={(event) => setDay(event.target.value)}
          disabled={!editable || busy}
        />
        <TextField
          label="Time"
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          disabled={!editable || busy}
        />
      </div>

      {editable && accountOptions.length > 1 && (
        <Dropdown
          label="Publish to"
          size="sm"
          className="mt-3"
          options={accountOptions}
          selected={accountOptions.find((option) => option.value === accountId) ?? null}
          onChange={(option) => setAccountId(option.value)}
          disabled={busy}
        />
      )}

      {editable && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className="px-3 py-1.5 text-sm"
              onClick={schedule}
              disabled={!day || !canPublish || Boolean(blockedReason) || busy}
            >
              {scheduled ? "Reschedule" : "Schedule"}
            </Button>
            {scheduled && (
              <Button
                variant="secondary"
                className="px-3 py-1.5 text-sm"
                onClick={onUnschedule}
                disabled={busy}
              >
                Unschedule
              </Button>
            )}
          </div>
          {canPublish && accountOptions.length === 1 && account && (
            <p className="mt-2 text-xs text-muted">
              Publishing to {platformLabel(post.platform)} as {account.accountName}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default SchedulePicker;
