import { Types } from "mongoose";
import type { PaidPlanValue, PlanValue } from "../../src/constants/billing.constant";
import { BillingAccount } from "../../src/models/billingAccount.model";

const DAY_MS = 86_400_000;

/**
 * Puts a user on a plan the way a synced Stripe subscription would. FREE is a
 * canceled subscription, since accounts without one get the test default (Agency).
 */
export const setUserPlan = async (userId: string, plan: PlanValue) => {
  const now = Date.now();
  await BillingAccount.findOneAndUpdate(
    { user: new Types.ObjectId(userId) },
    {
      $set: {
        stripeCustomerId: `cus_${userId}`,
        subscription: {
          stripeSubscriptionId: `sub_${userId}`,
          stripePriceId: null,
          stripeItemId: `si_${userId}`,
          plan: plan === "FREE" ? "CREATOR" : (plan as PaidPlanValue),
          interval: "month",
          unitAmount: null,
          currency: null,
          quantity: 1,
          status: plan === "FREE" ? "canceled" : "active",
          currentPeriodStart: new Date(now - DAY_MS),
          currentPeriodEnd: new Date(now + 29 * DAY_MS),
          cancelAtPeriodEnd: false,
          cancelAt: null,
          canceledAt: null,
          endedAt: null,
          trialEnd: null,
          stripeScheduleId: null,
          scheduledChange: null,
          stripeCreatedAt: new Date(now - DAY_MS),
        },
        paymentFailedAt: null,
        graceUntil: null,
        lastPaymentError: null,
      },
    },
    { upsert: true },
  );
};
