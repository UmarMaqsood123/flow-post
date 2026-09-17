import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { env } from "@/config/env";
import { endSession, refreshSession } from "@/lib/api";
import { getAccessToken } from "@/lib/authToken";
import { queryKeys } from "@/lib/queryKeys";
import { notify } from "@/lib/toast";
import type { AppNotification, NotificationPage } from "@/types/notification";
import { readEventStream } from "./notificationStream";

const MAX_BACKOFF_MS = 30_000;

const ALERT_TYPES = new Set<AppNotification["type"]>([
  "POST_FAILED",
  "AUTOPILOT_PAUSED",
  "SOCIAL_ACCOUNT_NEEDS_ATTENTION",
  "PAYMENT_FAILED",
]);

/** Refreshes whatever the event changed, so open pages show it without a reload. */
const invalidateRelated = (queryClient: QueryClient, notification: AppNotification) => {
  const invalidate = (queryKey: readonly unknown[]) =>
    void queryClient.invalidateQueries({ queryKey });
  const workspace = notification.workspaceId;

  switch (notification.type) {
    case "PAYMENT_FAILED":
      invalidate(queryKeys.billing.overview());
      return;
    case "MEMBER_REMOVED":
      invalidate(queryKeys.workspaces.all);
      invalidate(queryKeys.auth.session());
      return;
  }
  if (!workspace) return;
  switch (notification.type) {
    case "POST_PUBLISHED":
    case "POST_FAILED":
      invalidate(queryKeys.workspaces.postLists(workspace));
      invalidate(queryKeys.workspaces.calendars(workspace));
      invalidate(queryKeys.workspaces.dashboard(workspace));
      invalidate(queryKeys.workspaces.autopilot(workspace));
      return;
    case "AUTOPILOT_APPROVAL_NEEDED":
    case "AUTOPILOT_PAUSED":
      invalidate(queryKeys.workspaces.autopilot(workspace));
      invalidate(queryKeys.workspaces.postLists(workspace));
      return;
    case "SOCIAL_ACCOUNT_NEEDS_ATTENTION":
      invalidate(queryKeys.workspaces.socialAccounts(workspace));
      return;
    case "INVITATION_ACCEPTED":
      invalidate(queryKeys.workspaces.members(workspace));
      invalidate(queryKeys.workspaces.invitations(workspace));
      return;
    case "MEMBER_ROLE_CHANGED":
      invalidate(queryKeys.workspaces.all);
      return;
    case "INSIGHTS_READY":
      invalidate(queryKeys.workspaces.insights(workspace));
      return;
  }
};

/** Adds the notification to every cached bell list it belongs in. */
const addToLists = (queryClient: QueryClient, notification: AppNotification) => {
  const lists = queryClient.getQueriesData<NotificationPage>({
    queryKey: queryKeys.notifications.all,
  });
  for (const [key, page] of lists) {
    const scope = key[1];
    const visible = notification.workspaceId === null || notification.workspaceId === scope;
    if (!page || !visible || page.notifications.some((item) => item.id === notification.id)) {
      continue;
    }
    queryClient.setQueryData<NotificationPage>(key, {
      ...page,
      notifications: [notification, ...page.notifications],
      unread: page.unread + (notification.read ? 0 : 1),
    });
  }
};

/**
 * Keeps one live connection for the signed-in user and applies notifications as
 * they arrive. Reconnects with backoff, refreshing the session when the access
 * token has expired. Returns whether the stream is currently connected, so the
 * list can fall back to polling while it isn't.
 */
export function useNotificationStream(workspaceId: string | null): boolean {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const workspaceRef = useRef(workspaceId);

  useEffect(() => {
    workspaceRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let controller: AbortController | null = null;
    let connected = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleReconnect = () => {
      if (stopped) return;
      const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(() => void connect(), base / 2 + Math.random() * (base / 2));
    };

    const handle = ({ event, data }: { event: string; data: string }) => {
      if (event === "ready") {
        attempt = 0;
        setLive(true);
        // Catch up on anything created while disconnected.
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        return;
      }
      if (event === "revoked") {
        // Logged out elsewhere or suspended: the refresh fails and signs this tab out.
        void refreshSession().catch(endSession);
        return;
      }
      if (event !== "notification") return;

      const notification = JSON.parse(data) as AppNotification;
      addToLists(queryClient, notification);
      invalidateRelated(queryClient, notification);
      const current = workspaceRef.current;
      if (notification.workspaceId === null || notification.workspaceId === current) {
        if (ALERT_TYPES.has(notification.type)) notify.alert(notification.title, notification.id);
        else notify.info(notification.title, notification.id);
      }
    };

    const connect = async () => {
      if (stopped) return;
      controller = new AbortController();
      connected = true;
      try {
        const token = getAccessToken() ?? (await refreshSession()).accessToken;
        const res = await fetch(`${env.apiBaseUrl}/notifications/stream`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.status === 401) {
          try {
            await refreshSession();
          } catch {
            endSession();
            return;
          }
        } else if (res.ok && res.body) {
          await readEventStream(res.body, handle);
        }
      } catch {
        // Network error or abort; handled below.
      }
      connected = false;
      if (stopped) return;
      setLive(false);
      scheduleReconnect();
    };

    const reconnectNow = () => {
      if (stopped) return;
      clearTimeout(retryTimer);
      attempt = 0;
      // A live attempt reconnects once aborted; a waiting one starts now.
      if (connected) controller?.abort();
      else void connect();
    };

    void connect();
    window.addEventListener("online", reconnectNow);

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      controller?.abort();
      window.removeEventListener("online", reconnectNow);
    };
  }, [queryClient]);

  return live;
}
