import { delay } from "@/lib/mock";
import { paths } from "@/routing/paths";
import type { AppNotification } from "@/types/notification";

const HOUR = 3_600_000;

export const notificationsApi = {
  /** TEMPORARY sample notifications until a notifications service exists. */
  list: async (): Promise<AppNotification[]> => {
    await delay(300);
    const now = Date.now();
    return [
      {
        id: "welcome",
        title: "Welcome to FlowPost",
        body: "Set up your brand profile to get tailored content suggestions.",
        createdAt: new Date(now - 2 * HOUR).toISOString(),
        read: false,
        href: paths.brandProfile,
      },
      {
        id: "sample-analytics",
        title: "Your dashboard shows sample data",
        body: "Real analytics appear once social accounts can be connected.",
        createdAt: new Date(now - 26 * HOUR).toISOString(),
        read: false,
        href: paths.socialAccounts,
      },
      {
        id: "recommendations",
        title: "New AI recommendations",
        body: "Fresh content ideas for this week are on your dashboard.",
        createdAt: new Date(now - 72 * HOUR).toISOString(),
        read: true,
        href: paths.dashboard,
      },
    ];
  },
};
