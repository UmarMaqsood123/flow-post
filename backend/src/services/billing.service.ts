/**
 * Stripe subscription billing for a user's account.
 *
 * Trust model: the plan and status we store are only ever written from objects
 * fetched from Stripe by the server. Webhooks and the checkout return page are
 * signals to go and fetch; neither the webhook body nor anything the browser
 * sends decides what someone is entitled to.
 */
import mongoose, { type Types } from "mongoose";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  type BillingIntervalValue,
  ENTITLED_STATUSES,
  PAID_PLANS,
  type PaidPlanValue,
  PLAN_DEFINITIONS,
  PLAN_RANK,
  PLANS,
  type PlanValue,
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatusValue,
  TERMINAL_STATUSES,
} from "../constants/billing.constant";
import { ErrorCode, HttpStatus } from "../constants/http.constant";
import {
  getStripeGateway,
  type StripeEvent,
  type StripeSubscription,
} from "../integrations/billing/stripeGateway";
import {
  BillingAccount,
  type BillingAccountDocument,
  type IBillingSubscription,
} from "../models/billingAccount.model";
import { StripeWebhookEvent } from "../models/stripeWebhookEvent.model";
import { User, type UserDocument } from "../models/user.model";
import { Workspace } from "../models/workspace.model";
import { AppError } from "../utils/appError.util";
import { sendMail } from "../utils/mailer.util";
import { paymentFailedEmailTemplate } from "../utils/emailTemplates.util";
import * as EntitlementService from "./entitlement.service";
import { dispatchEmail } from "./email.service";
import * as NotificationEvents from "./notificationEvents.service";

const DAY_MS = 86_400_000;
/** Checkouts for the same plan within this window reuse one Stripe session. */
const CHECKOUT_DEDUPE_WINDOW_MS = 10 * 60_000;
/** A webhook claimed longer ago than this was abandoned by a crashed process. */
const WEBHOOK_LOCK_TIMEOUT_MS = 5 * 60_000;

// ── Prices ─────────────────────────────────────────────────

const PRICE_IDS: Record<PaidPlanValue, Record<BillingIntervalValue, string | undefined>> = {
  CREATOR: { month: env.STRIPE_PRICE_CREATOR_MONTHLY, year: env.STRIPE_PRICE_CREATOR_YEARLY },
  PRO: { month: env.STRIPE_PRICE_PRO_MONTHLY, year: env.STRIPE_PRICE_PRO_YEARLY },
  AGENCY: { month: env.STRIPE_PRICE_AGENCY_MONTHLY, year: env.STRIPE_PRICE_AGENCY_YEARLY },
};

/** The configured Stripe price ids, for the admin panel. */
export const configuredPrices = () => PRICE_IDS;

/** Which plan a Stripe price is. Unknown prices grant nothing. */
export const planForPrice = (
  priceId: string | null | undefined,
): { plan: PaidPlanValue; interval: BillingIntervalValue } | null => {
  if (!priceId) return null;
  for (const plan of PAID_PLANS) {
    for (const interval of ["month", "year"] as const) {
      if (PRICE_IDS[plan][interval] === priceId) return { plan, interval };
    }
  }
  return null;
};

