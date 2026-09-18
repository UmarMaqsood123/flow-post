import { z } from "zod";
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_MESSAGE_MIN_LENGTH,
  CONTACT_STATUSES,
  CONTACT_TOPICS,
} from "../constants/contact.constant";
import { emailField } from "./auth.validator";

export const createContactMessageSchema = z.strictObject({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(100, "Name is too long"),
  email: emailField,
  topic: z.enum(CONTACT_TOPICS, { error: "Pick a topic" }),
  message: z
    .string({ error: "Message is required" })
    .trim()
    .min(
      CONTACT_MESSAGE_MIN_LENGTH,
      `Tell us a bit more (at least ${CONTACT_MESSAGE_MIN_LENGTH} characters)`,
    )
    .max(CONTACT_MESSAGE_MAX_LENGTH, `Keep it under ${CONTACT_MESSAGE_MAX_LENGTH} characters`),
  /** Honeypot: hidden from people, so anything here came from a bot. */
  website: z.string().max(500).optional(),
});
export type CreateContactMessageInput = z.infer<typeof createContactMessageSchema>;

export const listContactMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(200).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  topic: z.enum(CONTACT_TOPICS).optional(),
});
export type ListContactMessagesQuery = z.infer<typeof listContactMessagesQuerySchema>;

export const updateContactMessageSchema = z
  .strictObject({
    status: z.enum(CONTACT_STATUSES).optional(),
    adminNote: z
      .string()
      .trim()
      .max(2000, "Keep the note under 2000 characters")
      .nullable()
      .optional(),
  })
  .refine((value) => value.status !== undefined || value.adminNote !== undefined, {
    message: "Nothing to update",
  });
export type UpdateContactMessageInput = z.infer<typeof updateContactMessageSchema>;
