import { formatFileSize } from "@/lib/files";
import type { PlanOption } from "@/types/billing";

/** What a plan includes, as plain bullet points. Shared by the pricing page and Billing. */
export const planFeatureList = (option: PlanOption): string[] => {
  const { limits } = option;
  return [
    `${limits.workspaces} ${limits.workspaces === 1 ? "workspace" : "workspaces"}`,
    `${limits.socialAccountsPerWorkspace} social accounts per workspace`,
    `${limits.aiGenerationsPerMonth.toLocaleString()} AI generations a month`,
    `${limits.scheduledPostsPerMonth.toLocaleString()} scheduled posts a month`,
    `${limits.teamMembersPerWorkspace} ${limits.teamMembersPerWorkspace === 1 ? "seat" : "seats"} per workspace`,
    `${formatFileSize(limits.storageBytes)} media storage`,
    option.features.analytics ? "Analytics and AI insights" : null,
    option.features.autopilot
      ? `Autopilot, up to ${option.autopilot.postsPerWeek} posts a week`
      : null,
  ].filter((item): item is string => Boolean(item));
};
