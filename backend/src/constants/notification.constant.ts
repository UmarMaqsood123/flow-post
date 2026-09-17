/** Every kind of in-app notification. */
export const NOTIFICATION_TYPES = [
  "POST_PUBLISHED",
  "POST_FAILED",
  "AUTOPILOT_APPROVAL_NEEDED",
  "AUTOPILOT_PAUSED",
  "SOCIAL_ACCOUNT_NEEDS_ATTENTION",
  "INVITATION_ACCEPTED",
  "MEMBER_ROLE_CHANGED",
  "MEMBER_REMOVED",
  "PAYMENT_FAILED",
  "INSIGHTS_READY",
] as const;
export type NotificationTypeValue = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_LIMITS = {
  title: 150,
  body: 500,
  href: 500,
  /** Newest notifications returned per page. */
  pageSize: 30,
  /** Kept this long, then removed by a TTL index. */
  retentionDays: 90,
  /** Open live connections per user (tabs and devices). Older ones are closed first. */
  streamsPerUser: 5,
} as const;

/** Redis pub/sub channel shared by every API instance and worker. */
export const NOTIFICATION_CHANNEL = "flowpost:notifications";
