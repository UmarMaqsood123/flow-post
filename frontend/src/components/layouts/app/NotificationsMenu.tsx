import { Bell, BellOff } from "lucide-react";
import { Link } from "react-router";
import AsyncContent from "@/components/shared/AsyncContent";
import EmptyState from "@/components/shared/EmptyState";
import Popover from "@/components/ui/Popover";
import Skeleton from "@/components/ui/Skeleton";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useMarkNotificationsRead,
  useNotifications,
} from "@/services/notifications/useNotifications";
import { useNotificationStream } from "@/services/notifications/useNotificationStream";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";

function NotificationsMenu() {
  const { current } = useCurrentWorkspace();
  const workspaceId = current?.workspace.id ?? null;
  const live = useNotificationStream(workspaceId);
  const notifications = useNotifications(workspaceId, { live });
  const markRead = useMarkNotificationsRead(workspaceId);
  const items = notifications.data?.notifications ?? [];
  const unread = notifications.data?.unread ?? 0;

  return (
    <Popover
      label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      buttonClassName="relative inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-slate-100 hover:text-ink"
      buttonContent={
        <>
          <Bell className="size-5" aria-hidden="true" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-surface"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </>
      }
      panelClassName="w-80 max-w-[calc(100vw-2rem)]"
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate(undefined)}
                className="cursor-pointer text-xs font-medium text-primary hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            <AsyncContent
              isLoading={notifications.isPending}
              error={notifications.error}
              errorTitle="We couldn't load notifications"
              onRetry={() => void notifications.refetch()}
              isRetrying={notifications.isRefetching}
              isEmpty={items.length === 0}
              loading={
                <div className="flex flex-col gap-3 p-4">
                  {[0, 1, 2].map((item) => (
                    <Skeleton key={item} className="h-12" />
                  ))}
                </div>
              }
              empty={
                <EmptyState
                  compact
                  icon={BellOff}
                  title="You're all caught up"
                  description="We'll let you know when posts publish or teammates need you."
                />
              }
            >
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      onClick={() => {
                        if (!item.read) markRead.mutate([item.id]);
                        close();
                      }}
                      className="flex gap-3 px-4 py-3 hover:bg-slate-50"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          item.read ? "bg-transparent" : "bg-primary",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", !item.read && "font-semibold")}>
                          {item.title}
                          {!item.read && <span className="sr-only"> (unread)</span>}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">{item.body}</span>
                        <span className="mt-1 block text-xs text-muted">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </AsyncContent>
          </div>
        </>
      )}
    </Popover>
  );
}

export default NotificationsMenu;
