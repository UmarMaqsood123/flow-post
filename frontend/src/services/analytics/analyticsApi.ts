import { api } from "@/lib/api";
import type { AnalyticsQuery, AnalyticsReport } from "@/types/analytics";

const analyticsPath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/analytics`;

export const analyticsApi = {
  get: async (workspaceId: string, query: AnalyticsQuery) => {
    const params = new URLSearchParams({ range: query.range });
    if (query.range === "custom" && query.from && query.to) {
      params.set("from", query.from);
      params.set("to", query.to);
    }
    if (query.platform?.length) params.set("platform", query.platform.join(","));
    return (await api.get<AnalyticsReport>(`${analyticsPath(workspaceId)}?${params.toString()}`))
      .data;
  },

  /** Collects now instead of waiting for the worker's next sweep. */
  refresh: async (workspaceId: string) =>
    (
      await api.post<{ collected: number; skipped: number; failed: number }>(
        `${analyticsPath(workspaceId)}/refresh`,
      )
    ).data,
};
