import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { AutopilotEventType, AutopilotSettingsPayload } from "@/types/autopilot";
import { autopilotApi } from "./autopilotApi";

export function useAutopilot(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.autopilot(workspaceId ?? ""),
    queryFn: () => autopilotApi.overview(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
    // The worker changes things on its own; keep the page reasonably fresh.
    refetchInterval: 60_000,
  });
}

export function useAutopilotEvents(workspaceId: string | undefined, type?: AutopilotEventType) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.workspaces.autopilotEvents(workspaceId ?? ""), type ?? "all"],
    queryFn: ({ pageParam }) =>
      autopilotApi.events(workspaceId ?? "", { type, before: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextBefore,
    enabled: Boolean(workspaceId),
  });
}

/** Autopilot actions change posts, the calendar and the audit trail together. */
const useRefresh = (workspaceId: string) => {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.autopilot(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.postLists(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.calendars(workspaceId) }),
    ]);
};

export function useUpdateAutopilotSettings(workspaceId: string) {
  const refresh = useRefresh(workspaceId);
  return useMutation({
    mutationFn: (payload: AutopilotSettingsPayload) =>
      autopilotApi.updateSettings(workspaceId, payload),
    onSuccess: refresh,
  });
}

export function useStartAutopilot(workspaceId: string) {
  const refresh = useRefresh(workspaceId);
  return useMutation({ mutationFn: () => autopilotApi.start(workspaceId), onSuccess: refresh });
}

export function usePauseAutopilot(workspaceId: string) {
  const refresh = useRefresh(workspaceId);
  return useMutation({
    mutationFn: (reason?: string) => autopilotApi.pause(workspaceId, reason),
    onSuccess: refresh,
  });
}

export function useApproveAutopilotPost(workspaceId: string) {
  const refresh = useRefresh(workspaceId);
  return useMutation({
    mutationFn: ({ postId, scheduledAt }: { postId: string; scheduledAt?: string }) =>
      autopilotApi.approve(workspaceId, postId, scheduledAt),
    onSuccess: refresh,
  });
}

export function useRejectAutopilotPost(workspaceId: string) {
  const refresh = useRefresh(workspaceId);
  return useMutation({
    mutationFn: ({ postId, reason }: { postId: string; reason?: string }) =>
      autopilotApi.reject(workspaceId, postId, reason),
    onSuccess: refresh,
  });
}

export function useRetryAutopilotSlot(workspaceId: string) {
  const refresh = useRefresh(workspaceId);
  return useMutation({
    mutationFn: (slotId: string) => autopilotApi.retrySlot(workspaceId, slotId),
    onSuccess: refresh,
  });
}
