import { api } from "@/lib/api";
import type { BrandProfile, BrandProfileUpdate, OnboardingStep } from "@/types/brandProfile";

const brandProfilePath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/brand-profile`;

type BrandProfileResponse = { brandProfile: BrandProfile };

export type OnboardingStepPayload = BrandProfileUpdate | { skipped: true };

export const brandProfileApi = {
  get: async (workspaceId: string) =>
    (await api.get<BrandProfileResponse>(brandProfilePath(workspaceId))).data.brandProfile,

  /** Saves a draft; required fields are only checked once onboarding is complete. */
  update: async (workspaceId: string, payload: BrandProfileUpdate) =>
    (
      await api.patch<BrandProfileResponse, BrandProfileUpdate>(
        brandProfilePath(workspaceId),
        payload,
      )
    ).data.brandProfile,

  saveStep: async (workspaceId: string, step: OnboardingStep, payload: OnboardingStepPayload) =>
    (
      await api.post<BrandProfileResponse, OnboardingStepPayload>(
        `${brandProfilePath(workspaceId)}/onboarding/steps/${step}`,
        payload,
      )
    ).data.brandProfile,

  complete: async (workspaceId: string) =>
    (await api.post<BrandProfileResponse>(`${brandProfilePath(workspaceId)}/onboarding/complete`))
      .data.brandProfile,
};