const priceFor = (plan: PaidPlanValue, interval: BillingIntervalValue) => {
  const price = PRICE_IDS[plan][interval];
  if (!price) {
    throw new AppError(
      `${PLAN_DEFINITIONS[plan].label} isn't available with ${interval === "year" ? "yearly" : "monthly"} billing.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { code: ErrorCode.VALIDATION_ERROR },
    );
  }
  return price;
};

const requireGateway = () => {
  const gateway = getStripeGateway();
  if (!gateway.configured) {
    throw AppError.serviceUnavailable("Billing isn't set up on this server yet.");
  }
  return gateway;
};

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

const toDate = (seconds: number | null | undefined) =>
  typeof seconds === "number" ? new Date(seconds * 1000) : null;

const billingUrl = (query = "") => `${env.FRONTEND_URL.replace(/\/$/, "")}/billing${query}`;

// ── Public shape ───────────────────────────────────────────

const publicSubscription = (subscription: IBillingSubscription | null) =>
  subscription
    ? {
        plan: subscription.plan,
        interval: subscription.interval,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        cancelAt: subscription.cancelAt,
        trialEnd: subscription.trialEnd,
        scheduledChange: subscription.scheduledChange
          ? {
              plan: subscription.scheduledChange.plan,
              interval: subscription.scheduledChange.interval,
              effectiveAt: subscription.scheduledChange.effectiveAt,
            }
          : null,
      }
    : null;

export const getOverview = async (user: UserDocument) => {
  const account = await BillingAccount.findOne({ user: user._id });
  const resolution = EntitlementService.resolvePlan(account);
  const usage = await EntitlementService.getAccountUsage(user._id, account);
  const workspaces = await Workspace.find({
    _id: { $in: await EntitlementService.billedWorkspaceIds(user._id, { activeOnly: true }) },
  })
    .select("name")
    .lean();

  return {
    configured: getStripeGateway().configured,
    plan: resolution.plan,
    planReason: resolution.reason,
    planOverride: account?.planOverride
      ? { plan: account.planOverride.plan, expiresAt: account.planOverride.expiresAt }
      : null,
    subscription: publicSubscription(account?.subscription ?? null),
    payment: {
      failedAt: account?.paymentFailedAt ?? null,
      graceUntil: account?.graceUntil ?? null,
      error: account?.lastPaymentError ?? null,
    },
    hasCustomer: Boolean(account?.stripeCustomerId),
    usage,
    workspaces: workspaces.map((workspace) => ({
      id: workspace._id.toString(),
      name: workspace.name,
    })),
    plans: PLANS.map((plan) => ({
      plan,
      ...PLAN_DEFINITIONS[plan],
      intervals:
        plan === "FREE"
          ? []
          : (["month", "year"] as const).filter((interval) => Boolean(PRICE_IDS[plan][interval])),
    })),
  };
};

// ── Applying Stripe's state ────────────────────────────────

const STATUS_PRIORITY: SubscriptionStatusValue[] = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
  "incomplete_expired",
  "canceled",
];

const statusOf = (status: string): SubscriptionStatusValue =>
  (SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
    ? (status as SubscriptionStatusValue)
    : "incomplete";

/** With several subscriptions on one customer, the live one wins, then the newest. */
const pickSubscription = (subscriptions: StripeSubscription[]) =>
  [...subscriptions].sort(
    (left, right) =>
      STATUS_PRIORITY.indexOf(statusOf(left.status)) -
        STATUS_PRIORITY.indexOf(statusOf(right.status)) || right.created - left.created,
  )[0] ?? null;

/** A downgrade booked on the subscription's schedule, if there is one. */
const scheduledChangeOf = async (
  subscription: StripeSubscription,
  periodEnd: Date | null,
): Promise<IBillingSubscription["scheduledChange"]> => {
  const scheduleRef = subscription.schedule;
  if (!scheduleRef) return null;
  const schedule =
    typeof scheduleRef === "string"
      ? await getStripeGateway().retrieveSchedule(scheduleRef)
      : scheduleRef;
  const now = Date.now() / 1000;
  const next = schedule.phases.find(
    (phase) =>
      phase.start_date > now &&
      (!periodEnd || phase.start_date >= Math.floor(periodEnd.getTime() / 1000)),
  );
  const mapped = planForPrice(idOf(next?.items[0]?.price));
  return next && mapped
    ? {
        plan: mapped.plan,
        interval: mapped.interval,
        effectiveAt: new Date(next.start_date * 1000),
      }
    : null;
};

/**
 * Copies a subscription fetched from Stripe onto the account. Called with
 * fresh data every time, so the order webhooks arrive in doesn't matter.
 */
const applySubscription = async (
  account: BillingAccountDocument,
  subscription: StripeSubscription,
): Promise<BillingAccountDocument> => {
  const status = statusOf(subscription.status);
  const current = account.subscription;

  // Another subscription on the customer: don't let an old or dead one replace a live one.
  if (current && current.stripeSubscriptionId !== subscription.id) {
    const currentLive = !TERMINAL_STATUSES.includes(current.status);
    const incomingLive = !TERMINAL_STATUSES.includes(status);
    const incomingOlder = subscription.created * 1000 < current.stripeCreatedAt.getTime();
    if (currentLive && (!incomingLive || incomingOlder)) {
      logger.warn(
        {
          accountId: account.id,
          stored: current.stripeSubscriptionId,
          incoming: subscription.id,
          status,
        },
        "Ignoring a subscription that would replace the live one",
      );
      return account;
    }
  }

  const item = subscription.items.data[0];
  const priceId = idOf(item?.price);
  const mapped = planForPrice(priceId);
  if (!mapped) {
    logger.error(
      { accountId: account.id, subscriptionId: subscription.id, priceId },
      "Subscription uses a price that isn't mapped to a plan",
    );
  }
  const currentPeriodEnd = toDate(item?.current_period_end);

  account.subscription = {
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    stripeItemId: item?.id ?? null,
    plan: mapped?.plan ?? null,
    interval: mapped?.interval ?? null,
    unitAmount: typeof item?.price === "object" ? (item.price.unit_amount ?? null) : null,
    currency: typeof item?.price === "object" ? (item.price.currency ?? null) : null,
    quantity: item?.quantity ?? 1,
    status,
    currentPeriodStart: toDate(item?.current_period_start),
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: toDate(subscription.cancel_at),
    canceledAt: toDate(subscription.canceled_at),
    endedAt: toDate(subscription.ended_at),
    trialEnd: toDate(subscription.trial_end),
    stripeScheduleId: idOf(subscription.schedule),
    scheduledChange: TERMINAL_STATUSES.includes(status)
      ? null
      : await scheduledChangeOf(subscription, currentPeriodEnd),
    stripeCreatedAt: new Date(subscription.created * 1000),
  };

  if (ENTITLED_STATUSES.includes(status) || TERMINAL_STATUSES.includes(status)) {
    account.set({ paymentFailedAt: null, graceUntil: null, lastPaymentError: null });
  } else if ((status === "past_due" || status === "unpaid") && !account.paymentFailedAt) {
    const now = new Date();
    account.set({
      paymentFailedAt: now,
      graceUntil: new Date(now.getTime() + env.BILLING_GRACE_DAYS * DAY_MS),
    });
  }
  account.lastSyncedAt = new Date();
  await account.save();

  logger.info(
    {
      accountId: account.id,
      subscriptionId: subscription.id,
      status,
      plan: mapped?.plan ?? null,
      effectivePlan: EntitlementService.resolvePlan(account).plan,
    },
    "Subscription synchronized",
  );
  return account;
};

/**
 * Finds whose subscription this is. The customer id is the link; the user id in
 * the subscription metadata (which only the server sets) covers the first sync.
 */
const accountForSubscription = async (subscription: StripeSubscription) => {
  const customerId = idOf(subscription.customer);
  if (customerId) {
    const byCustomer = await BillingAccount.findOne({ stripeCustomerId: customerId });
    if (byCustomer) return byCustomer;
  }
  const userId = subscription.metadata?.userId;
  if (userId && /^[a-f\d]{24}$/i.test(userId)) {
    const byUser = await BillingAccount.findOne({ user: userId });
    if (byUser && (!byUser.stripeCustomerId || byUser.stripeCustomerId === customerId)) {
      byUser.stripeCustomerId = customerId;
      return byUser;
    }
  }
  logger.warn(
    { subscriptionId: subscription.id, customerId },
    "Subscription doesn't belong to any billing account",
  );
  return null;
};

/**
 * Fetches and applies. Two syncs of the same account at once (e.g. two webhooks)
 * would otherwise let the slower, older fetch overwrite the newer one; the account
 * uses optimistic concurrency, so the loser re-fetches from Stripe and tries again.
 */
export const syncSubscriptionById = async (subscriptionId: string) => {
  for (let attempt = 1; ; attempt += 1) {
    const subscription = await getStripeGateway().retrieveSubscription(subscriptionId);
    const account = await accountForSubscription(subscription);
    if (!account) return null;
    try {
      return await applySubscription(account, subscription);
    } catch (error) {
      if (!(error instanceof mongoose.Error.VersionError) || attempt >= 3) throw error;
    }
  }
};

/** Re-reads the customer's subscriptions from Stripe. */
const syncAccount = async (account: BillingAccountDocument) => {
  if (!account.stripeCustomerId) return account;
  const subscriptions = await getStripeGateway().listCustomerSubscriptions(
    account.stripeCustomerId,
  );
  const chosen = pickSubscription(subscriptions);
  if (chosen) return applySubscription(account, chosen);
  if (account.subscription) {
    account.subscription = null;
    account.set({ paymentFailedAt: null, graceUntil: null, lastPaymentError: null });
  }
  account.lastSyncedAt = new Date();
  await account.save();
  return account;
};

// ── Customer and checkout ──────────────────────────────────

const loadOrCreateAccount = async (userId: Types.ObjectId) =>
  BillingAccount.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { upsert: true, returnDocument: "after" },
  ).orFail();

const ensureCustomer = async (user: UserDocument) => {
  const account = await loadOrCreateAccount(user._id);
  if (account.stripeCustomerId) return account;

  // The idempotency key means a double click creates one customer, not two.
  const customer = await requireGateway().createCustomer(
    { email: user.email, name: user.name, metadata: { userId: user.id } },
    `customer:${user.id}`,
  );
  const updated = await BillingAccount.findOneAndUpdate(
    { _id: account._id, stripeCustomerId: null },
    { $set: { stripeCustomerId: customer.id } },
    { returnDocument: "after" },
  );
  return updated ?? (await BillingAccount.findById(account._id).orFail());
};

const hasLiveSubscription = (account: BillingAccountDocument | null) =>
  Boolean(
    account?.subscription &&
    !TERMINAL_STATUSES.includes(account.subscription.status) &&
    account.subscription.status !== "incomplete",
  );

export const startCheckout = async (
  user: UserDocument,
  { plan, interval }: { plan: PaidPlanValue; interval: BillingIntervalValue },
) => {
  const gateway = requireGateway();
  if (!user.emailVerified) {
    throw AppError.forbidden(
      "Verify your email address before subscribing",
      ErrorCode.EMAIL_NOT_VERIFIED,
    );
  }
  const price = priceFor(plan, interval);

  const existing = await BillingAccount.findOne({ user: user._id });
  if (existing?.stripeCustomerId) await syncAccount(existing);
  if (hasLiveSubscription(existing)) {
    throw AppError.conflict("You already have a subscription. Change your plan instead.");
  }

  const account = await ensureCustomer(user);
  // Same user, plan and interval within a few minutes get the same Checkout
  // Session, so two tabs or a double click can't start two paid subscriptions.
  const bucket = Math.floor(Date.now() / CHECKOUT_DEDUPE_WINDOW_MS);
  const session = await gateway.createCheckoutSession(
    {
      mode: "subscription",
      customer: account.stripeCustomerId ?? undefined,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      // Stripe fills in the session id; it's only used to fetch the session server-side.
      success_url: billingUrl("?checkout=success&session_id={CHECKOUT_SESSION_ID}"),
      cancel_url: billingUrl("?checkout=cancelled"),
      metadata: { userId: user.id, plan },
      subscription_data: { metadata: { userId: user.id } },
    },
    `checkout:${user.id}:${price}:${bucket}`,
  );
  if (!session.url) throw AppError.serviceUnavailable("Stripe didn't return a checkout page.");
  logger.info({ userId: user.id, plan, interval, sessionId: session.id }, "Checkout started");
  return { url: session.url };
};

/**
 * The checkout return page calls this so the new plan shows up without waiting
 * for the webhook. The session is fetched from Stripe and must belong to this
 * user's customer; the browser only supplies which session to look at.
 */
export const confirmCheckout = async (user: UserDocument, sessionId: string) => {
  const gateway = requireGateway();
  const account = await BillingAccount.findOne({ user: user._id });
  const session = await gateway.retrieveCheckoutSession(sessionId).catch(() => null);
  if (
    !account?.stripeCustomerId ||
    !session ||
    idOf(session.customer) !== account.stripeCustomerId
  ) {
    throw AppError.notFound("Checkout session not found");
  }
  const subscriptionId = idOf(session.subscription);
  if (subscriptionId) await syncSubscriptionById(subscriptionId);
  return getOverview(user);
};

/** Pulls the latest state from Stripe on request, e.g. from a "refresh" button. */
export const refresh = async (user: UserDocument) => {
  const account = await BillingAccount.findOne({ user: user._id });
  if (account?.stripeCustomerId) {
    requireGateway();
    await syncAccount(account);
  }
  return getOverview(user);
};

export const createPortalSession = async (user: UserDocument) => {
  const gateway = requireGateway();
  const account = await BillingAccount.findOne({ user: user._id });
  if (!account?.stripeCustomerId) {
    throw AppError.conflict("There's no billing history yet. Choose a plan first.");
  }
  const session = await gateway.createPortalSession({
    customer: account.stripeCustomerId,
    return_url: billingUrl(),
  });
  return { url: session.url };
};

// ── Changing the subscription ──────────────────────────────

/** A current, live subscription, re-read from Stripe before anything changes it. */
const loadLiveSubscription = async (user: UserDocument) => {
  requireGateway();
  let account = await BillingAccount.findOne({ user: user._id });
  if (!account?.subscription) throw AppError.conflict("You don't have a subscription yet.");
  account = (await syncSubscriptionById(account.subscription.stripeSubscriptionId)) ?? account;
  const subscription = account.subscription;
  if (!subscription || TERMINAL_STATUSES.includes(subscription.status)) {
    throw AppError.conflict("Your subscription has ended. Choose a plan to subscribe again.");
  }
  return { account, subscription };
};

const releaseScheduleIfAny = async (subscription: IBillingSubscription) => {
  if (!subscription.stripeScheduleId) return;
  try {
    await getStripeGateway().releaseSchedule(subscription.stripeScheduleId);
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    // Already released, completed or gone: nothing left to undo. Anything else
    // (network, auth) must stop the change, or a stale downgrade would still apply.
    const alreadyEnded =
      code === "resource_missing" || /released|completed|canceled|not active/i.test(message ?? "");
    if (!alreadyEnded) throw error;
    logger.info({ scheduleId: subscription.stripeScheduleId }, "Schedule was already released");
  }
};

/** Resources above the new plan's limits. They're kept, but nothing new can be added. */
const overLimitWarnings = async (user: UserDocument, plan: PlanValue) => {
  const limits = PLAN_DEFINITIONS[plan].limits;
  const account = await BillingAccount.findOne({ user: user._id });
  const usage = await EntitlementService.getAccountUsage(user._id, account);
  const warnings: string[] = [];
  if (usage.workspaces > limits.workspaces) {
    warnings.push(
      `You have ${usage.workspaces} workspaces and ${PLAN_DEFINITIONS[plan].label} includes ${limits.workspaces}. Nothing is deleted, but you won't be able to create or restore more.`,
    );
  }
  if (usage.storageBytes > limits.storageBytes) {
    warnings.push(
      "Your media library is larger than this plan allows, so new uploads will be blocked.",
    );
  }
  if (!PLAN_DEFINITIONS[plan].features.autopilot) {
    warnings.push("Autopilot isn't included, so it will pause when the change takes effect.");
  }
  return warnings;
};

