/**
 * The only place that talks to Stripe. Services depend on this interface, so
 * tests swap in a fake without any network, while webhook signatures are still
 * verified with Stripe's real implementation.
 */
import Stripe from "stripe";
import { env } from "../../config/env";
import { AppError } from "../../utils/appError.util";

export type StripeSubscription = Stripe.Subscription;
export type StripeEvent = Stripe.Event;
export type StripeSubscriptionSchedule = Stripe.SubscriptionSchedule;

export interface StripeGateway {
  readonly configured: boolean;
  createCustomer(
    params: { email: string; name: string; metadata: Record<string, string> },
    idempotencyKey: string,
  ): Promise<{ id: string }>;
  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey?: string,
  ): Promise<{ id: string; url: string | null }>;
  retrieveCheckoutSession(id: string): Promise<Stripe.Checkout.Session>;
  createPortalSession(params: { customer: string; return_url: string }): Promise<{ url: string }>;
  retrieveSubscription(id: string): Promise<StripeSubscription>;
  listCustomerSubscriptions(customerId: string): Promise<StripeSubscription[]>;
  updateSubscription(
    id: string,
    params: Stripe.SubscriptionUpdateParams,
    idempotencyKey?: string,
  ): Promise<StripeSubscription>;
  createScheduleFromSubscription(subscriptionId: string): Promise<StripeSubscriptionSchedule>;
  updateSchedule(
    id: string,
    params: Stripe.SubscriptionScheduleUpdateParams,
  ): Promise<StripeSubscriptionSchedule>;
  retrieveSchedule(id: string): Promise<StripeSubscriptionSchedule>;
  releaseSchedule(id: string): Promise<StripeSubscriptionSchedule>;
  constructEvent(payload: Buffer | string, signature: string, secret: string): StripeEvent;
}

/** Signature checks don't need an API key, so they work even in tests. */
const verifier = new Stripe("sk_verify_only_no_requests_are_made");

const notConfigured = () => AppError.serviceUnavailable("Billing isn't set up on this server yet.");

export class LiveStripeGateway implements StripeGateway {
  private readonly client: Stripe | null;

  constructor(secretKey: string | undefined) {
    this.client = secretKey
      ? new Stripe(secretKey, {
          maxNetworkRetries: 2,
          timeout: 20_000,
          appInfo: { name: "FlowPost" },
        })
      : null;
  }

  get configured() {
    return this.client !== null;
  }

  private get stripe(): Stripe {
    if (!this.client) throw notConfigured();
    return this.client;
  }

  async createCustomer(
    params: { email: string; name: string; metadata: Record<string, string> },
    idempotencyKey: string,
  ) {
    const customer = await this.stripe.customers.create(params, { idempotencyKey });
    return { id: customer.id };
  }

  async createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey?: string,
  ) {
    const session = await this.stripe.checkout.sessions.create(
      params,
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    return { id: session.id, url: session.url };
  }

  retrieveCheckoutSession(id: string) {
    return this.stripe.checkout.sessions.retrieve(id);
  }

  async createPortalSession(params: { customer: string; return_url: string }) {
    const session = await this.stripe.billingPortal.sessions.create(params);
    return { url: session.url };
  }

  retrieveSubscription(id: string) {
    return this.stripe.subscriptions.retrieve(id);
  }

  async listCustomerSubscriptions(customerId: string) {
    const page = await this.stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });
    return page.data;
  }

  updateSubscription(id: string, params: Stripe.SubscriptionUpdateParams, idempotencyKey?: string) {
    return this.stripe.subscriptions.update(
      id,
      params,
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  }

  createScheduleFromSubscription(subscriptionId: string) {
    return this.stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
  }

  updateSchedule(id: string, params: Stripe.SubscriptionScheduleUpdateParams) {
    return this.stripe.subscriptionSchedules.update(id, params);
  }

  retrieveSchedule(id: string) {
    return this.stripe.subscriptionSchedules.retrieve(id);
  }

  releaseSchedule(id: string) {
    return this.stripe.subscriptionSchedules.release(id);
  }

  constructEvent(payload: Buffer | string, signature: string, secret: string) {
    return verifier.webhooks.constructEvent(payload, signature, secret);
  }
}

let gateway: StripeGateway = new LiveStripeGateway(env.STRIPE_SECRET_KEY);

export const getStripeGateway = () => gateway;

/** Test hook. Returns a function that restores the previous gateway. */
export const setStripeGateway = (next: StripeGateway) => {
  const previous = gateway;
  gateway = next;
  return () => {
    gateway = previous;
  };
};

/** Builds a signed payload the way Stripe does, for tests and local tooling. */
export const signTestPayload = (payload: string, secret: string) =>
  verifier.webhooks.generateTestHeaderString({ payload, secret });
