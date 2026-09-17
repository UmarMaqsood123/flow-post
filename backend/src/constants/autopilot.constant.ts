export const AUTOPILOT_STATUSES = ["OFF", "ACTIVE", "PAUSED"] as const;
export type AutopilotStatusValue = (typeof AUTOPILOT_STATUSES)[number];

/**
 * The shape of a post Autopilot writes. These are writing formats, not media
 * formats: Autopilot writes text, and platforms that need an image or video hold
 * the post until someone attaches one.
 */
export const AUTOPILOT_FORMATS = {
  TIPS: { label: "Practical tips", brief: "a short set of practical, specific tips" },
  HOW_TO: { label: "How-to", brief: "a step-by-step walkthrough of how to do one thing" },
  LIST: { label: "List", brief: "a numbered list of ideas, mistakes or reasons" },
  STORY: { label: "Story", brief: "a short story or lesson learned, told from the brand's side" },
  QUESTION: {
    label: "Question",
    brief: "a post built around one question that invites the audience to reply",
  },
  MYTH_VS_FACT: { label: "Myth vs fact", brief: "a common myth, then what's actually true" },
  BEHIND_THE_SCENES: {
    label: "Behind the scenes",
    brief: "how something at the business is actually done",
  },
  OPINION: { label: "Opinion", brief: "a clear, reasoned point of view on a common belief" },
} as const;
export type AutopilotFormatValue = keyof typeof AUTOPILOT_FORMATS;
export const AUTOPILOT_FORMAT_VALUES = Object.keys(AUTOPILOT_FORMATS) as AutopilotFormatValue[];

export const AUTOPILOT_WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
export type AutopilotWeekdayValue = (typeof AUTOPILOT_WEEKDAYS)[number];

export const SLOT_STATUSES = [
  /** A future posting time with nothing written yet. */
  "PLANNED",
  /** A worker is choosing a topic and writing. */
  "GENERATING",
  /** Posts were written; each post carries its own status from here. */
  "GENERATED",
  /** Not written on purpose: limits, a missed time, or settings changed. */
  "SKIPPED",
  /** Writing failed on every attempt. */
  "FAILED",
] as const;
export type SlotStatusValue = (typeof SLOT_STATUSES)[number];

/** Why an Autopilot post is waiting for a person instead of being scheduled. */
export const HOLD_REASONS = {
  APPROVAL_REQUIRED: "Waiting for approval",
  NEEDS_MEDIA: "Needs an image or video before it can publish",
  QUALITY_REVIEW: "Flagged by the quality check",
  DAILY_LIMIT: "The daily publishing limit was reached",
  SCHEDULING_FAILED: "Couldn't be scheduled",
  PAUSED: "Taken off the schedule when Autopilot was paused",
  EXPIRED: "Its posting time passed before it was approved",
} as const;
export type HoldReasonValue = keyof typeof HOLD_REASONS;
export const HOLD_REASON_VALUES = Object.keys(HOLD_REASONS) as HoldReasonValue[];

/** Everything that goes into the audit trail. Events are never updated or deleted. */
export const AUTOPILOT_EVENT_TYPES = [
  "SETTINGS_UPDATED",
  "STARTED",
  "PAUSED",
  "AUTO_PAUSED",
  "SLOTS_PLANNED",
  "SLOTS_CLEARED",
  "SLOT_SKIPPED",
  "TOPIC_SELECTED",
  "DUPLICATE_REJECTED",
  "QUALITY_REJECTED",
  "CONTENT_GENERATED",
  "GENERATION_FAILED",
  "GENERATION_DISCARDED",
  "HELD_FOR_REVIEW",
  "SCHEDULED",
  "APPROVED",
  "REJECTED",
  "APPROVAL_EXPIRED",
  "UNSCHEDULED",
  "PUBLISHED",
  "PUBLISH_FAILED",
  "PUBLISH_BLOCKED",
] as const;
export type AutopilotEventTypeValue = (typeof AUTOPILOT_EVENT_TYPES)[number];

export const AUTOPILOT_LIMITS = {
  pillars: 8,
  pillar: 120,
  postingTimes: 6,
  /** Hard ceiling on the settings form, above any plan. */
  postsPerWeek: 50,
  postsPerDay: 30,
  pauseReason: 300,
  rejectReason: 300,
} as const;

/** Tuning for the pipeline. Named so tests and docs can refer to them. */
export const AUTOPILOT_RULES = {
  /** How far ahead posting times are planned. */
  planningHorizonDays: 7,
  /** With approval on, write this far ahead so there's time to review. */
  approvalLeadHours: 72,
  /** With approval off, write this far ahead. */
  autoLeadHours: 24,
  /** A slot closer than this can't be written and scheduled safely, so it's skipped. */
  minimumLeadMinutes: 30,
  maxGenerationAttempts: 3,
  /** First retry delay after a failed generation; doubles each attempt. */
  generationRetryBaseMs: 5 * 60_000,
  /** A GENERATING slot untouched this long was left by a crashed worker. */
  generationLockTimeoutMs: 15 * 60_000,
  /** Consecutive failures that pause Autopilot on its own. */
  autoPauseAfterGenerationFailures: 3,
  autoPauseAfterPublishFailures: 3,
  /** Slots written per workspace per sweep, so one workspace can't hog the worker. */
  maxSlotsPerSweep: 2,
  /** How far back topics, hooks and posts are compared for repeats. */
  duplicateLookbackDays: 180,
  /** Topic candidates asked for per AI call. */
  topicCandidates: 3,
  /** Word-overlap thresholds (Jaccard) that count as a repeat. */
  topicSimilarity: 0.6,
  hookSimilarity: 0.7,
  postSimilarity: 0.5,
  /** Recent hooks shown to the AI as "don't reuse". */
  hooksInPrompt: 25,
  topicsInPrompt: 40,
} as const;