export const changePlan = async (
  user: UserDocument,
  { plan, interval }: { plan: PaidPlanValue; interval: BillingIntervalValue },
) => {
  const { subscription } = await loadLiveSubscription(user);
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    throw AppError.conflict(
      "Update your payment method in the billing portal before changing plans.",
    );
  }
  const gateway = getStripeGateway();
  const price = priceFor(plan, interval);
  const currentPlan = subscription.plan;
  const sameChoice = currentPlan === plan && subscription.interval === interval;

  if (sameChoice && !subscription.cancelAtPeriodEnd && !subscription.scheduledChange) {
    throw AppError.conflict(`You're already on ${PLAN_DEFINITIONS[plan].label}.`);
  }

  await releaseScheduleIfAny(subscription);

  if (sameChoice) {
    // Keeping the current plan: undo a pending cancellation or downgrade.
    await gateway.updateSubscription(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
  } else {
    const isUpgrade =
      !currentPlan ||
      PLAN_RANK[plan] > PLAN_RANK[currentPlan] ||
      (plan === currentPlan && interval === "year");

    if (isUpgrade || !subscription.currentPeriodEnd) {
      // Upgrades apply now and charge the difference immediately. With
      // pending_if_incomplete, the plan only changes once that payment succeeds.
      // Stripe accepts only item and proration parameters alongside
      // pending_if_incomplete, so a pending cancellation is undone separately first.
      if (subscription.cancelAtPeriodEnd) {
        await gateway.updateSubscription(subscription.stripeSubscriptionId, {
          cancel_at_period_end: false,
        });
      }
      await gateway.updateSubscription(
        subscription.stripeSubscriptionId,
        {
          items: [{ id: subscription.stripeItemId ?? undefined, price }],
          proration_behavior: "always_invoice",
          payment_behavior: "pending_if_incomplete",
        },
        // A double click within a minute sends one upgrade, not two invoices.
        `upgrade:${subscription.stripeSubscriptionId}:${price}:${Math.floor(Date.now() / 60_000)}`,
      );
    } else {
      // Downgrades wait for the end of the paid period, through a subscription schedule.
      if (subscription.cancelAtPeriodEnd) {
        await gateway.updateSubscription(subscription.stripeSubscriptionId, {
          cancel_at_period_end: false,
        });
      }
      const schedule = await gateway.createScheduleFromSubscription(
        subscription.stripeSubscriptionId,
      );
      const currentPhase = schedule.phases[0];
      await gateway.updateSchedule(schedule.id, {
        end_behavior: "release",
        phases: [
          {
            items: currentPhase.items.map((phaseItem) => ({
              price: idOf(phaseItem.price) ?? undefined,
              quantity: phaseItem.quantity ?? 1,
            })),
            start_date: currentPhase.start_date,
            end_date: currentPhase.end_date,
          },
          { items: [{ price, quantity: 1 }], proration_behavior: "none" },
        ],
      });
    }
  }

  await syncSubscriptionById(subscription.stripeSubscriptionId);
  logger.info({ userId: user.id, from: currentPlan, to: plan, interval }, "Plan change requested");
  const warnings =
    currentPlan && PLAN_RANK[plan] < PLAN_RANK[currentPlan]
      ? await overLimitWarnings(user, plan)
      : [];
  return { overview: await getOverview(user), warnings };
};

