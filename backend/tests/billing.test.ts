import { Types } from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAIProvider } from "../src/integrations/ai/registry";
import { setStripeGateway, signTestPayload } from "../src/integrations/billing/stripeGateway";
import { AIUsage } from "../src/models/aiUsage.model";
import { BillingAccount } from "../src/models/billingAccount.model";
import { StoredFile } from "../src/models/file.model";
import { Schedule } from "../src/models/schedule.model";
import { SocialAccount } from "../src/models/socialAccount.model";
import { StripeWebhookEvent } from "../src/models/stripeWebhookEvent.model";
import { Workspace } from "../src/models/workspace.model";
import { reconcileSubscriptions } from "../src/services/billing.service";
import * as EntitlementService from "../src/services/entitlement.service";
import { mailOutbox } from "../src/utils/mailer.util";
import { setUserPlan } from "./helpers/billing";
import { app } from "./helpers/client";
import { useTestDatabase } from "./helpers/database";
import { FakeAIProvider } from "./helpers/fakeAIProvider";
import { FakeStripeGateway } from "./helpers/fakeStripe";
import { postDraft } from "./helpers/postFixture";
import { addMember, call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

const DAY_MS = 86_400_000;
const WEBHOOK_SECRET = "whsec_test_secret";

let stripe: FakeStripeGateway;
let ai: FakeAIProvider;
let restore: (() => void)[] = [];
let owner: TestUser;
let workspaceId: string;
let eventCounter = 0;

beforeEach(async () => {
  stripe = new FakeStripeGateway();
  ai = new FakeAIProvider(() => ({ drafts: [postDraft("LINKEDIN")] }));
  restore = [setStripeGateway(stripe), setAIProvider(ai)];
  owner = await createUser("Olivia Owner");
  workspaceId = (await createWorkspace(owner)).id;
});
afterEach(() => restore.forEach((undo) => undo()));

const ownerId = () => new Types.ObjectId(owner.id);
const account = () => BillingAccount.findOne({ user: ownerId() });
const workspaceDoc = () => Workspace.findById(workspaceId).orFail();

/** Sends an event the way Stripe does: raw JSON with a signature header. */
const sendWebhook = (
  type: string,
  object: object,
  { id, signature }: { id?: string; signature?: string } = {},
) => {
  eventCounter += 1;
  const payload = JSON.stringify({
    id: id ?? `evt_${eventCounter}`,
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object },
  });
  return request(app)
    .post("/api/v1/billing/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature ?? signTestPayload(payload, WEBHOOK_SECRET))
    .send(payload);
};

/** Checkout from the API, then Stripe completing it and sending the webhook. */
const subscribe = async (plan: "CREATOR" | "PRO" | "AGENCY" = "CREATOR") => {
  await call(owner, "post", "/billing/checkout", { plan }).expect(200);
  const [sessionId] = [...stripe.sessions.keys()].slice(-1);
  const subscription = stripe.completeCheckout(sessionId);
  await sendWebhook("checkout.session.completed", {
    id: sessionId,
    object: "checkout.session",
    mode: "subscription",
    subscription: subscription.id,
    customer: subscription.customer,
  }).expect(200);
  return subscription;
};

// ── Which plan applies ─────────────────────────────────────

describe("Resolving the plan", () => {
  const subscription = (status: string, plan: "PRO" | null = "PRO") => ({
    subscription: { status, plan } as never,
    graceUntil: null,
    paymentFailedAt: null,
  });

  it("uses the subscribed plan only while Stripe says it's paid", () => {
    expect(EntitlementService.resolvePlan(subscription("active")).plan).toBe("PRO");
    expect(EntitlementService.resolvePlan(subscription("trialing")).plan).toBe("PRO");
    expect(EntitlementService.resolvePlan(subscription("canceled")).plan).toBe("FREE");
    expect(EntitlementService.resolvePlan(subscription("unpaid")).plan).toBe("FREE");
    expect(EntitlementService.resolvePlan(subscription("incomplete")).plan).toBe("FREE");
    // No subscription: the configured default (Agency in tests, Free in production).
    expect(EntitlementService.resolvePlan(null)).toEqual({ plan: "AGENCY", reason: "default" });
  });

  it("keeps the plan through the grace period after a failed payment, then drops to Free", () => {
    const now = new Date();
    const pastDue = {
      subscription: { status: "past_due", plan: "PRO" } as never,
      paymentFailedAt: new Date(now.getTime() - DAY_MS),
      graceUntil: new Date(now.getTime() + 6 * DAY_MS),
    };
    expect(EntitlementService.resolvePlan(pastDue, now)).toEqual({
      plan: "PRO",
      reason: "grace_period",
    });
    expect(EntitlementService.resolvePlan(pastDue, new Date(now.getTime() + 7 * DAY_MS))).toEqual({
      plan: "FREE",
      reason: "payment_overdue",
    });
  });

  it("applies a granted plan only while it lasts and only when it's higher", () => {
    const now = new Date();
    const granted = (plan: "CREATOR" | "AGENCY", expiresAt: Date | null) => ({
      plan,
      expiresAt,
      reason: null,
      grantedAt: now,
    });
    const canceled = { ...subscription("canceled"), planOverride: granted("AGENCY", null) };
    expect(EntitlementService.resolvePlan(canceled, now)).toEqual({
      plan: "AGENCY",
      reason: "override",
    });

    const expired = {
      ...subscription("canceled"),
      planOverride: granted("AGENCY", new Date(now.getTime() - 1)),
    };
    expect(EntitlementService.resolvePlan(expired, now).plan).toBe("FREE");

    const lower = { ...subscription("active"), planOverride: granted("CREATOR", null) };
    expect(EntitlementService.resolvePlan(lower, now)).toEqual({
      plan: "PRO",
      reason: "subscription",
    });
  });
});

// ── Checkout and webhooks ──────────────────────────────────

describe("Checkout", () => {
  it("creates one Stripe customer and a checkout for the chosen price", async () => {
    const res = await call(owner, "post", "/billing/checkout", { plan: "PRO" }).expect(200);
    expect(res.body.data.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);

    const [session] = stripe.callsTo("createCheckoutSession");
    expect(session.args[0]).toMatchObject({
      mode: "subscription",
      client_reference_id: owner.id,
      line_items: [{ price: "price_pro_month", quantity: 1 }],
      subscription_data: { metadata: { userId: owner.id } },
    });
    await call(owner, "post", "/billing/checkout", { plan: "PRO" }).expect(200);
    expect(stripe.callsTo("createCustomer")).toHaveLength(1);
  });

  it("refuses anything but a plan choice, and never takes status from the client", async () => {
    await call(owner, "post", "/billing/checkout", { plan: "PRO", status: "active" }).expect(422);
    await call(owner, "post", "/billing/checkout", { plan: "FREE" }).expect(422);
    await call(owner, "post", "/billing/checkout", { plan: "PRO", interval: "year" }).expect(422);
    const unverified = await createUser("Una Unverified", { verified: false });
    await call(unverified, "post", "/billing/checkout", { plan: "PRO" }).expect(403);
  });

  it("applies the plan from Stripe after checkout and blocks a second subscription", async () => {
    await setUserPlan(owner.id, "FREE");
    await BillingAccount.updateOne(
      { user: ownerId() },
      { $set: { stripeCustomerId: null, subscription: null } },
    );
    await subscribe("PRO");

    const billing = (await call(owner, "get", "/billing").expect(200)).body.data;
    expect(billing).toMatchObject({ plan: "PRO", planReason: "subscription" });
    expect(billing.subscription).toMatchObject({
      plan: "PRO",
      interval: "month",
      status: "active",
    });
    await call(owner, "post", "/billing/checkout", { plan: "AGENCY" }).expect(409);
  });

  it("confirms a checkout only for the signed-in user's own customer", async () => {
    await call(owner, "post", "/billing/checkout", { plan: "CREATOR" }).expect(200);
    const [sessionId] = [...stripe.sessions.keys()];
    stripe.completeCheckout(sessionId);

    const stranger = await createUser("Sam Stranger");
    await call(stranger, "post", "/billing/checkout", { plan: "CREATOR" }).expect(200);
    await call(stranger, "post", "/billing/checkout/confirm", { sessionId }).expect(404);

    const confirmed = await call(owner, "post", "/billing/checkout/confirm", { sessionId }).expect(
      200,
    );
    expect(confirmed.body.data.plan).toBe("CREATOR");
  });
});

describe("Stripe webhooks", () => {
  it("rejects missing or forged signatures", async () => {
    await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ id: "evt_x", type: "customer.subscription.updated" }))
      .expect(400);
    await sendWebhook(
      "customer.subscription.updated",
      { id: "sub_1" },
      {
        signature: signTestPayload("{}", "whsec_wrong"),
      },
    ).expect(400);
    expect(await StripeWebhookEvent.countDocuments()).toBe(0);
  });

  it("processes each event id once, however many times Stripe delivers it", async () => {
    await call(owner, "post", "/billing/checkout", { plan: "CREATOR" }).expect(200);
    const subscription = stripe.completeCheckout([...stripe.sessions.keys()][0]);
    const object = { id: subscription.id, object: "subscription" };

    const first = await sendWebhook("customer.subscription.updated", object, {
      id: "evt_same",
    }).expect(200);
    expect(first.body.outcome).toBe("processed");
    const retrievals = stripe.callsTo("retrieveSubscription").length;

    const again = await sendWebhook("customer.subscription.updated", object, {
      id: "evt_same",
    }).expect(200);
    expect(again.body.outcome).toBe("duplicate");
    expect(stripe.callsTo("retrieveSubscription")).toHaveLength(retrievals);
    expect(await StripeWebhookEvent.countDocuments({ eventId: "evt_same" })).toBe(1);
  });

  it("stores what Stripe says, not what the event body claims", async () => {
    await call(owner, "post", "/billing/checkout", { plan: "PRO" }).expect(200);
    const subscription = stripe.completeCheckout([...stripe.sessions.keys()][0], "incomplete");
    await sendWebhook("customer.subscription.updated", {
      id: subscription.id,
      object: "subscription",
      status: "active",
      items: { data: [{ price: { id: "price_agency_month" } }] },
    }).expect(200);

    const stored = await account();
    expect(stored?.subscription).toMatchObject({ status: "incomplete", plan: "PRO" });
    expect(EntitlementService.resolvePlan(stored).plan).toBe("FREE");
  });

  it("records a failed event and processes it when Stripe retries", async () => {
    await sendWebhook(
      "customer.subscription.updated",
      { id: "sub_missing" },
      { id: "evt_retry" },
    ).expect(500);
    expect(await StripeWebhookEvent.findOne({ eventId: "evt_retry" })).toMatchObject({
      status: "FAILED",
      attempts: 1,
    });

    await call(owner, "post", "/billing/checkout", { plan: "CREATOR" }).expect(200);
    const customer = [...stripe.customers.keys()][0];
    stripe.subscriptions.set("sub_missing", {
      ...stripe.createSubscription({ customer, price: "price_creator_month" }),
      id: "sub_missing",
    });
    const retried = await sendWebhook(
      "customer.subscription.updated",
      { id: "sub_missing" },
      { id: "evt_retry" },
    ).expect(200);
    expect(retried.body.outcome).toBe("processed");
    expect(await StripeWebhookEvent.findOne({ eventId: "evt_retry" })).toMatchObject({
      status: "PROCESSED",
      attempts: 2,
    });
  });

  it("acknowledges event types it doesn't use", async () => {
    const res = await sendWebhook("product.created", { id: "prod_1" }).expect(200);
    expect(res.body.outcome).toBe("ignored");
  });
});

