import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { dashboardApi } from "./dashboardApi";

export function useDashboardSummary(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.dashboard(workspaceId ?? ""),
    queryFn: () => dashboardApi.getSummary(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
}