/** Cancels at the end of the paid period; the plan stays until then. */
export const cancelSubscription = async (user: UserDocument) => {
  const { subscription } = await loadLiveSubscription(user);
  if (subscription.cancelAtPeriodEnd) return { overview: await getOverview(user), warnings: [] };
  await releaseScheduleIfAny(subscription);
  await getStripeGateway().updateSubscription(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  await syncSubscriptionById(subscription.stripeSubscriptionId);
  logger.info({ userId: user.id }, "Subscription set to cancel at period end");
  return { overview: await getOverview(user), warnings: await overLimitWarnings(user, "FREE") };
};

export const resumeSubscription = async (user: UserDocument) => {
  const { subscription } = await loadLiveSubscription(user);
  if (!subscription.cancelAtPeriodEnd) {
    throw AppError.conflict("Your subscription isn't set to cancel.");
  }
  await getStripeGateway().updateSubscription(subscription.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
  await syncSubscriptionById(subscription.stripeSubscriptionId);
  return getOverview(user);
};

// ── Webhooks ───────────────────────────────────────────────

type ClaimResult = "claimed" | "duplicate" | "in-progress";

/** Records the event id. Only one delivery of an event is ever processed to completion. */
const claimEvent = async (event: StripeEvent): Promise<ClaimResult> => {
  try {
    await StripeWebhookEvent.create({
      eventId: event.id,
      type: event.type,
      livemode: event.livemode,
      status: "PROCESSING",
      attempts: 1,
      lockedAt: new Date(),
      stripeCreatedAt: new Date(event.created * 1000),
    });
    return "claimed";
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  // Seen before: retry it only if the last attempt failed or was abandoned.
  const reclaimed = await StripeWebhookEvent.findOneAndUpdate(
    {
      eventId: event.id,
      $or: [
        { status: "FAILED" },
        { status: "PROCESSING", lockedAt: { $lt: new Date(Date.now() - WEBHOOK_LOCK_TIMEOUT_MS) } },
      ],
    },
    { $set: { status: "PROCESSING", lockedAt: new Date(), error: null }, $inc: { attempts: 1 } },
  );
  if (reclaimed) return "claimed";
  const existing = await StripeWebhookEvent.findOne({ eventId: event.id }).select("status");
  return existing?.status === "PROCESSED" ? "duplicate" : "in-progress";
};

const invoiceSubscriptionId = (invoice: {
  parent?: { subscription_details?: { subscription?: string | { id: string } } | null } | null;
}) => idOf(invoice.parent?.subscription_details?.subscription);

const recordPaymentFailure = async (
  subscriptionId: string,
  message: string,
  { notify }: { notify: boolean },
) => {
  const account = await syncSubscriptionById(subscriptionId);
  const status = account?.subscription?.status;
  // Stripe says it's paid by now (a later retry worked): the failure is history.
  if (!account || !status || !["past_due", "unpaid", "incomplete"].includes(status)) return;

  // Conditional on Stripe still saying unpaid: a success recorded by another
  // webhook in the meantime isn't undone. Only the first failure notifies.
  const now = new Date();
  const updated = await BillingAccount.findOneAndUpdate(
    { _id: account._id, "subscription.status": { $in: ["past_due", "unpaid", "incomplete"] } },
    [
      {
        $set: {
          lastPaymentError: message,
          paymentFailedAt: { $ifNull: ["$paymentFailedAt", now] },
          graceUntil: {
            $ifNull: ["$graceUntil", new Date(now.getTime() + env.BILLING_GRACE_DAYS * DAY_MS)],
          },
        },
      },
    ],
    { returnDocument: "before", updatePipeline: true },
  );
  if (!updated) return;
  const firstFailure = !updated.lastPaymentError;
  account.set({
    lastPaymentError: message,
    paymentFailedAt: updated.paymentFailedAt ?? now,
    graceUntil: updated.graceUntil ?? new Date(now.getTime() + env.BILLING_GRACE_DAYS * DAY_MS),
  });

  if (notify && firstFailure) {
    const failedPlan = account.subscription?.plan;
    if (failedPlan) {
      await NotificationEvents.paymentFailed(
        account.user,
        failedPlan,
        message,
        account.paymentFailedAt ?? now,
      );
    }
    const user = await User.findById(account.user).select("name email");
    const plan = account.subscription?.plan;
    if (user && plan) {
      dispatchEmail(
        () =>
          sendMail({
            to: user.email,
            ...paymentFailedEmailTemplate({
              name: user.name,
              planLabel: PLAN_DEFINITIONS[plan].label,
              graceUntil: account.graceUntil ?? new Date(),
              url: billingUrl(),
            }),
          }),
        "payment-failed",
      );
    }
  }
  logger.warn({ accountId: account.id, subscriptionId, status }, "Subscription payment failed");
};

/** Acts on one verified event. Returns false for event types we don't handle. */
const processEvent = async (event: StripeEvent): Promise<boolean> => {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const subscriptionId = idOf(session.subscription);
      if (session.mode !== "subscription" || !subscriptionId) return false;
      await syncSubscriptionById(subscriptionId);
      return true;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "customer.subscription.pending_update_applied":
    case "customer.subscription.pending_update_expired":
      await syncSubscriptionById(event.data.object.id);
      return true;
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const subscriptionId = invoiceSubscriptionId(event.data.object);
      if (!subscriptionId) return false;
      await syncSubscriptionById(subscriptionId);
      return true;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (!subscriptionId) return false;
      const retry = toDate(invoice.next_payment_attempt);
      await recordPaymentFailure(
        subscriptionId,
        retry
          ? `Your latest payment didn't go through. Stripe will try again on ${retry.toDateString()}.`
          : "Your latest payment didn't go through. Update your payment method to keep your plan.",
        { notify: true },
      );
      return true;
    }
    case "invoice.payment_action_required": {
      const subscriptionId = invoiceSubscriptionId(event.data.object);
      if (!subscriptionId) return false;
      await recordPaymentFailure(
        subscriptionId,
        "Your bank needs you to confirm the payment. Open the billing portal to finish it.",
        { notify: true },
      );
      return true;
    }
    case "subscription_schedule.updated":
    case "subscription_schedule.released":
    case "subscription_schedule.completed":
    case "subscription_schedule.canceled": {
      const schedule = event.data.object;
      const subscriptionId = idOf(schedule.subscription) ?? schedule.released_subscription;
      if (!subscriptionId) return false;
      await syncSubscriptionById(subscriptionId);
      return true;
    }
    case "customer.deleted": {
      const account = await BillingAccount.findOne({ stripeCustomerId: event.data.object.id });
      if (!account) return false;
      account.set({
        stripeCustomerId: null,
        subscription: null,
        paymentFailedAt: null,
        graceUntil: null,
        lastPaymentError: null,
      });
      await account.save();
      return true;
    }
    default:
      return false;
  }
};

export type WebhookResult = { outcome: "processed" | "ignored" | "duplicate" | "in-progress" };

/**
 * Verifies the signature against the raw body, then processes each event id at
 * most once. A failure is recorded and rethrown so Stripe retries the delivery.
 */
export const handleWebhook = async (
  rawBody: Buffer,
  signature: string | undefined,
): Promise<WebhookResult> => {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw AppError.serviceUnavailable("Billing webhooks aren't configured.");
  }
  if (!signature) throw AppError.badRequest("Missing Stripe signature");

  let event: StripeEvent;
  try {
    event = getStripeGateway().constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw AppError.badRequest("Invalid Stripe signature");
  }

  const claim = await claimEvent(event);
  if (claim === "duplicate") return { outcome: "duplicate" };
  if (claim === "in-progress") {
    // Another delivery is being handled right now; a non-2xx makes Stripe try later.
    throw AppError.conflict("This event is already being processed");
  }

  try {
    const handled = await processEvent(event);
    await StripeWebhookEvent.updateOne(
      { eventId: event.id },
      { $set: { status: "PROCESSED", processedAt: new Date(), lockedAt: null, ignored: !handled } },
    );
    return { outcome: handled ? "processed" : "ignored" };
  } catch (error) {
    await StripeWebhookEvent.updateOne(
      { eventId: event.id },
      {
        $set: {
          status: "FAILED",
          lockedAt: null,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
        },
      },
    );
    logger.error({ err: error, eventId: event.id, type: event.type }, "Stripe webhook failed");
    throw error;
  }
};

// ── Reconciliation ─────────────────────────────────────────

/**
 * Safety net for missed webhooks: re-reads subscriptions that can still change,
 * oldest sync first. Runs on the worker's timer.
 */
export const reconcileSubscriptions = async ({ limit = 100 }: { limit?: number } = {}) => {
  if (!getStripeGateway().configured) return { synced: 0, failed: 0 };
  const accounts = await BillingAccount.find({
    "subscription.status": { $nin: TERMINAL_STATUSES },
    "subscription.stripeSubscriptionId": { $exists: true },
  })
    .sort({ lastSyncedAt: 1 })
    .limit(limit);

  let synced = 0;
  let failed = 0;
  for (const account of accounts) {
    try {
      await syncSubscriptionById(account.subscription!.stripeSubscriptionId);
      synced += 1;
    } catch (error) {
      failed += 1;
      logger.error({ err: error, accountId: account.id }, "Subscription reconcile failed");
    }
  }
  return { synced, failed };
};

export const deleteUserBilling = async (userId: Types.ObjectId) => {
  await BillingAccount.deleteOne({ user: userId });
};
