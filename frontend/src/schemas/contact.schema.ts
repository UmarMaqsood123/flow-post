import { z } from "zod";
import { CONTACT_MESSAGE_MAX_LENGTH, CONTACT_MESSAGE_MIN_LENGTH } from "@/config/contact";

/** Mirrors backend/src/validators/contact.validator.ts so people get instant feedback. */
export const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .pipe(z.email("Enter a valid email address")),
  topic: z.enum(["SUPPORT", "BILLING", "PRIVACY", "SALES", "FEEDBACK", "OTHER"], {
    error: "Pick a topic",
  }),
  message: z
    .string()
    .trim()
    .min(
      CONTACT_MESSAGE_MIN_LENGTH,
      `Tell us a bit more (at least ${CONTACT_MESSAGE_MIN_LENGTH} characters)`,
    )
    .max(CONTACT_MESSAGE_MAX_LENGTH, `Keep it under ${CONTACT_MESSAGE_MAX_LENGTH} characters`),
  website: z.string().optional(),
});

export type ContactFormValues = z.input<typeof contactSchema>;
