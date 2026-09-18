export type ContactTopic = "SUPPORT" | "BILLING" | "PRIVACY" | "SALES" | "FEEDBACK" | "OTHER";
export type ContactStatus = "NEW" | "IN_PROGRESS" | "RESOLVED";

export interface ContactMessagePayload {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  /** Honeypot. Always empty for real people. */
  website?: string;
}

export interface AdminContactMessage {
  id: string;
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  /** Account with the same email, if any. */
  userId: string | null;
  status: ContactStatus;
  adminNote: string | null;
  handledByEmail: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
}
