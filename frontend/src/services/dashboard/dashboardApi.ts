import { api } from "@/lib/api";
import type { DashboardSummary } from "@/types/dashboard";

export const dashboardApi = {
  getSummary: async (workspaceId: string) =>
    (await api.get<DashboardSummary>(`/workspaces/${encodeURIComponent(workspaceId)}/dashboard`))
      .data,
};
