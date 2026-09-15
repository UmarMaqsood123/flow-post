import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { BrandProfile, BrandProfileUpdate, OnboardingStep } from "@/types/brandProfile";
import { brandProfileApi, type OnboardingStepPayload } from "./brandProfileApi";

const cacheProfile = (queryClient: QueryClient, workspaceId: string, profile: BrandProfile) =>
  queryClient.setQueryData(queryKeys.workspaces.brandProfile(workspaceId), profile);

export function useUpdateBrandProfile(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BrandProfileUpdate) => brandProfileApi.update(workspaceId, payload),
    onSuccess: (profile) => cacheProfile(queryClient, workspaceId, profile),
  });
}

export function useSaveOnboardingStep(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ step, payload }: { step: OnboardingStep; payload: OnboardingStepPayload }) =>
      brandProfileApi.saveStep(workspaceId, step, payload),
    onSuccess: (profile) => cacheProfile(queryClient, workspaceId, profile),
  });
}

export function useCompleteOnboarding(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => brandProfileApi.complete(workspaceId),
    onSuccess: (profile) => cacheProfile(queryClient, workspaceId, profile),
  });
}
