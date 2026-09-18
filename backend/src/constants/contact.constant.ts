/** What a contact form message is about. Keep in sync with frontend/src/config/contact.ts. */
export const CONTACT_TOPICS = [
  "SUPPORT",
  "BILLING",
  "PRIVACY",
  "SALES",
  "FEEDBACK",
  "OTHER",
] as const;
export type ContactTopicValue = (typeof CONTACT_TOPICS)[number];

/** Where a message is in the admin inbox. */
export const CONTACT_STATUSES = ["NEW", "IN_PROGRESS", "RESOLVED"] as const;
export type ContactStatusValue = (typeof CONTACT_STATUSES)[number];

export const CONTACT_MESSAGE_MIN_LENGTH = 10;
export const CONTACT_MESSAGE_MAX_LENGTH = 5000;
