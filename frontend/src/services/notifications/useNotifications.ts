import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { AppNotification } from "@/types/notification";
import { notificationsApi } from "./notificationsApi";

export function useNotifications(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.notifications(workspaceId ?? ""),
    queryFn: notificationsApi.list,
    enabled: Boolean(workspaceId),
    // Read state lives in the cache while notifications are mocked.
    staleTime: Infinity,
  });
}

export function useMarkNotificationsRead(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const update = (change: (notification: AppNotification) => AppNotification) => {
    if (!workspaceId) return;
    queryClient.setQueryData<AppNotification[]>(
      queryKeys.workspaces.notifications(workspaceId),
      (notifications) => notifications?.map(change),
    );
  };
  return {
    markAll: () => update((notification) => ({ ...notification, read: true })),
    markOne: (id: string) =>
      update((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      ),
  };
}
