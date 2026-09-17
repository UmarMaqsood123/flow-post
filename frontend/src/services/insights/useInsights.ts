import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { insightsApi } from "./insightsApi";

export function useInsightsOverview(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.insights(workspaceId ?? ""),
    queryFn: () => insightsApi.overview(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
}

export function useInsightReport(workspaceId: string | undefined, reportId: string | null) {
  return useQuery({
    queryKey: queryKeys.workspaces.insightReport(workspaceId ?? "", reportId ?? ""),
    queryFn: () => insightsApi.report(workspaceId ?? "", reportId ?? ""),
    enabled: Boolean(workspaceId && reportId),
    staleTime: 60_000,
  });
}

/** Every insights query for the workspace, so the overview and open reports stay in step. */
const useInvalidateInsights = (workspaceId: string) => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.insights(workspaceId) });
};

export function useGenerateInsights(workspaceId: string) {
  const invalidate = useInvalidateInsights(workspaceId);
  return useMutation({
    mutationFn: () => insightsApi.generate(workspaceId),
    onSuccess: invalidate,
  });
}

export function useDecideInsight(workspaceId: string) {
  const invalidate = useInvalidateInsights(workspaceId);
  return useMutation({
    mutationFn: (input: Parameters<typeof insightsApi.decide>[1]) =>
      insightsApi.decide(workspaceId, input),
    onSuccess: invalidate,
  });
}
