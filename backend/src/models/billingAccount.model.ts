import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  BILLING_INTERVALS,
  type BillingIntervalValue,
  PAID_PLANS,
  type PaidPlanValue,
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatusValue,
} from "../constants/billing.constant";

/**
 * A copy of the user's Stripe subscription, written only from data fetched from
 * Stripe (webhooks trigger a re-fetch; the event body is never trusted on its
 * own, and nothing here comes from the client).
 */
export interface IBillingSubscription {
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  stripeItemId: string | null;
  /** Null when the price isn't one of ours, so no paid plan applies. */
  plan: PaidPlanValue | null;
  interval: BillingIntervalValue | null;
  /** What Stripe charges per interval, in the currency's smallest unit. Null if unknown. */
  unitAmount: number | null;
  currency: string | null;
  quantity: number;
  status: SubscriptionStatusValue;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  trialEnd: Date | null;
  stripeScheduleId: string | null;
  /** A downgrade booked for the end of the period. */
  scheduledChange: {
    plan: PaidPlanValue;
    interval: BillingIntervalValue;
    effectiveAt: Date;
  } | null;
  stripeCreatedAt: Date;
}

/**
 * A plan granted by an operator from the command line (complimentary access,
 * a partner, local testing). Separate from Stripe: syncs never touch it, and it
 * only applies when it's higher than what the subscription gives.
 */
export interface IPlanOverride {
  plan: PaidPlanValue;
  /** Null means until revoked. */
  expiresAt: Date | null;
  reason: string | null;
  grantedAt: Date;
}

export interface IBillingAccount {
  user: Types.ObjectId;
  planOverride: IPlanOverride | null;
  stripeCustomerId: string | null;
  subscription: IBillingSubscription | null;
  /** First failed payment in the current run of failures; cleared when a payment succeeds. */
  paymentFailedAt: Date | null;
  /** The plan stays in force until this date while Stripe retries. */
  graceUntil: Date | null;
  lastPaymentError: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type BillingAccountDocument = HydratedDocument<IBillingAccount>;

const SubscriptionSchema = new Schema<IBillingSubscription>(
  {
    stripeSubscriptionId: { type: String, required: true, maxlength: 255 },
    stripePriceId: { type: String, default: null, maxlength: 255 },
    stripeItemId: { type: String, default: null, maxlength: 255 },
    plan: { type: String, enum: [...PAID_PLANS, null], default: null },
    interval: { type: String, enum: [...BILLING_INTERVALS, null], default: null },
    unitAmount: { type: Number, default: null, min: 0 },
    currency: { type: String, default: null, maxlength: 10 },
    quantity: { type: Number, default: 1, min: 0 },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, required: true },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    stripeScheduleId: { type: String, default: null, maxlength: 255 },
    scheduledChange: {
      type: new Schema(
        {
          plan: { type: String, enum: PAID_PLANS, required: true },
          interval: { type: String, enum: BILLING_INTERVALS, required: true },
          effectiveAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    stripeCreatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const PlanOverrideSchema = new Schema<IPlanOverride>(
  {
    plan: { type: String, enum: PAID_PLANS, required: true },
    expiresAt: { type: Date, default: null },
    reason: { type: String, default: null, maxlength: 300 },
    grantedAt: { type: Date, required: true },
  },
  { _id: false },
);

const BillingAccountSchema = new Schema<IBillingAccount>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    planOverride: { type: PlanOverrideSchema, default: null },
    stripeCustomerId: { type: String, default: null, maxlength: 255 },
    subscription: { type: SubscriptionSchema, default: null },
    paymentFailedAt: { type: Date, default: null },
    graceUntil: { type: Date, default: null },
    lastPaymentError: { type: String, default: null, maxlength: 500 },
    lastSyncedAt: { type: Date, default: null },
  },
  // Concurrent syncs of one account conflict instead of silently overwriting.
  { timestamps: true, optimisticConcurrency: true },
);

BillingAccountSchema.index({ user: 1 }, { unique: true });
BillingAccountSchema.index(
  { stripeCustomerId: 1 },
  { unique: true, partialFilterExpression: { stripeCustomerId: { $type: "string" } } },
);
BillingAccountSchema.index({ "subscription.stripeSubscriptionId": 1 });
// The reconcile sweep reads subscriptions that can still change.
BillingAccountSchema.index({ "subscription.status": 1, lastSyncedAt: 1 });

export const BillingAccount: Model<IBillingAccount> = mongoose.model<IBillingAccount>(
  "BillingAccount",
  BillingAccountSchema,
);
