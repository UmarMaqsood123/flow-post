import { z } from "zod";
import {
  INVITABLE_ROLES,
  WORKSPACE_INDUSTRIES,
  WORKSPACE_ROLES,
} from "../constants/workspace.constant";
import { emailField, tokenField } from "./auth.validator";
import { objectIdField } from "./common.validator";

export const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** Empty string or null clears the field. */
const nullableText = (max: number, label: string) =>
  z.union([
    z.null(),
    z
      .string()
      .trim()
      .max(max, `${label} must be at most ${max} characters`)
      .transform((value) => value || null),
  ]);

/** Only http(s) URLs are accepted, so values are safe to render as links and images. */
const nullableHttpUrl = (label: string) =>
  z.union([
    z.null(),
    z.literal(""),
    z
      .string()
      .trim()
      .max(2048, `${label} is too long`)
      .pipe(
        z.url({
          protocol: /^https?$/,
          error: `${label} must be a valid URL starting with http:// or https://`,
        }),
      ),
  ]);

const emptyToNull = <T>(value: T | "" | null | undefined) =>
  value === "" ? null : (value as T | null | undefined);

const fields = {
  name: z
    .string({ error: "Workspace name is required" })
    .trim()
    .min(2, "Workspace name must be at least 2 characters")
    .max(80, "Workspace name must be at most 80 characters"),
  logo: nullableHttpUrl("Logo URL").transform(emptyToNull),
  website: nullableHttpUrl("Website").transform(emptyToNull),
  industry: z
    .union([
      z.null(),
      z.literal(""),
      z.enum(WORKSPACE_INDUSTRIES, { error: "Choose an industry from the list" }),
    ])
    .transform(emptyToNull),
  description: nullableText(500, "Description"),
  timezone: z
    .string({ error: "Time zone is required" })
    .trim()
    .refine(isValidTimeZone, "Choose a valid time zone"),
};

/** Unknown keys (e.g. `createdBy`, `status`) are stripped, preventing mass assignment. */
export const createWorkspaceSchema = z.object({
  name: fields.name,
  logo: fields.logo.optional(),
  website: fields.website.optional(),
  industry: fields.industry.optional(),
  description: fields.description.optional(),
  timezone: fields.timezone.default("UTC"),
});

export const updateWorkspaceSchema = z
  .object({
    name: fields.name.optional(),
    logo: fields.logo.optional(),
    website: fields.website.optional(),
    industry: fields.industry.optional(),
    description: fields.description.optional(),
    timezone: fields.timezone.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Provide at least one field to update",
  });

export const memberParamsSchema = z.object({
  workspaceId: objectIdField,
  memberId: objectIdField,
});

export const invitationParamsSchema = z.object({
  workspaceId: objectIdField,
  invitationId: objectIdField,
});

export const changeMemberRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES, { error: "Choose a valid role" }),
});

export const inviteMemberSchema = z.object({
  email: emailField,
  role: z.enum(INVITABLE_ROLES, { error: "Choose admin, editor or viewer" }),
});

export const invitationTokenSchema = z.object({
  token: tokenField,
});

/** Not trimmed: the owner must type the name exactly. */
export const deleteWorkspaceSchema = z.object({
  confirmName: z.string({ error: "Type the workspace name to confirm" }).max(80),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type MemberParams = z.infer<typeof memberParamsSchema>;
export type InvitationParams = z.infer<typeof invitationParamsSchema>;
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type InvitationTokenInput = z.infer<typeof invitationTokenSchema>;
export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceSchema>;
