/** Mirrors backend/src/services/autopilot.service.ts and constants/autopilot.constant.ts. */
import type { Plan } from "./billing";
import type { CreatePlatform } from "./post";

export type AutopilotStatus = "OFF" | "ACTIVE" | "PAUSED";
export type AutopilotWeekday =
  "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
export type AutopilotFormat =
  | "TIPS"
  | "HOW_TO"
  | "LIST"
  | "STORY"
  | "QUESTION"
  | "MYTH_VS_FACT"
  | "BEHIND_THE_SCENES"
  | "OPINION";
export type SlotStatus = "PLANNED" | "GENERATING" | "GENERATED" | "SKIPPED" | "FAILED";
export type HoldReason =
  | "APPROVAL_REQUIRED"
  | "NEEDS_MEDIA"
  | "QUALITY_REVIEW"
  | "DAILY_LIMIT"
  | "SCHEDULING_FAILED"
  | "PAUSED"
  | "EXPIRED";

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
export type AutopilotEventType = (typeof AUTOPILOT_EVENT_TYPES)[number];

export interface AutopilotSettings {
  status: AutopilotStatus;
  platforms: CreatePlatform[];
  accounts: { platform: CreatePlatform; socialAccountId: string }[];
  postsPerWeek: number;
  postingDays: AutopilotWeekday[];
  postingTimes: string[];
  pillars: string[];
  formats: AutopilotFormat[];
  approvalRequired: boolean;
  maxPostsPerDay: number;
  startedAt: string | null;
  pausedAt: string | null;
  pausedBySystem: boolean;
  pauseReason: string | null;
  consecutiveGenerationFailures: number;
  consecutivePublishFailures: number;
  lastSweepAt: string | null;
  updatedAt: string | null;
}

export type AutopilotSettingsPayload = Pick<
  AutopilotSettings,
  | "platforms"
  | "accounts"
  | "postsPerWeek"
  | "postingDays"
  | "postingTimes"
  | "pillars"
  | "formats"
  | "approvalRequired"
  | "maxPostsPerDay"
>;

export interface AutopilotSlot {
  id: string;
  scheduledAt: string;
  localDay: string;
  status: SlotStatus;
  platforms: CreatePlatform[];
  pillar: string | null;
  format: AutopilotFormat | null;
  topic: string | null;
  angle: string | null;
  postIds: string[];
  attempts: number;
  nextAttemptAt: string | null;
  lastError: { code: string; message: string; occurredAt: string } | null;
  skipReason: string | null;
}

export interface ReviewQueueItem {
  postId: string;
  slotId: string;
  platform: CreatePlatform;
  topic: string;
  pillar: string | null;
  scheduledAt: string | null;
  heldReason: HoldReason;
  heldReasonLabel: string;
  heldMessage: string | null;
  preview: string;
  createdAt: string;
}

export interface AutopilotOverview {
  settings: AutopilotSettings;
  plan: {
    plan: Plan;
    label: string;
    /** False when the workspace's plan doesn't include Autopilot. */
    included: boolean;
    autopilotPostsPerWeek: number;
    autopilotPlatforms: number;
    autopilotPostsPerDay: number;
  };
  readyProblems: string[];
  slots: AutopilotSlot[];
  queue: ReviewQueueItem[];
  stats: { awaitingReview: number; publishedLast7Days: number; failuresLast7Days: number };
}

export interface AutopilotEvent {
  id: string;
  type: AutopilotEventType;
  message: string;
  actor: { id: string; name: string } | null;
  slotId: string | null;
  postId: string | null;
  platform: CreatePlatform | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AutopilotEventPage {
  events: AutopilotEvent[];
  nextBefore: string | null;
}
