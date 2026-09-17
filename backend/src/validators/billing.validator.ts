import { z } from "zod";
import { BILLING_INTERVALS, PAID_PLANS } from "../constants/billing.constant";

/** Only the choice is accepted; price ids, amounts and statuses never come from the client. */
export const planChoiceSchema = z.strictObject({
  plan: z.enum(PAID_PLANS, { error: "Choose Creator, Pro or Agency" }),
  interval: z.enum(BILLING_INTERVALS).default("month"),
});
export type PlanChoiceInput = z.infer<typeof planChoiceSchema>;

export const confirmCheckoutSchema = z.strictObject({
  sessionId: z.string().regex(/^cs_[A-Za-z0-9_]{10,250}$/, "Invalid checkout session"),
});
export type ConfirmCheckoutInput = z.infer<typeof confirmCheckoutSchema>;
