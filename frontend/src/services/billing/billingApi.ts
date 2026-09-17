import { api } from "@/lib/api";
import type {
  BillingInterval,
  BillingOverview,
  PaidPlan,
  PlanChangeResult,
  WorkspaceEntitlements,
} from "@/types/billing";

export const billingApi = {
  overview: async () => (await api.get<BillingOverview>("/billing")).data,
  refresh: async () => (await api.post<BillingOverview>("/billing/refresh")).data,
  checkout: async (plan: PaidPlan, interval: BillingInterval) =>
    (await api.post<{ url: string }>("/billing/checkout", { plan, interval })).data,
  confirmCheckout: async (sessionId: string) =>
    (await api.post<BillingOverview>("/billing/checkout/confirm", { sessionId })).data,
  changePlan: async (plan: PaidPlan, interval: BillingInterval) =>
    (await api.post<PlanChangeResult>("/billing/subscription/change", { plan, interval })).data,
  cancel: async () => (await api.post<PlanChangeResult>("/billing/subscription/cancel")).data,
  resume: async () => (await api.post<BillingOverview>("/billing/subscription/resume")).data,
  portal: async () => (await api.post<{ url: string }>("/billing/portal")).data,
  workspaceEntitlements: async (workspaceId: string) =>
    (
      await api.get<WorkspaceEntitlements>(
        `/workspaces/${encodeURIComponent(workspaceId)}/entitlements`,
      )
    ).data,
};
