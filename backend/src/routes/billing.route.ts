import { Router } from "express";
import * as BillingController from "../controllers/billing.controller";
import { authenticate, noStore } from "../middlewares/auth.middleware";
import { billingRateLimiter } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import { confirmCheckoutSchema, planChoiceSchema } from "../validators/billing.validator";

/**
 * /api/v1/billing: the signed-in user's own subscription. A subscription
 * belongs to a person and covers the workspaces they're the billing owner of.
 * The webhook is mounted separately in app.ts, before the JSON body parser.
 */
const BillingRouter = Router();

BillingRouter.use(authenticate, noStore);

BillingRouter.get("/", BillingController.GetBilling);
BillingRouter.post("/refresh", billingRateLimiter, BillingController.RefreshBilling);
BillingRouter.post(
  "/checkout",
  billingRateLimiter,
  validate({ body: planChoiceSchema }),
  BillingController.StartCheckout,
);
BillingRouter.post(
  "/checkout/confirm",
  billingRateLimiter,
  validate({ body: confirmCheckoutSchema }),
  BillingController.ConfirmCheckout,
);
BillingRouter.post(
  "/subscription/change",
  billingRateLimiter,
  validate({ body: planChoiceSchema }),
  BillingController.ChangePlan,
);
BillingRouter.post(
  "/subscription/cancel",
  billingRateLimiter,
  BillingController.CancelSubscription,
);
BillingRouter.post(
  "/subscription/resume",
  billingRateLimiter,
  BillingController.ResumeSubscription,
);
BillingRouter.post("/portal", billingRateLimiter, BillingController.CreatePortalSession);

export { BillingRouter };
