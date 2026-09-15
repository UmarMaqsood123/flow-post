/** In-app notification. Mocked until a notifications service exists. */
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  /** Where clicking the notification goes. */
  href: string;
}
