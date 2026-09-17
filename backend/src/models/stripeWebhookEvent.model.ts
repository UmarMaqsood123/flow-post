import mongoose, { type HydratedDocument, type Model, Schema } from "mongoose";
import {
  WEBHOOK_EVENT_STATUSES,
  type WebhookEventStatusValue,
} from "../constants/billing.constant";

/**
 * One row per Stripe event id. The unique index is what makes webhooks
 * idempotent: a redelivered event finds its row and is skipped once processed.
 */
export interface IStripeWebhookEvent {
  eventId: string;
  type: string;
  livemode: boolean;
  status: WebhookEventStatusValue;
  attempts: number;
  /** When a worker claimed it; a stale claim means that worker died. */
  lockedAt: Date | null;
  processedAt: Date | null;
  /** True when the event type isn't one we act on. */
  ignored: boolean;
  error: string | null;
  stripeCreatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type StripeWebhookEventDocument = HydratedDocument<IStripeWebhookEvent>;

const StripeWebhookEventSchema = new Schema<IStripeWebhookEvent>(
  {
    eventId: { type: String, required: true, maxlength: 255 },
    type: { type: String, required: true, maxlength: 100 },
    livemode: { type: Boolean, default: false },
    status: { type: String, enum: WEBHOOK_EVENT_STATUSES, required: true },
    attempts: { type: Number, default: 1, min: 0 },
    lockedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    ignored: { type: Boolean, default: false },
    error: { type: String, default: null, maxlength: 1000 },
    stripeCreatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

StripeWebhookEventSchema.index({ eventId: 1 }, { unique: true });
// Stripe stops retrying after 3 days; keep a month for support and audits.
StripeWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const StripeWebhookEvent: Model<IStripeWebhookEvent> = mongoose.model<IStripeWebhookEvent>(
  "StripeWebhookEvent",
  StripeWebhookEventSchema,
);
