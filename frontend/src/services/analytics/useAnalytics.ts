import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { AnalyticsQuery } from "@/types/analytics";
import { analyticsApi } from "./analyticsApi";

export function useAnalytics(workspaceId: string | undefined, query: AnalyticsQuery) {
  return useQuery({
    queryKey: queryKeys.workspaces.analytics(workspaceId ?? "", query),
    queryFn: () => analyticsApi.get(workspaceId ?? "", query),
    enabled: Boolean(workspaceId) && (query.range !== "custom" || Boolean(query.from && query.to)),
    // Keeps the previous range on screen while a new one loads.
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

export function useRefreshAnalytics(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => analyticsApi.refresh(workspaceId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.workspaces.detail(workspaceId), "analytics"],
      }),
  });
}