// ── Changing the subscription ──────────────────────────────

describe("Upgrades, downgrades and cancellation", () => {
  it("upgrades immediately, charging the difference only if the payment succeeds", async () => {
    const subscription = await subscribe("CREATOR");
    const res = await call(owner, "post", "/billing/subscription/change", { plan: "PRO" }).expect(
      200,
    );

    const [update] = stripe.callsTo("updateSubscription");
    expect(update.args[1]).toMatchObject({
      items: [{ id: subscription.items.data[0].id, price: "price_pro_month" }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
    });
    expect(res.body.data.overview.plan).toBe("PRO");
  });

  it("reuses one checkout for repeated clicks on the same plan", async () => {
    await call(owner, "post", "/billing/checkout", { plan: "PRO" }).expect(200);
    await call(owner, "post", "/billing/checkout", { plan: "PRO" }).expect(200);
    await call(owner, "post", "/billing/checkout", { plan: "AGENCY" }).expect(200);
    const keys = stripe.callsTo("createCheckoutSession").map((call) => call.args[1]);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("stops a plan change when a booked downgrade can't be released", async () => {
    await subscribe("PRO");
    await call(owner, "post", "/billing/subscription/change", { plan: "CREATOR" }).expect(200);
    stripe.failNextRelease = new Error("Connection to Stripe was lost");
    await call(owner, "post", "/billing/subscription/change", { plan: "AGENCY" }).expect(500);
    expect(
      stripe
        .callsTo("updateSubscription")
        .some((call) => JSON.stringify(call.args).includes("price_agency_month")),
    ).toBe(false);
  });

  it("keeps the old plan when the upgrade payment fails", async () => {
    await subscribe("CREATOR");
    stripe.failNextUpgradePayment = true;
    const res = await call(owner, "post", "/billing/subscription/change", {
      plan: "AGENCY",
    }).expect(200);
    expect(res.body.data.overview.plan).toBe("CREATOR");
  });

  it("books downgrades for the end of the period and can undo them", async () => {
    await subscribe("PRO");
    const res = await call(owner, "post", "/billing/subscription/change", {
      plan: "CREATOR",
    }).expect(200);
    const { overview } = res.body.data;
    expect(overview.plan).toBe("PRO");
    expect(overview.subscription.scheduledChange).toMatchObject({
      plan: "CREATOR",
      interval: "month",
    });
    expect(new Date(overview.subscription.scheduledChange.effectiveAt).getTime()).toBe(
      new Date(overview.subscription.currentPeriodEnd).getTime(),
    );

    const kept = await call(owner, "post", "/billing/subscription/change", { plan: "PRO" }).expect(
      200,
    );
    expect(stripe.callsTo("releaseSchedule")).toHaveLength(1);
    expect(kept.body.data.overview.subscription.scheduledChange).toBeNull();
  });

  it("warns about usage above the lower plan without deleting anything", async () => {
    await subscribe("AGENCY");
    await createWorkspace(owner, { name: "Second brand" });
    const res = await call(owner, "post", "/billing/subscription/change", {
      plan: "CREATOR",
    }).expect(200);
    expect(res.body.data.warnings.join(" ")).toContain("2 workspaces");
    expect(await Workspace.countDocuments({ createdBy: ownerId() })).toBe(2);
  });

  it("cancels at the end of the period, can resume, and drops to Free when it ends", async () => {
    const subscription = await subscribe("PRO");
    const cancelled = await call(owner, "post", "/billing/subscription/cancel").expect(200);
    expect(cancelled.body.data.overview).toMatchObject({
      plan: "PRO",
      subscription: { cancelAtPeriodEnd: true },
    });

    await call(owner, "post", "/billing/subscription/resume").expect(200);
    expect(stripe.subscriptions.get(subscription.id)?.cancel_at_period_end).toBe(false);

    stripe.subscriptions.get(subscription.id)!.status = "canceled";
    await sendWebhook("customer.subscription.deleted", { id: subscription.id }).expect(200);
    expect((await call(owner, "get", "/billing").expect(200)).body.data.plan).toBe("FREE");
  });

  it("opens the billing portal for the user's own customer", async () => {
    const fresh = await createUser("Nadia New");
    await call(fresh, "post", "/billing/portal").expect(409);
    await subscribe("CREATOR");
    const res = await call(owner, "post", "/billing/portal").expect(200);
    expect(res.body.data.url).toContain("billing.stripe.test");
  });
});

describe("Granted plans", () => {
  it("survive Stripe syncs and show on the billing page", async () => {
    await BillingAccount.findOneAndUpdate(
      { user: owner.id },
      {
        $set: {
          planOverride: {
            plan: "AGENCY",
            expiresAt: null,
            reason: "Partner",
            grantedAt: new Date(),
          },
        },
      },
      { upsert: true },
    );
    await subscribe("CREATOR");

    const overview = await call(owner, "get", "/billing").expect(200);
    expect(overview.body.data).toMatchObject({
      plan: "AGENCY",
      planReason: "override",
      planOverride: { plan: "AGENCY", expiresAt: null },
      subscription: { plan: "CREATOR" },
    });
  });
});

describe("Payment failures", () => {
  it("keeps the plan during the grace period, emails once, and clears when paid", async () => {
    const subscription = await subscribe("PRO");
    stripe.subscriptions.get(subscription.id)!.status = "past_due";
    const invoice = {
      id: "in_1",
      object: "invoice",
      next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 86_400,
      parent: { subscription_details: { subscription: subscription.id } },
    };

    const sentBefore = mailOutbox.length;
    await sendWebhook("invoice.payment_failed", invoice).expect(200);
    await sendWebhook("invoice.payment_failed", invoice).expect(200);

    let stored = await account();
    expect(stored?.subscription?.status).toBe("past_due");
    expect(stored?.paymentFailedAt).toBeInstanceOf(Date);
    expect(stored?.lastPaymentError).toContain("didn't go through");
    expect(EntitlementService.resolvePlan(stored)).toEqual({ plan: "PRO", reason: "grace_period" });
    expect(mailOutbox.slice(sentBefore).filter((mail) => mail.to === owner.email)).toHaveLength(1);

    stripe.subscriptions.get(subscription.id)!.status = "active";
    await sendWebhook("invoice.paid", invoice).expect(200);
    stored = await account();
    expect(stored).toMatchObject({
      paymentFailedAt: null,
      graceUntil: null,
      lastPaymentError: null,
    });
  });

  it("ignores a stale failure event once Stripe shows the invoice was paid", async () => {
    const subscription = await subscribe("PRO");
    await sendWebhook("invoice.payment_failed", {
      id: "in_old",
      object: "invoice",
      parent: { subscription_details: { subscription: subscription.id } },
    }).expect(200);
    expect((await account())?.paymentFailedAt).toBeNull();
  });

  it("blocks plan changes until the payment is fixed", async () => {
    const subscription = await subscribe("PRO");
    stripe.subscriptions.get(subscription.id)!.status = "past_due";
    await call(owner, "post", "/billing/subscription/change", { plan: "AGENCY" }).expect(409);
  });

  it("reconciles subscriptions a missed webhook left out of date", async () => {
    const subscription = await subscribe("PRO");
    stripe.subscriptions.get(subscription.id)!.status = "unpaid";
    expect(await reconcileSubscriptions()).toEqual({ synced: 1, failed: 0 });
    expect(EntitlementService.resolvePlan(await account()).plan).toBe("FREE");
  });
});

// ── Enforcing limits ───────────────────────────────────────

describe("Entitlement enforcement", () => {
  beforeEach(async () => {
    await setUserPlan(owner.id, "FREE");
  });

  const expectLimit = (res: request.Response, limit: string) => {
    expect(res.body.error?.code ?? res.body.code).toBe("PLAN_LIMIT_REACHED");
    expect(JSON.stringify(res.body)).toContain(limit);
  };

  it("limits workspaces, including restoring an archived one", async () => {
    const res = await call(owner, "post", "/workspaces", { name: "Second" }).expect(403);
    expectLimit(res, "workspaces");

    await setUserPlan(owner.id, "PRO");
    const second = (await createWorkspace(owner, { name: "Second" })).id;
    await call(owner, "delete", `/workspaces/${second}`).expect(200);
    await setUserPlan(owner.id, "FREE");
    await call(owner, "post", `/workspaces/${second}/restore`).expect(403);
  });

  it("limits team seats, counting pending invitations", async () => {
    const res = await call(owner, "post", `/workspaces/${workspaceId}/invitations`, {
      email: "new.person@example.com",
      role: "EDITOR",
    }).expect(403);
    expectLimit(res, "teamMembersPerWorkspace");

    await setUserPlan(owner.id, "CREATOR");
    await call(owner, "post", `/workspaces/${workspaceId}/invitations`, {
      email: "first@example.com",
      role: "EDITOR",
    }).expect(201);
    await call(owner, "post", `/workspaces/${workspaceId}/invitations`, {
      email: "second@example.com",
      role: "EDITOR",
    }).expect(403);
    // Re-inviting the same person replaces their invitation, so it isn't a new seat.
    await call(owner, "post", `/workspaces/${workspaceId}/invitations`, {
      email: "first@example.com",
      role: "VIEWER",
    }).expect(201);
  });

  it("limits AI generations per billing period without calling the AI", async () => {
    await AIUsage.insertMany(
      Array.from({ length: 30 }, () => ({
        workspace: new Types.ObjectId(workspaceId),
        user: ownerId(),
        operation: "CREATE_POSTS",
        provider: "fake",
        model: "m",
        promptVersion: "1",
        inputTokens: 1,
        outputTokens: 1,
        cachedInputTokens: 0,
        estimatedCostUsd: 0,
        status: "SUCCESS",
        durationMs: 1,
        attempts: 1,
      })),
    );
    const res = await call(owner, "post", `/workspaces/${workspaceId}/posts/generate`, {
      topic: "Fresh beans",
      platforms: ["LINKEDIN"],
    }).expect(403);
    expectLimit(res, "aiGenerationsPerMonth");
    expect(ai.requests).toHaveLength(0);
  });

  it("limits scheduled posts per period, but rescheduling a counted post is free", async () => {
    const workspace = await workspaceDoc();
    const posts = Array.from({ length: 30 }, () => new Types.ObjectId());
    await Schedule.insertMany(
      posts.map((post) => ({
        workspace: workspace._id,
        post,
        socialAccount: new Types.ObjectId(),
        platform: "LINKEDIN",
        scheduledAt: new Date(Date.now() + DAY_MS),
        isLive: null,
        maxAttempts: 3,
        createdBy: ownerId(),
      })),
    );
    await expect(
      EntitlementService.assertCanSchedulePost(workspace, new Types.ObjectId()),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
    await expect(
      EntitlementService.assertCanSchedulePost(workspace, posts[0]),
    ).resolves.toBeUndefined();
  });

  it("limits social accounts and storage", async () => {
    const workspace = await workspaceDoc();
    await SocialAccount.collection.insertMany(
      [1, 2, 3].map((index) => ({
        workspace: workspace._id,
        platform: "LINKEDIN",
        providerAccountId: `acct-${index}`,
        accountName: `Account ${index}`,
        status: "CONNECTED",
      })),
    );
    await expect(EntitlementService.assertCanAddSocialAccount(workspace)).rejects.toMatchObject({
      code: "PLAN_LIMIT_REACHED",
    });

    await StoredFile.collection.insertOne({
      workspace: workspace._id,
      size: 499 * 1024 * 1024,
      key: "k",
    });
    await expect(
      EntitlementService.assertStorageAvailable(workspace, 512 * 1024),
    ).resolves.toBeUndefined();
    await expect(
      EntitlementService.assertStorageAvailable(workspace, 2 * 1024 * 1024),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
  });

  it("gates analytics and insights by plan", async () => {
    const res = await call(owner, "get", `/workspaces/${workspaceId}/analytics?range=30d`).expect(
      403,
    );
    expect(res.body.message ?? JSON.stringify(res.body)).toContain("Analytics");
    await call(owner, "get", `/workspaces/${workspaceId}/insights`).expect(403);
    await setUserPlan(owner.id, "CREATOR");
    await call(owner, "get", `/workspaces/${workspaceId}/analytics?range=30d`).expect(200);
  });

  it("applies the billing owner's plan to every member, and moves billing with ownership", async () => {
    const coOwner = await createUser("Cora CoOwner");
    await setUserPlan(owner.id, "PRO");
    await setUserPlan(coOwner.id, "FREE");
    const memberId = await addMember(owner, workspaceId, coOwner, "ADMIN");
    await call(owner, "patch", `/workspaces/${workspaceId}/members/${memberId}`, {
      role: "OWNER",
    }).expect(200);

    const seen = (await call(coOwner, "get", `/workspaces/${workspaceId}/entitlements`).expect(200))
      .body.data;
    expect(seen).toMatchObject({ plan: "PRO", billingOwnerId: owner.id });

    const ownerMemberId = (
      (await call(coOwner, "get", `/workspaces/${workspaceId}/members`).expect(200)).body.data
        .members as {
        id: string;
        user: { id: string };
      }[]
    ).find((member) => member.user.id === owner.id)!.id;
    await call(coOwner, "patch", `/workspaces/${workspaceId}/members/${ownerMemberId}`, {
      role: "ADMIN",
    }).expect(200);

    const after = (await call(owner, "get", `/workspaces/${workspaceId}/entitlements`).expect(200))
      .body.data;
    expect(after).toMatchObject({ plan: "FREE", billingOwnerId: coOwner.id });
  });
});
