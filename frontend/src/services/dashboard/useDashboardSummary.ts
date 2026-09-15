import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { BrandProfile } from "@/types/brandProfile";
import type { DashboardPreview } from "@/types/dashboard";
import type { Workspace } from "@/types/workspace";
import { dashboardApi } from "./dashboardApi";

interface Options {
  workspace?: Workspace;
  brandProfile?: BrandProfile;
  /** Wait until the brand profile has loaded, so personalised data isn't fetched twice. */
  ready: boolean;
  canEditBrandProfile: boolean;
  preview?: DashboardPreview;
}

function useDashboardSummary({
  workspace,
  brandProfile,
  ready,
  canEditBrandProfile,
  preview,
}: Options) {
  return useQuery({
    queryKey: [
      ...queryKeys.workspaces.dashboard(workspace?.id ?? ""),
      brandProfile?.updatedAt ?? null,
      canEditBrandProfile,
      preview ?? "live",
    ],
    queryFn: () => {
      if (!workspace) throw new Error("A workspace is required");
      return dashboardApi.getSummary({ workspace, brandProfile, canEditBrandProfile, preview });
    },
    enabled: Boolean(workspace) && ready,
    staleTime: 60_000,
    retry: preview ? false : 1,
  });
}

export default useDashboardSummary;
