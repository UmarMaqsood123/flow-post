import type Stripe from "stripe";
import {
  LiveStripeGateway,
  type StripeGateway,
  type StripeSubscription,
  type StripeSubscriptionSchedule,
} from "../../src/integrations/billing/stripeGateway";

const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);

/**
 * In-memory Stripe for tests: customers, checkout sessions, subscriptions and
 * schedules, with the calls recorded. Webhook signatures use Stripe's real code.
 */
export class FakeStripeGateway implements StripeGateway {
  readonly configured = true;
  readonly customers = new Map<
    string,
    { id: string; email: string; metadata: Record<string, string> }
  >();
  readonly sessions = new Map<string, Stripe.Checkout.Session>();
  readonly subscriptions = new Map<string, StripeSubscription>();
  readonly schedules = new Map<string, StripeSubscriptionSchedule>();
  readonly calls: { method: string; args: unknown[] }[] = [];
  /** The next upgrade's payment fails, so Stripe leaves a pending update instead. */
  failNextUpgradePayment = false;
  private counter = 0;
  private readonly verifier = new LiveStripeGateway(undefined);

  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}_${this.counter}`;
  }

  private record(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }

  callsTo(method: string) {
    return this.calls.filter((call) => call.method === method);
  }

  createCustomer(
    params: { email: string; name: string; metadata: Record<string, string> },
    idempotencyKey: string,
  ) {
    this.record("createCustomer", params, idempotencyKey);
    const existing = [...this.customers.values()].find(
      (customer) => customer.metadata.idempotencyKey === idempotencyKey,
    );
    if (existing) return Promise.resolve({ id: existing.id });
    const id = this.nextId("cus");
    this.customers.set(id, {
      id,
      email: params.email,
      metadata: { ...params.metadata, idempotencyKey },
    });
    return Promise.resolve({ id });
  }

  createCheckoutSession(params: Stripe.Checkout.SessionCreateParams, idempotencyKey?: string) {
    this.record("createCheckoutSession", params, idempotencyKey);
    const id = this.nextId("cs_test_session");
    this.sessions.set(id, {
      id,
      object: "checkout.session",
      mode: "subscription",
      customer: params.customer ?? null,
      client_reference_id: params.client_reference_id ?? null,
      subscription: null,
      url: `https://checkout.stripe.test/${id}`,
      metadata: params.metadata ?? {},
      line_items: params.line_items,
      subscription_data: params.subscription_data,
    } as unknown as Stripe.Checkout.Session);
    return Promise.resolve({ id, url: `https://checkout.stripe.test/${id}` });
  }

  /** What Stripe does when the customer pays: creates the subscription. */
  completeCheckout(sessionId: string, status: Stripe.Subscription.Status = "active") {
    const session = this.sessions.get(sessionId)!;
    const lineItems = (session as unknown as { line_items: { price: string }[] }).line_items;
    const subscriptionData = (
      session as unknown as {
        subscription_data?: { metadata?: Record<string, string> };
      }
    ).subscription_data;
    const subscription = this.createSubscription({
      customer: session.customer as string,
      price: lineItems[0].price,
      status,
      metadata: subscriptionData?.metadata ?? {},
    });
    session.subscription = subscription.id;
    return subscription;
  }

  createSubscription({
    customer,
    price,
    status = "active",
    metadata = {},
  }: {
    customer: string;
    price: string;
    status?: Stripe.Subscription.Status;
    metadata?: Record<string, string>;
  }) {
    const id = this.nextId("sub");
    const start = now() - DAY;
    const subscription = {
      id,
      object: "subscription",
      customer,
      status,
      created: start,
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_end: null,
      schedule: null,
      pending_update: null,
      metadata,
      items: {
        data: [
          {
            id: this.nextId("si"),
            price: { id: price },
            quantity: 1,
            current_period_start: start,
            current_period_end: start + 30 * DAY,
          },
        ],
      },
    } as unknown as StripeSubscription;
    this.subscriptions.set(id, subscription);
    return subscription;
  }

  retrieveCheckoutSession(id: string) {
    const session = this.sessions.get(id);
    return session ? Promise.resolve(session) : Promise.reject(new Error("No such session"));
  }

  createPortalSession(params: { customer: string; return_url: string }) {
    this.record("createPortalSession", params);
    return Promise.resolve({ url: `https://billing.stripe.test/${params.customer}` });
  }

  retrieveSubscription(id: string) {
    this.record("retrieveSubscription", id);
    const subscription = this.subscriptions.get(id);
    return subscription
      ? Promise.resolve(structuredClone(subscription))
      : Promise.reject(new Error(`No such subscription: ${id}`));
  }

  listCustomerSubscriptions(customerId: string) {
    return Promise.resolve(
      [...this.subscriptions.values()].filter((item) => item.customer === customerId),
    );
  }

  updateSubscription(id: string, params: Stripe.SubscriptionUpdateParams) {
    this.record("updateSubscription", id, params);
    const subscription = this.subscriptions.get(id)!;
    const newPrice = params.items?.[0]?.price;
    if (newPrice) {
      if (this.failNextUpgradePayment) {
        this.failNextUpgradePayment = false;
        (subscription as unknown as { pending_update: unknown }).pending_update = {
          subscription_items: [{ price: newPrice }],
        };
      } else {
        (subscription.items.data[0] as unknown as { price: { id: string } }).price = {
          id: newPrice,
        };
      }
    }
    if (params.cancel_at_period_end !== undefined) {
      subscription.cancel_at_period_end = params.cancel_at_period_end;
      subscription.cancel_at = params.cancel_at_period_end
        ? subscription.items.data[0].current_period_end
        : null;
    }
    return Promise.resolve(structuredClone(subscription));
  }

  createScheduleFromSubscription(subscriptionId: string) {
    this.record("createScheduleFromSubscription", subscriptionId);
    const subscription = this.subscriptions.get(subscriptionId)!;
    const item = subscription.items.data[0];
    const id = this.nextId("sub_sched");
    const schedule = {
      id,
      object: "subscription_schedule",
      subscription: subscriptionId,
      released_subscription: null,
      status: "active",
      phases: [
        {
          start_date: item.current_period_start,
          end_date: item.current_period_end,
          items: [{ price: item.price.id, quantity: 1 }],
        },
      ],
    } as unknown as StripeSubscriptionSchedule;
    this.schedules.set(id, schedule);
    (subscription as unknown as { schedule: string }).schedule = id;
    return Promise.resolve(structuredClone(schedule));
  }

  updateSchedule(id: string, params: Stripe.SubscriptionScheduleUpdateParams) {
    this.record("updateSchedule", id, params);
    const schedule = this.schedules.get(id)!;
    const phases = params.phases ?? [];
    let previousEnd = 0;
    (schedule as unknown as { phases: unknown[] }).phases = phases.map((phase) => {
      const start = typeof phase.start_date === "number" ? phase.start_date : previousEnd;
      const end = typeof phase.end_date === "number" ? phase.end_date : start + 30 * DAY;
      previousEnd = end;
      return {
        start_date: start,
        end_date: end,
        items: (phase.items ?? []).map((item) => ({ price: item.price, quantity: item.quantity })),
      };
    });
    return Promise.resolve(structuredClone(schedule));
  }

  retrieveSchedule(id: string) {
    return Promise.resolve(structuredClone(this.schedules.get(id)!));
  }

  /** The next schedule release fails with this error. */
  failNextRelease: Error | null = null;

  releaseSchedule(id: string) {
    this.record("releaseSchedule", id);
    if (this.failNextRelease) {
      const error = this.failNextRelease;
      this.failNextRelease = null;
      return Promise.reject(error);
    }
    const schedule = this.schedules.get(id)!;
    const subscriptionId = schedule.subscription as string;
    (
      schedule as unknown as { status: string; subscription: null; released_subscription: string }
    ).status = "released";
    (schedule as unknown as { subscription: null }).subscription = null;
    (schedule as unknown as { released_subscription: string }).released_subscription =
      subscriptionId;
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) (subscription as unknown as { schedule: null }).schedule = null;
    return Promise.resolve(structuredClone(schedule));
  }

  constructEvent(payload: Buffer | string, signature: string, secret: string) {
    return this.verifier.constructEvent(payload, signature, secret);
  }
}
