export type NotificationType =
  | "POST_PUBLISHED"
  | "POST_FAILED"
  | "AUTOPILOT_APPROVAL_NEEDED"
  | "AUTOPILOT_PAUSED"
  | "SOCIAL_ACCOUNT_NEEDS_ATTENTION"
  | "INVITATION_ACCEPTED"
  | "MEMBER_ROLE_CHANGED"
  | "MEMBER_REMOVED"
  | "PAYMENT_FAILED"
  | "INSIGHTS_READY";

/** In-app notification for the signed-in user. */
export interface AppNotification {
  id: string;
  /** Null for account-level notifications (billing, being removed from a workspace). */
  workspaceId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  /** In-app path clicking the notification opens. */
  href: string;
}

export interface NotificationPage {
  notifications: AppNotification[];
  unread: number;
  hasMore: boolean;
}
