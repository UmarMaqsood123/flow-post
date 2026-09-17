import { CalendarClock, Copy, ExternalLink, Send, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import SchedulePicker from "@/components/schedule/SchedulePicker";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import TextField from "@/components/ui/TextField";
import {
  isPostLocked,
  MANUAL_POST_STATUSES,
  platformLabel,
  POST_LIMITS,
  POST_STATUS_DETAILS,
} from "@/config/post";
import { getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { dayKey, formatDayKey, formatTimeInZone } from "@/lib/timezone";
import type {
  ManualPostStatus,
  Post,
  ScheduleHistory,
  SchedulePostInput,
  ScheduleStatus,
} from "@/types/post";
import type { SocialAccount } from "@/types/socialAccount";

const statusOptions = MANUAL_POST_STATUSES.map((status) => ({
  name: POST_STATUS_DETAILS[status].label,
  value: status,
}));

const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  SCHEDULED: "Queued",
  PROCESSING: "Publishing now",
  PUBLISHED: "Published",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

const SCHEDULE_STATUS_TONES: Record<ScheduleStatus, "primary" | "success" | "danger" | "neutral"> =
  {
    SCHEDULED: "primary",
    PROCESSING: "primary",
    PUBLISHED: "success",
    FAILED: "danger",
    CANCELLED: "neutral",
  };

interface PostDetailsPanelProps {
  post: Post;
  timeZone: string;
  canEdit: boolean;
  pillarOptions: string[];
  /** Connected accounts for this post's platform. */
  accounts: SocialAccount[];
  /** The publish schedule and its attempt history, when the post has one. */
  schedule: ScheduleHistory | undefined;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onStatusChange: (status: ManualPostStatus) => void;
  onSaveDetails: (details: { topic: string; pillar: string | null }) => void;
  onSchedule: (input: SchedulePostInput) => void;
  onUnschedule: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function PostDetailsPanel({
  post,
  timeZone,
  canEdit,
  pillarOptions,
  accounts,
  schedule,
  busy,
  error,
  onClose,
  onStatusChange,
  onSaveDetails,
  onSchedule,
  onUnschedule,
  onDuplicate,
  onDelete,
}: PostDetailsPanelProps) {
  const pillarListId = useId();
  const scheduled = post.scheduledAt ? new Date(post.scheduledAt) : null;
  const [topic, setTopic] = useState(post.brief.topic);
  const [pillar, setPillar] = useState(post.pillar ?? "");
  const publish = schedule?.schedule ?? null;
  const lastJob = schedule?.jobs.at(-1) ?? null;

  const locked = isPostLocked(post.status);
  const editable = canEdit && !locked;
  const detailsChanged = topic.trim() !== post.brief.topic || pillar.trim() !== (post.pillar ?? "");
  const status = POST_STATUS_DETAILS[post.status];

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{platformLabel(post.platform)}</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {scheduled
              ? `${formatDayKey(dayKey(scheduled, timeZone), { weekday: "short", day: "numeric", month: "short" })} at ${formatTimeInZone(scheduled, timeZone)}`
              : "Not scheduled"}
            {` · v${post.versionCount}`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close details"
          onClick={onClose}
          className="cursor-pointer rounded-md p-1 text-muted hover:bg-slate-100 hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {locked && (
        <Alert variant="info" className="mt-4">
          {post.status === "PUBLISHED"
            ? "This post has been published. Duplicate it to work on a new version."
            : "This post is being published right now."}
        </Alert>
      )}

      {post.currentVersion && (
        <p className="mt-4 line-clamp-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-line text-muted">
          {post.currentVersion.content.text}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4">
        <Dropdown
          label="Status"
          size="sm"
          options={statusOptions}
          selected={statusOptions.find((option) => option.value === post.status) ?? null}
          onChange={(option) => onStatusChange(option.value as ManualPostStatus)}
          disabled={!editable || busy}
          hint={
            post.status === "SCHEDULED"
              ? "Scheduled posts leave the queue when you pick another status."
              : undefined
          }
        />

        <div className="flex flex-col gap-3">
          <TextField
            label="Topic"
            maxLength={POST_LIMITS.topic}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            disabled={!editable || busy}
          />
          <datalist id={pillarListId}>
            {pillarOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <TextField
            label="Content pillar"
            list={pillarListId}
            maxLength={POST_LIMITS.pillar}
            value={pillar}
            onChange={(event) => setPillar(event.target.value)}
            disabled={!editable || busy}
          />
          {editable && (
            <Button
              variant="secondary"
              className="self-start px-3 py-1.5 text-sm"
              onClick={() => onSaveDetails({ topic: topic.trim(), pillar: pillar.trim() || null })}
              disabled={!detailsChanged || busy}
            >
              Save details
            </Button>
          )}
        </div>

        <div className="border-t border-line pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4 text-muted" aria-hidden="true" />
            Schedule
          </h3>
          <SchedulePicker
            post={post}
            blockedReason={post.currentVersion?.mediaIssue ?? null}
            timeZone={timeZone}
            accounts={accounts}
            editable={editable}
            busy={busy}
            onSchedule={onSchedule}
            onUnschedule={onUnschedule}
            headless
          />
        </div>

        {publish && (
          <div className="border-t border-line pt-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Send className="size-4 text-muted" aria-hidden="true" />
              Publishing
            </h3>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Status</dt>
                <dd>
                  <Badge tone={SCHEDULE_STATUS_TONES[publish.status]}>
                    {SCHEDULE_STATUS_LABELS[publish.status]}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Attempts</dt>
                <dd className="tabular-nums">
                  {publish.attempts} of {publish.maxAttempts}
                </dd>
              </div>
              {publish.publishedAt && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Published</dt>
                  <dd>{formatTimeInZone(publish.publishedAt, timeZone)}</dd>
                </div>
              )}
            </dl>

            {publish.result?.url && (
              <a
                href={publish.result.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                View on {platformLabel(post.platform)}
              </a>
            )}

            {publish.needsReview && (
              <Alert variant="warning" className="mt-3" title="Check the platform">
                {publish.lastError?.message ??
                  "We couldn't confirm whether this post went out. Check the account before scheduling it again."}
              </Alert>
            )}
            {!publish.needsReview && publish.status === "FAILED" && publish.lastError && (
              <Alert variant="error" className="mt-3">
                {publish.lastError.message}
              </Alert>
            )}
            {lastJob && lastJob.attemptHistory.length > 1 && (
              <p className="mt-2 text-xs text-muted">
                Last attempt {lastJob.attemptHistory.at(-1)?.status.toLowerCase()} ·{" "}
                {lastJob.attemptHistory.length} tries
              </p>
            )}
          </div>
        )}

        {Boolean(error) && <Alert variant="error">{getErrorMessage(error)}</Alert>}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Link
            to={`${paths.aiCreate}?post=${post.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Open in AI Create
          </Link>
          {canEdit && (
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-sm"
              onClick={onDuplicate}
              disabled={busy}
            >
              <Copy className="size-4" aria-hidden="true" />
              Duplicate
            </Button>
          )}
          {canEdit && (
            <Button
              variant="danger"
              className="px-3 py-1.5 text-sm"
              onClick={onDelete}
              disabled={busy}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

export default PostDetailsPanel;
