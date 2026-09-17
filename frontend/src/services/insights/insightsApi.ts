import { api } from "@/lib/api";
import type { InsightReport, InsightStatus, InsightsOverview } from "@/types/insights";

const insightsPath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/insights`;

export const insightsApi = {
  overview: async (workspaceId: string) =>
    (await api.get<InsightsOverview>(insightsPath(workspaceId))).data,

  report: async (workspaceId: string, reportId: string) =>
    (await api.get<InsightReport>(`${insightsPath(workspaceId)}/${encodeURIComponent(reportId)}`))
      .data,

  generate: async (workspaceId: string) =>
    (await api.post<InsightReport>(`${insightsPath(workspaceId)}/generate`)).data,

  decide: async (
    workspaceId: string,
    { reportId, insightId, status }: { reportId: string; insightId: string; status: InsightStatus },
  ) =>
    (
      await api.patch<InsightReport>(
        `${insightsPath(workspaceId)}/${encodeURIComponent(reportId)}/insights/${encodeURIComponent(insightId)}`,
        { status },
      )
    ).data,
};
