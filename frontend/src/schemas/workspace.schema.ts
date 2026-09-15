import { z } from "zod";

/** Mirrors backend/src/validators/workspace.validator.ts. */

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const optionalUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(2048, `${label} is too long`)
    .refine(
      (value) => value === "" || isHttpUrl(value),
      `${label} must be a valid URL starting with http:// or https://`,
    );

export const workspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Workspace name must be at least 2 characters")
    .max(80, "Workspace name must be at most 80 characters"),
  logo: optionalUrl("Logo URL"),
  website: optionalUrl("Website"),
  industry: z.string(),
  description: z.string().trim().max(500, "Description must be at most 500 characters"),
  timezone: z.string().min(1, "Choose a time zone"),
});

export const WORKSPACE_FORM_FIELDS = [
  "name",
  "logo",
  "website",
  "industry",
  "description",
  "timezone",
] as const;

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .pipe(z.email("Enter a valid email address")),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
});

export type WorkspaceFormValues = z.infer<typeof workspaceSchema>;
export type InviteMemberValues = z.infer<typeof inviteMemberSchema>;
