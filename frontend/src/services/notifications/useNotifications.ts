import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { NotificationPage } from "@/types/notification";
import { notificationsApi } from "./notificationsApi";

/** How often to poll while the live stream is down. */
const FALLBACK_POLL_MS = 60_000;

export function useNotifications(workspaceId: string | null, { live }: { live: boolean }) {
  return useQuery({
    queryKey: queryKeys.notifications.list(workspaceId),
    queryFn: () => notificationsApi.list(workspaceId),
    // The stream keeps the list current; polling only covers an outage.
    staleTime: live ? Infinity : 30_000,
    refetchInterval: live ? false : FALLBACK_POLL_MS,
  });
}

export function useMarkNotificationsRead(workspaceId: string | null) {
  const queryClient = useQueryClient();
  const key = queryKeys.notifications.list(workspaceId);

  return useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(workspaceId, ids),
    // Read state flips immediately; the server's count settles it.
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<NotificationPage>(key, (page) => {
        if (!page) return page;
        const notifications = page.notifications.map((item) =>
          !ids || ids.includes(item.id) ? { ...item, read: true } : item,
        );
        const newlyRead = page.notifications.filter(
          (item) => !item.read && (!ids || ids.includes(item.id)),
        ).length;
        return { ...page, notifications, unread: Math.max(0, page.unread - newlyRead) };
      });
    },
    onSuccess: ({ unread }) =>
      queryClient.setQueryData<NotificationPage>(key, (page) =>
        page ? { ...page, unread } : page,
      ),
    onError: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}
