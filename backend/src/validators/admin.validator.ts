import { z } from "zod";
import { AI_OPERATIONS, AIUsageStatus } from "../constants/ai.constant";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "../constants/audit.constant";
import { UserRole, UserStatus } from "../constants/auth.constant";
import { PLANS, SUBSCRIPTION_STATUSES } from "../constants/billing.constant";
import { CREATE_PLATFORMS } from "../constants/post.constant";
import { SocialAccountStatus } from "../constants/social.constant";
import { WorkspaceStatus } from "../constants/workspace.constant";
import { objectIdField } from "./common.validator";

const page = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};
const search = z.string().trim().max(200).optional();

export const adminIdParamsSchema = z.object({ id: objectIdField });

export const listUsersQuerySchema = z.object({
  ...page,
  q: search,
  status: z.enum(Object.values(UserStatus) as [string, ...string[]]).optional(),
  role: z.enum(Object.values(UserRole) as [string, ...string[]]).optional(),
  plan: z.enum(PLANS).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const listWorkspacesQuerySchema = z.object({
  ...page,
  q: search,
  status: z.enum(Object.values(WorkspaceStatus) as [string, ...string[]]).optional(),
});
export type ListWorkspacesQuery = z.infer<typeof listWorkspacesQuerySchema>;

export const listSubscriptionsQuerySchema = z.object({
  ...page,
  q: search,
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  plan: z.enum(PLANS).optional(),
  paymentIssue: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;

const dateRange = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const aiUsageQuerySchema = z.object({
  ...dateRange,
  operation: z.enum(AI_OPERATIONS).optional(),
  status: z.enum(Object.values(AIUsageStatus) as [string, ...string[]]).optional(),
  workspaceId: objectIdField.optional(),
  userId: objectIdField.optional(),
});
export type AIUsageQuery = z.infer<typeof aiUsageQuerySchema>;

export const listSocialConnectionsQuerySchema = z.object({
  ...page,
  q: search,
  platform: z.enum(CREATE_PLATFORMS).optional(),
  status: z.enum(Object.values(SocialAccountStatus) as [string, ...string[]]).optional(),
});
export type ListSocialConnectionsQuery = z.infer<typeof listSocialConnectionsQuerySchema>;

export const listPublishingFailuresQuerySchema = z.object({
  ...page,
  ...dateRange,
  platform: z.enum(CREATE_PLATFORMS).optional(),
  needsReview: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  workspaceId: objectIdField.optional(),
});
export type ListPublishingFailuresQuery = z.infer<typeof listPublishingFailuresQuerySchema>;

export const listAuditLogsQuerySchema = z.object({
  ...page,
  action: z.enum(AUDIT_ACTIONS).optional(),
  targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
  targetId: objectIdField.optional(),
  actorId: objectIdField.optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

/** Inspecting usage is for one user or one workspace, never both or neither. */
export const inspectUsageQuerySchema = z
  .object({ userId: objectIdField.optional(), workspaceId: objectIdField.optional() })
  .refine((value) => Boolean(value.userId) !== Boolean(value.workspaceId), {
    message: "Pass either userId or workspaceId",
  });
export type InspectUsageQuery = z.infer<typeof inspectUsageQuerySchema>;

export const suspendUserSchema = z.strictObject({
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters").max(500),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const reactivateUserSchema = z.strictObject({
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters").max(500),
});
export type ReactivateUserInput = z.infer<typeof reactivateUserSchema>;
