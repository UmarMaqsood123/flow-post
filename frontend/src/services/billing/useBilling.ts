import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { BillingInterval, BillingOverview, PaidPlan } from "@/types/billing";
import { billingApi } from "./billingApi";

export function useBilling() {
  return useQuery({ queryKey: queryKeys.billing.overview(), queryFn: billingApi.overview });
}

export function useWorkspaceEntitlements(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.entitlements(workspaceId ?? ""),
    queryFn: () => billingApi.workspaceEntitlements(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
}

/** A plan change affects every workspace's limits, so all of them refresh. */
const useStoreOverview = () => {
  const queryClient = useQueryClient();
  return (overview: BillingOverview) => {
    queryClient.setQueryData(queryKeys.billing.overview(), overview);
    void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
  };
};

export function useRefreshBilling() {
  const store = useStoreOverview();
  return useMutation({ mutationFn: billingApi.refresh, onSuccess: store });
}

export function useConfirmCheckout() {
  const store = useStoreOverview();
  return useMutation({ mutationFn: billingApi.confirmCheckout, onSuccess: store });
}

/** Starts Stripe Checkout and leaves the app for it. */
export function useCheckout() {
  return useMutation({
    mutationFn: ({ plan, interval }: { plan: PaidPlan; interval: BillingInterval }) =>
      billingApi.checkout(plan, interval),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

export function useChangePlan() {
  const store = useStoreOverview();
  return useMutation({
    mutationFn: ({ plan, interval }: { plan: PaidPlan; interval: BillingInterval }) =>
      billingApi.changePlan(plan, interval),
    onSuccess: (result) => store(result.overview),
  });
}

export function useCancelSubscription() {
  const store = useStoreOverview();
  return useMutation({
    mutationFn: billingApi.cancel,
    onSuccess: (result) => store(result.overview),
  });
}

export function useResumeSubscription() {
  const store = useStoreOverview();
  return useMutation({ mutationFn: billingApi.resume, onSuccess: store });
}

export function useBillingPortal() {
  return useMutation({
    mutationFn: billingApi.portal,
    onSuccess: ({ url }) => window.location.assign(url),
  });
}
