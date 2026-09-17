import { api } from "@/lib/api";
import type {
  AdminAIUsage,
  AdminDashboard,
  AdminPlans,
  AdminSocialAccount,
  AdminSubscriptionDetails,
  AdminSubscriptionRow,
  AdminUser,
  AdminUserDetails,
  AdminUserRow,
  AdminWorkspaceDetails,
  AdminWorkspaceRow,
  AuditLogRow,
  Paged,
  PublishingFailure,
  UsageInspection,
} from "@/types/admin";

/** Drops empty filters so URLs and cache keys stay tidy. */
const toQuery = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

export type ListParams = Record<string, string | number | undefined>;
const get = async <T>(path: string, params: ListParams = {}) =>
  (await api.get<T>(`/admin${path}${toQuery(params)}`)).data;

export const adminApi = {
  dashboard: () => get<AdminDashboard>("/dashboard"),
  users: (params: ListParams) => get<Paged<AdminUserRow>>("/users", params),
  user: (id: string) => get<AdminUserDetails>(`/users/${encodeURIComponent(id)}`),
  suspendUser: async (id: string, reason: string) =>
    (await api.post<AdminUser>(`/admin/users/${encodeURIComponent(id)}/suspend`, { reason })).data,
  reactivateUser: async (id: string, reason: string) =>
    (await api.post<AdminUser>(`/admin/users/${encodeURIComponent(id)}/reactivate`, { reason }))
      .data,
  workspaces: (params: ListParams) => get<Paged<AdminWorkspaceRow>>("/workspaces", params),
  workspace: (id: string) => get<AdminWorkspaceDetails>(`/workspaces/${encodeURIComponent(id)}`),
  subscriptions: (params: ListParams) => get<Paged<AdminSubscriptionRow>>("/subscriptions", params),
  subscription: (id: string) =>
    get<AdminSubscriptionDetails>(`/subscriptions/${encodeURIComponent(id)}`),
  plans: () => get<AdminPlans>("/plans"),
  aiUsage: (params: ListParams) => get<AdminAIUsage>("/ai-usage", params),
  socialConnections: (params: ListParams) =>
    get<Paged<AdminSocialAccount>>("/social-connections", params),
  publishingFailures: (params: ListParams) =>
    get<Paged<PublishingFailure>>("/publishing-failures", params),
  inspectUsage: (params: { userId?: string; workspaceId?: string }) =>
    get<UsageInspection>("/usage", params),
  auditLogs: (params: ListParams) => get<Paged<AuditLogRow>>("/audit-logs", params),
};
