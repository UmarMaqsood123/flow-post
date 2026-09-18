import type { ContactStatus, ContactTopic } from "@/types/contact";

/** Mirrors backend/src/constants/contact.constant.ts. */
export const CONTACT_MESSAGE_MIN_LENGTH = 10;
export const CONTACT_MESSAGE_MAX_LENGTH = 5000;

export const CONTACT_TOPIC_OPTIONS: { value: ContactTopic; label: string }[] = [
  { value: "SUPPORT", label: "Help with the app" },
  { value: "BILLING", label: "Billing" },
  { value: "SALES", label: "Plans and pricing" },
  { value: "PRIVACY", label: "Privacy and data" },
  { value: "FEEDBACK", label: "Feedback or ideas" },
  { value: "OTHER", label: "Something else" },
];

export const contactTopicLabel = (topic: ContactTopic) =>
  CONTACT_TOPIC_OPTIONS.find((option) => option.value === topic)?.label ?? topic;

export const CONTACT_STATUS_DETAILS: Record<
  ContactStatus,
  { label: string; tone: "primary" | "warning" | "success" }
> = {
  NEW: { label: "New", tone: "primary" },
  IN_PROGRESS: { label: "In progress", tone: "warning" },
  RESOLVED: { label: "Resolved", tone: "success" },
};
