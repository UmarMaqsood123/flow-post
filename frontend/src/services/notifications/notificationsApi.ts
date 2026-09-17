import { api } from "@/lib/api";
import type { NotificationPage } from "@/types/notification";

export const notificationsApi = {
  /** Newest first: this workspace's notifications plus account-level ones. */
  list: async (workspaceId: string | null) =>
    (
      await api.get<NotificationPage>("/notifications", {
        params: workspaceId ? { workspaceId } : undefined,
      })
    ).data,
  markRead: async (workspaceId: string | null, ids?: string[]) =>
    (
      await api.post<{ unread: number }>("/notifications/read", {
        ...(workspaceId ? { workspaceId } : {}),
        ...(ids ? { ids } : { all: true }),
      })
    ).data,
};
