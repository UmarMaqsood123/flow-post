import { Router } from "express";
import * as BillingController from "../controllers/billing.controller";

/** /api/v1/plans: the public plan catalog shown on the pricing page. No sign-in needed. */
const PlansRouter = Router();

PlansRouter.get("/", BillingController.GetPlans);

export { PlansRouter };
