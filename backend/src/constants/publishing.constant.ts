/** A user's intent to publish one post at one time. */
export const SCHEDULE_STATUSES = [
  "SCHEDULED",
  "PROCESSING",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
] as const;
export type ScheduleStatusValue = (typeof SCHEDULE_STATUSES)[number];
export const ScheduleStatus = {
  /** Waiting for its time in the queue. */
  SCHEDULED: "SCHEDULED",
  /** A worker is publishing it now. */
  PROCESSING: "PROCESSING",
  PUBLISHED: "PUBLISHED",
  /** Every attempt failed, or the outcome couldn't be confirmed. */
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<ScheduleStatusValue, ScheduleStatusValue>;

/** One queued execution of a schedule. A schedule gets a new job when it's rescheduled or retried. */
export const PUBLISH_JOB_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;
export type PublishJobStatusValue = (typeof PUBLISH_JOB_STATUSES)[number];
export const PublishJobStatus = {
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<PublishJobStatusValue, PublishJobStatusValue>;

/** One run of a job: attempt 1, 2, 3… Each records whether the platform was actually called. */
export const PUBLISH_ATTEMPT_STATUSES = ["IN_FLIGHT", "SUCCEEDED", "FAILED"] as const;
export type PublishAttemptStatusValue = (typeof PUBLISH_ATTEMPT_STATUSES)[number];
export const PublishAttemptStatus = {
  /** The platform call started; the outcome isn't known yet. */
  IN_FLIGHT: "IN_FLIGHT",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
} as const satisfies Record<PublishAttemptStatusValue, PublishAttemptStatusValue>;

export const PUBLISH_QUEUE_NAME = "publish-post";

/**
 * Why a schedule needs a person to look at it: the platform was called but the
 * answer never arrived (crash, timeout), so republishing might post twice.
 */
export const NEEDS_REVIEW_MESSAGE =
  "We started publishing but never got an answer from the platform. Check the account before trying again — the post may already be live.";

export const PUBLISHING_LIMITS = {
  /** How far ahead a post can be scheduled. */
  maxScheduleDays: 365,
  errorMessage: 500,
  /** Attempts recorded per job before the history is trimmed. */
  attemptsKept: 20,
} as const;
