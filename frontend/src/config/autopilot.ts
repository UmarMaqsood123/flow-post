import type {
  AutopilotEventType,
  AutopilotFormat,
  AutopilotWeekday,
  HoldReason,
  SlotStatus,
} from "@/types/autopilot";
import type { ChoiceOption } from "./brandProfile";

/** Mirrors AUTOPILOT_FORMATS in backend/src/constants/autopilot.constant.ts. */
export const AUTOPILOT_FORMAT_OPTIONS: ChoiceOption<AutopilotFormat>[] = [
  { value: "TIPS", label: "Practical tips" },
  { value: "HOW_TO", label: "How-to" },
  { value: "LIST", label: "List" },
  { value: "STORY", label: "Story" },
  { value: "QUESTION", label: "Question" },
  { value: "MYTH_VS_FACT", label: "Myth vs fact" },
  { value: "BEHIND_THE_SCENES", label: "Behind the scenes" },
  { value: "OPINION", label: "Opinion" },
];

export const WEEKDAY_OPTIONS: ChoiceOption<AutopilotWeekday>[] = [
  { value: "MONDAY", label: "Mon" },
  { value: "TUESDAY", label: "Tue" },
  { value: "WEDNESDAY", label: "Wed" },
  { value: "THURSDAY", label: "Thu" },
  { value: "FRIDAY", label: "Fri" },
  { value: "SATURDAY", label: "Sat" },
  { value: "SUNDAY", label: "Sun" },
];

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

export const SLOT_STATUS_DETAILS: Record<SlotStatus, { label: string; tone: Tone }> = {
  PLANNED: { label: "Planned", tone: "neutral" },
  GENERATING: { label: "Writing", tone: "primary" },
  GENERATED: { label: "Written", tone: "success" },
  SKIPPED: { label: "Skipped", tone: "warning" },
  FAILED: { label: "Failed", tone: "danger" },
};

export const HOLD_REASON_TONES: Record<HoldReason, Tone> = {
  APPROVAL_REQUIRED: "primary",
  NEEDS_MEDIA: "warning",
  QUALITY_REVIEW: "warning",
  DAILY_LIMIT: "warning",
  SCHEDULING_FAILED: "danger",
  PAUSED: "neutral",
  EXPIRED: "danger",
};

export const EVENT_DETAILS: Record<AutopilotEventType, { label: string; tone: Tone }> = {
  SETTINGS_UPDATED: { label: "Settings changed", tone: "neutral" },
  STARTED: { label: "Started", tone: "success" },
  PAUSED: { label: "Paused", tone: "warning" },
  AUTO_PAUSED: { label: "Paused itself", tone: "danger" },
  SLOTS_PLANNED: { label: "Planned", tone: "neutral" },
  SLOTS_CLEARED: { label: "Plan cleared", tone: "neutral" },
  SLOT_SKIPPED: { label: "Skipped", tone: "warning" },
  TOPIC_SELECTED: { label: "Topic chosen", tone: "primary" },
  DUPLICATE_REJECTED: { label: "Repeat blocked", tone: "warning" },
  QUALITY_REJECTED: { label: "Quality check failed", tone: "warning" },
  CONTENT_GENERATED: { label: "Written", tone: "primary" },
  GENERATION_FAILED: { label: "Writing failed", tone: "danger" },
  GENERATION_DISCARDED: { label: "Discarded", tone: "neutral" },
  HELD_FOR_REVIEW: { label: "Held for review", tone: "primary" },
  SCHEDULED: { label: "Scheduled", tone: "success" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  APPROVAL_EXPIRED: { label: "Approval expired", tone: "danger" },
  UNSCHEDULED: { label: "Unscheduled", tone: "neutral" },
  PUBLISHED: { label: "Published", tone: "success" },
  PUBLISH_FAILED: { label: "Publish failed", tone: "danger" },
  PUBLISH_BLOCKED: { label: "Publish stopped", tone: "warning" },
};
