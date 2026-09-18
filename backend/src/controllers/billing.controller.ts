import type { Request, Response } from "express";
import * as BillingService from "../services/billing.service";
import * as EntitlementService from "../services/entitlement.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getAuthenticatedUser } from "../utils/request.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type { ConfirmCheckoutInput, PlanChoiceInput } from "../validators/billing.validator";

export const GetPlans = (_req: Request, res: Response) => {
  res.set("Cache-Control", "public, max-age=300");
  sendSuccess(res, { message: "Plans", data: BillingService.getPlanCatalog() });
};

export const GetBilling = async (req: Request, res: Response) => {
  const overview = await BillingService.getOverview(getAuthenticatedUser(req));
  sendSuccess(res, { message: "Billing", data: overview });
};

export const RefreshBilling = async (req: Request, res: Response) => {
  const overview = await BillingService.refresh(getAuthenticatedUser(req));
  sendSuccess(res, { message: "Billing refreshed from Stripe", data: overview });
};

export const StartCheckout = async (req: Request, res: Response) => {
  const result = await BillingService.startCheckout(
    getAuthenticatedUser(req),
    req.body as PlanChoiceInput,
  );
  sendSuccess(res, { message: "Checkout started", data: result });
};

export const ConfirmCheckout = async (req: Request, res: Response) => {
  const { sessionId } = req.body as ConfirmCheckoutInput;
  const overview = await BillingService.confirmCheckout(getAuthenticatedUser(req), sessionId);
  sendSuccess(res, { message: "Checkout confirmed", data: overview });
};

export const ChangePlan = async (req: Request, res: Response) => {
  const result = await BillingService.changePlan(
    getAuthenticatedUser(req),
    req.body as PlanChoiceInput,
  );
  sendSuccess(res, { message: "Plan change requested", data: result });
};

export const CancelSubscription = async (req: Request, res: Response) => {
  const result = await BillingService.cancelSubscription(getAuthenticatedUser(req));
  sendSuccess(res, {
    message: "Your subscription will end at the end of the period",
    data: result,
  });
};

export const ResumeSubscription = async (req: Request, res: Response) => {
  const overview = await BillingService.resumeSubscription(getAuthenticatedUser(req));
  sendSuccess(res, { message: "Your subscription will continue", data: overview });
};

export const CreatePortalSession = async (req: Request, res: Response) => {
  const result = await BillingService.createPortalSession(getAuthenticatedUser(req));
  sendSuccess(res, { message: "Billing portal ready", data: result });
};

/** Mounted with express.raw(), before the JSON parser, so the signature can be checked. */
export const StripeWebhook = async (req: Request, res: Response) => {
  const signature = req.header("stripe-signature") ?? undefined;
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const result = await BillingService.handleWebhook(body, signature);
  res.status(200).json({ received: true, ...result });
};

export const GetWorkspaceEntitlements = async (req: Request, res: Response) => {
  const { workspace } = getWorkspaceContext(req);
  const summary = await EntitlementService.getWorkspaceSummary(workspace);
  sendSuccess(res, { message: "Workspace plan", data: summary });
};
