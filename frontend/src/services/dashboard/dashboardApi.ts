import { ApiError } from "@/lib/apiError";
import { delay } from "@/lib/mock";
import { generateMockDashboard } from "@/lib/mockDashboard";
import type { BrandProfile } from "@/types/brandProfile";
import type { DashboardPreview, DashboardSummary } from "@/types/dashboard";
import type { Workspace } from "@/types/workspace";

const MOCK_LATENCY_MS = 400;
const PREVIEWS: DashboardPreview[] = ["loading", "empty", "error"];

export const toDashboardPreview = (value: string | null): DashboardPreview | undefined =>
  PREVIEWS.find((preview) => preview === value);

interface SummaryRequest {
  workspace: Workspace;
  brandProfile?: BrandProfile;
  canEditBrandProfile: boolean;
  preview?: DashboardPreview;
}

export const dashboardApi = {
  /**
   * TEMPORARY: returns generated sample data. Replace the body with
   * `api.get<DashboardSummary>(`/workspaces/${id}/dashboard`)` once analytics exist.
   */
  getSummary: async ({
    workspace,
    brandProfile,
    canEditBrandProfile,
    preview,
  }: SummaryRequest): Promise<DashboardSummary> => {
    if (preview === "loading") return new Promise<never>(() => {});
    await delay(MOCK_LATENCY_MS);
    if (preview === "error") {
      throw new ApiError(
        "Dashboard analytics are temporarily unavailable.",
        503,
        "SERVICE_UNAVAILABLE",
      );
    }
    return generateMockDashboard({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      brandProfile,
      canEditBrandProfile,
      empty: preview === "empty",
    });
  },
};
