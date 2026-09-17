import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { AdminUserDetails } from "@/types/admin";
import { adminApi, type ListParams } from "./adminApi";

/** Lists: kept on screen while the next page or filter loads. */
const useList = <T>(
  name: string,
  fetcher: (params: ListParams) => Promise<T>,
  params: ListParams,
) =>
  useQuery({
    queryKey: queryKeys.admin.list(name, params),
    queryFn: () => fetcher(params),
    placeholderData: keepPreviousData,
  });

/**
 * Detail views write an audit record on the server each time they're fetched,
 * so they're fetched once per visit: no refetching on focus or reconnect.
 */
const auditedQuery = {
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: false,
} as const;

export const useAdminDashboard = () =>
  useQuery({ queryKey: queryKeys.admin.dashboard(), queryFn: adminApi.dashboard });

export const useAdminUsers = (params: ListParams) => useList("users", adminApi.users, params);
export const useAdminWorkspaces = (params: ListParams) =>
  useList("workspaces", adminApi.workspaces, params);
export const useAdminSubscriptions = (params: ListParams) =>
  useList("subscriptions", adminApi.subscriptions, params);
export const useAdminSocialConnections = (params: ListParams) =>
  useList("social-connections", adminApi.socialConnections, params);
export const useAdminPublishingFailures = (params: ListParams) =>
  useList("publishing-failures", adminApi.publishingFailures, params);
export const useAdminAuditLogs = (params: ListParams) =>
  useList("audit-logs", adminApi.auditLogs, params);
export const useAdminAIUsage = (params: ListParams) =>
  useList("ai-usage", adminApi.aiUsage, params);
export const useAdminPlans = () =>
  useQuery({ queryKey: queryKeys.admin.plans(), queryFn: adminApi.plans });

export const useAdminUser = (id: string) =>
  useQuery({
    queryKey: queryKeys.admin.user(id),
    queryFn: () => adminApi.user(id),
    ...auditedQuery,
  });
export const useAdminWorkspace = (id: string) =>
  useQuery({
    queryKey: queryKeys.admin.workspace(id),
    queryFn: () => adminApi.workspace(id),
    ...auditedQuery,
  });
export const useAdminSubscription = (id: string) =>
  useQuery({
    queryKey: queryKeys.admin.subscription(id),
    queryFn: () => adminApi.subscription(id),
    ...auditedQuery,
  });

/** Usage inspection is audited, so it only runs when someone asks for it. */
export const useInspectUsage = () => useMutation({ mutationFn: adminApi.inspectUsage });

export function useSuspendUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, reason }: { action: "suspend" | "reactivate"; reason: string }) =>
      action === "suspend" ? adminApi.suspendUser(id, reason) : adminApi.reactivateUser(id, reason),
    onSuccess: (user) => {
      // Patched in place rather than refetched: fetching details writes another
      // "viewed" audit record, and the action itself is already recorded.
      queryClient.setQueryData<AdminUserDetails>(queryKeys.admin.user(id), (current) =>
        current ? { ...current, user: { ...current.user, ...user } } : current,
      );
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.lists() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboard() }),
      ]);
    },
  });
}
