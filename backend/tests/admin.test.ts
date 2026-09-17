import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditActionValue } from "../src/constants/audit.constant";
import { UserRole } from "../src/constants/auth.constant";
import { AIUsage } from "../src/models/aiUsage.model";
import { AuditLog } from "../src/models/auditLog.model";
import { AutopilotSettings } from "../src/models/autopilotSettings.model";
import { BillingAccount } from "../src/models/billingAccount.model";
import { Post } from "../src/models/post.model";
import { Schedule } from "../src/models/schedule.model";
import { SocialAccount } from "../src/models/socialAccount.model";
import { User } from "../src/models/user.model";
import { runAutopilotSweep } from "../src/services/autopilot.service";
import { setUserPlan } from "./helpers/billing";
import { VALID_PASSWORD } from "./helpers/client";
import { useTestDatabase } from "./helpers/database";
import { MockSocialProvider } from "./helpers/mockSocialProvider";
import { createConnectedAccount } from "./helpers/socialAccountFixture";
import { call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

const DAY_MS = 86_400_000;
const unscoped = { skipWorkspaceScope: true } as const;

let admin: TestUser;
let member: TestUser;
let workspaceId: string;

beforeEach(async () => {
  admin = await createUser("Ada Admin");
  await User.updateOne({ _id: admin.id }, { role: UserRole.SUPER_ADMIN });
  member = await createUser("Mia Member");
  workspaceId = (await createWorkspace(member, { name: "Mia's Coffee" })).id;
});
afterEach(() => vi.restoreAllMocks());

const audits = (action?: AuditActionValue) =>
  AuditLog.find(action ? { action } : {})
    .sort({ createdAt: 1 })
    .lean();

/** A subscription with a real Stripe amount, the way a sync stores it. */
const subscribe = async (
  user: TestUser,
  { status = "active", unitAmount = 4900, interval = "month", plan = "PRO" } = {},
) => {
  await setUserPlan(user.id, "PRO");
  await BillingAccount.updateOne(
    { user: new Types.ObjectId(user.id) },
    {
      $set: {
        "subscription.status": status,
        "subscription.unitAmount": unitAmount,
        "subscription.currency": "usd",
        "subscription.interval": interval,
        "subscription.plan": plan,
        ...(status === "past_due"
          ? { paymentFailedAt: new Date(), graceUntil: new Date(Date.now() + 5 * DAY_MS) }
          : {}),
      },
    },
  );
};

describe("Access", () => {
  const endpoints = [
    "/admin/dashboard",
    "/admin/users",
    `/admin/users/${new Types.ObjectId()}`,
    "/admin/workspaces",
    "/admin/subscriptions",
    "/admin/plans",
    "/admin/ai-usage",
    "/admin/social-connections",
    "/admin/publishing-failures",
    "/admin/audit-logs",
  ];

  it("is hidden from everyone but super admins", async () => {
    for (const path of endpoints) {
      await call(member, "get", path).expect(404);
    }
    await call(member, "post", `/admin/users/${admin.id}/suspend`, { reason: "Trying it" }).expect(
      404,
    );
    await call(admin, "get", "/admin/dashboard").expect(200);
  });

  it("stops working the moment the role is removed", async () => {
    await call(admin, "get", "/admin/users").expect(200);
    await User.updateOne({ _id: admin.id }, { role: UserRole.USER });
    await call(admin, "get", "/admin/users").expect(404);
  });

  it("can't be granted through the API", async () => {
    await call(member, "patch", "/auth/me", { role: UserRole.SUPER_ADMIN });
    expect((await User.findById(member.id).lean())?.role).toBe(UserRole.USER);
  });
});

describe("Dashboard", () => {
  it("reports users, revenue, AI, connections and publishing", async () => {
    const yearly = await createUser("Yuri Yearly");
    const pastDue = await createUser("Pat PastDue");
    await subscribe(member, { unitAmount: 4900 });
    await subscribe(yearly, { unitAmount: 120_000, interval: "year", plan: "AGENCY" });
    await subscribe(pastDue, { status: "past_due", unitAmount: 1900, plan: "CREATOR" });
    await User.updateOne({ _id: yearly.id }, { status: "suspended" });

    const workspace = new Types.ObjectId(workspaceId);
    await AIUsage.insertMany([
      {
        workspace,
        user: new Types.ObjectId(member.id),
        operation: "CREATE_POSTS",
        provider: "openai",
        model: "m",
        promptVersion: "1",
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0.25,
        status: "SUCCESS",
        durationMs: 5,
        attempts: 1,
      },
      {
        workspace,
        user: new Types.ObjectId(member.id),
        operation: "REFINE_POST",
        provider: "openai",
        model: "m",
        promptVersion: "1",
        inputTokens: 10,
        outputTokens: 0,
        estimatedCostUsd: null,
        status: "FAILURE",
        errorCode: "TIMEOUT",
        durationMs: 5,
        attempts: 1,
      },
    ]);
    await createConnectedAccount({
      workspaceId,
      connectedBy: member.id,
      provider: new MockSocialProvider(),
    });
    const owner = new Types.ObjectId(member.id);
    await Post.create([
      {
        workspace,
        platform: "LINKEDIN",
        status: "PUBLISHED",
        publishedAt: new Date(),
        brief: { topic: "A" },
        createdBy: owner,
      },
      {
        workspace,
        platform: "LINKEDIN",
        status: "FAILED",
        brief: { topic: "B" },
        createdBy: owner,
      },
    ]);

    const data = (await call(admin, "get", "/admin/dashboard").expect(200)).body.data;
    expect(data.users).toMatchObject({ total: 4, suspended: 1, superAdmins: 1, paid: 3 });
    expect(data.users.active).toBeGreaterThanOrEqual(2);
    // $49 monthly + $1,200 yearly / 12; the past-due $19 is at risk, not counted.
    expect(data.revenue).toMatchObject({ mrr: { usd: 149 }, atRiskMrr: { usd: 19 } });
    expect(data.subscriptions.byStatus).toMatchObject({ active: 2, past_due: 1 });
    expect(data.ai).toMatchObject({
      requests: 2,
      failures: 1,
      estimatedCostUsd: 0.25,
      requestsWithUnknownCost: 1,
    });
    expect(data.socialAccounts.connected).toBe(1);
    expect(data.posts).toMatchObject({ published: 1, publishedRecent: 1, failed: 1 });
    expect(data.workspaces.active).toBe(1);
  });
});

describe("Users", () => {
  it("searches, filters and pages without writing audit records", async () => {
    await createUser("Zed Zebra");
    await subscribe(member);

    const search = (await call(admin, "get", "/admin/users?q=mia").expect(200)).body.data;
    expect(search.items.map((user: { name: string }) => user.name)).toEqual(["Mia Member"]);
    expect(search.items[0]).toMatchObject({ plan: "PRO", workspaces: 1 });

    const paid = (await call(admin, "get", "/admin/users?plan=PRO").expect(200)).body.data;
    expect(paid.total).toBe(1);
    // Accounts without a subscription get the test default plan (Agency).
    const unpaid = (await call(admin, "get", "/admin/users?plan=AGENCY").expect(200)).body.data;
    expect(unpaid.total).toBe(2);

    const page = (await call(admin, "get", "/admin/users?limit=1&page=2").expect(200)).body.data;
    expect(page).toMatchObject({ page: 2, limit: 1, total: 3, pages: 3 });
    expect(page.items).toHaveLength(1);
    await call(admin, "get", "/admin/users?q=(unclosed").expect(200);
    expect(await audits()).toHaveLength(0);
  });

  it("records who viewed a user's details, and never returns secrets", async () => {
    const res = await call(admin, "get", `/admin/users/${member.id}`).expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("tokenVersion");
    expect(res.body.data.memberships[0]).toMatchObject({
      name: "Mia's Coffee",
      isBillingOwner: true,
    });
    expect(res.body.data.user.activeSessions).toBe(1);

    const [record] = await audits("USER_VIEWED");
    expect(record).toMatchObject({
      actorEmail: admin.email,
      targetType: "USER",
      targetLabel: member.email,
      source: "ADMIN_PANEL",
    });
    expect(record.actor?.toString()).toBe(admin.id);
    expect(record.ip).toBe(admin.client.ip);
  });
});

describe("Suspension", () => {
  const login = (user: TestUser) =>
    user.client.post("/login", { email: user.email, password: VALID_PASSWORD });

  it("requires a reason and refuses self or other super admins", async () => {
    await call(admin, "post", `/admin/users/${member.id}/suspend`, {}).expect(422);
    await call(admin, "post", `/admin/users/${admin.id}/suspend`, {
      reason: "Testing myself",
    }).expect(400);
    const other = await createUser("Otto Admin");
    await User.updateOne({ _id: other.id }, { role: UserRole.SUPER_ADMIN });
    await call(admin, "post", `/admin/users/${other.id}/suspend`, { reason: "Not allowed" }).expect(
      403,
    );
    expect(await audits("USER_SUSPENDED")).toHaveLength(0);
  });

  it("ends every session, blocks sign-in and is audited", async () => {
    await call(member, "get", "/workspaces").expect(200);
    const res = await call(admin, "post", `/admin/users/${member.id}/suspend`, {
      reason: "Spam reports from three platforms",
    }).expect(200);
    expect(res.body.data).toMatchObject({
      status: "suspended",
      suspensionReason: "Spam reports from three platforms",
    });

    // The old access token is dead, refresh is refused, and signing in again fails.
    await call(member, "get", "/workspaces").expect(401);
    const refreshed = await member.client.post("/refresh").expect(401);
    expect(refreshed.body.error?.code ?? refreshed.body.code).toBeDefined();
    const signIn = await login(member).expect(403);
    expect(JSON.stringify(signIn.body)).toContain("ACCOUNT_SUSPENDED");

    const [record] = await audits("USER_SUSPENDED");
    expect(record).toMatchObject({
      actorEmail: admin.email,
      reason: "Spam reports from three platforms",
      metadata: { previousStatus: "active", sessionsEnded: 1 },
    });
    await call(admin, "post", `/admin/users/${member.id}/suspend`, {
      reason: "Again please",
    }).expect(409);
  });

  it("reactivation restores sign-in and is audited with the old reason", async () => {
    await call(admin, "post", `/admin/users/${member.id}/suspend`, {
      reason: "Chargeback investigation",
    }).expect(200);
    await call(admin, "post", `/admin/users/${member.id}/reactivate`, {
      reason: "Chargeback resolved",
    }).expect(200);

    const signIn = await login(member).expect(200);
    await call({ ...member, token: signIn.body.data.accessToken }, "get", "/workspaces").expect(
      200,
    );
    const [record] = await audits("USER_REACTIVATED");
    expect(record).toMatchObject({
      reason: "Chargeback resolved",
      metadata: { suspensionReason: "Chargeback investigation" },
    });
    await call(admin, "post", `/admin/users/${member.id}/reactivate`, {
      reason: "Once more",
    }).expect(409);
  });

  it("doesn't suspend anyone if the audit record can't be written", async () => {
    vi.spyOn(AuditLog, "create").mockRejectedValueOnce(new Error("disk full"));
    await call(admin, "post", `/admin/users/${member.id}/suspend`, {
      reason: "Should roll back",
    }).expect(500);
    expect((await User.findById(member.id).lean())?.status).toBe("active");
  });

  it("stops Autopilot running as a suspended person", async () => {
    await AutopilotSettings.create({
      workspace: new Types.ObjectId(workspaceId),
      status: "ACTIVE",
      startedBy: new Types.ObjectId(member.id),
      platforms: ["LINKEDIN"],
    });
    await call(admin, "post", `/admin/users/${member.id}/suspend`, {
      reason: "Abuse report",
    }).expect(200);
    await runAutopilotSweep();
    const settings = await AutopilotSettings.findOne({
      workspace: new Types.ObjectId(workspaceId),
    }).lean();
    expect(settings).toMatchObject({ status: "PAUSED", pausedBy: null });
    expect(settings?.pauseReason).toContain("can no longer edit");
  });
});

describe("Audit log", () => {
  it("is append-only", async () => {
    await call(admin, "get", `/admin/users/${member.id}`).expect(200);
    await expect(AuditLog.updateOne({}, { reason: "edited" })).rejects.toThrow("append-only");
    await expect(AuditLog.deleteMany({})).rejects.toThrow("append-only");
    const [record] = await AuditLog.find({});
    record.reason = "edited";
    await expect(record.save()).rejects.toThrow("append-only");
  });

  it("lists records filtered by action and target", async () => {
    await call(admin, "get", `/admin/users/${member.id}`).expect(200);
    await call(admin, "get", `/admin/workspaces/${workspaceId}`).expect(200);
    const viewed = (
      await call(admin, "get", `/admin/audit-logs?action=WORKSPACE_VIEWED`).expect(200)
    ).body.data;
    expect(viewed.items).toHaveLength(1);
    const forUser = (
      await call(admin, "get", `/admin/audit-logs?targetId=${member.id}`).expect(200)
    ).body.data;
    expect(forUser.items.map((item: { action: string }) => item.action)).toEqual(["USER_VIEWED"]);
  });
});

describe("Workspaces, subscriptions and plans", () => {
  it("shows workspace details without any token fields, and audits the view", async () => {
    await createConnectedAccount({
      workspaceId,
      connectedBy: member.id,
      provider: new MockSocialProvider(),
    });
    const list = (await call(admin, "get", "/admin/workspaces?q=coffee").expect(200)).body.data;
    expect(list.items[0]).toMatchObject({
      name: "Mia's Coffee",
      members: 1,
      socialAccounts: 1,
      billingOwner: { email: member.email },
    });

    const res = await call(admin, "get", `/admin/workspaces/${workspaceId}`).expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/encrypted|accessToken|refreshToken/i);
    expect(res.body.data.socialAccounts[0]).toMatchObject({
      platform: "LINKEDIN",
      status: "CONNECTED",
    });
    expect(await audits("WORKSPACE_VIEWED")).toHaveLength(1);
  });

  it("filters subscriptions by payment issues and audits the detail view", async () => {
    const pastDue = await createUser("Pat PastDue");
    await subscribe(member);
    await subscribe(pastDue, { status: "past_due", plan: "CREATOR", unitAmount: 1900 });

    const issues = (await call(admin, "get", "/admin/subscriptions?paymentIssue=true").expect(200))
      .body.data;
    expect(issues.items).toHaveLength(1);
    expect(issues.items[0]).toMatchObject({
      user: { email: pastDue.email },
      effectivePlan: "CREATOR",
    });
    expect(issues.items[0].subscription).toMatchObject({ status: "past_due", monthlyAmount: 19 });

    await call(admin, "get", `/admin/subscriptions/${issues.items[0].accountId}`).expect(200);
    expect(await audits("SUBSCRIPTION_VIEWED")).toHaveLength(1);
  });

  it("shows plan limits, configured prices and subscriber counts", async () => {
    await subscribe(member);
    const data = (await call(admin, "get", "/admin/plans").expect(200)).body.data;
    const pro = data.plans.find((plan: { plan: string }) => plan.plan === "PRO");
    expect(pro).toMatchObject({
      stripePrices: { month: "price_pro_month", year: null },
      subscribers: { entitled: 1 },
    });
    expect(data.defaultPlan).toBe("AGENCY");
  });
});

describe("Usage, AI and publishing", () => {
  it("reports AI usage by operation, day and workspace", async () => {
    const workspace = new Types.ObjectId(workspaceId);
    const user = new Types.ObjectId(member.id);
    await AIUsage.insertMany(
      [0.1, 0.2, 0.3].map((cost, index) => ({
        workspace,
        user,
        operation: index === 2 ? "HASHTAGS" : "CREATE_POSTS",
        provider: "openai",
        model: "gpt",
        promptVersion: "1",
        inputTokens: 10,
        outputTokens: 5,
        estimatedCostUsd: cost,
        status: "SUCCESS",
        durationMs: 1,
        attempts: 1,
      })),
    );
    const data = (await call(admin, "get", "/admin/ai-usage").expect(200)).body.data;
    expect(data.totals).toMatchObject({ requests: 3, estimatedCostUsd: 0.6 });
    expect(data.byOperation[0]).toMatchObject({ operation: "CREATE_POSTS", requests: 2 });
    expect(data.topWorkspaces[0]).toMatchObject({ name: "Mia's Coffee", requests: 3 });
    expect(data.topUsers[0]).toMatchObject({ email: member.email });

    await call(admin, "get", "/admin/ai-usage?from=2026-01-01&to=2025-01-01").expect(400);
  });

  it("lists publishing failures, filtered by needing review", async () => {
    const workspace = new Types.ObjectId(workspaceId);
    const owner = new Types.ObjectId(member.id);
    const post = await Post.create({
      workspace,
      platform: "LINKEDIN",
      status: "FAILED",
      brief: { topic: "Launch day" },
      createdBy: owner,
    });
    await Schedule.insertMany([
      {
        workspace,
        post: post._id,
        socialAccount: new Types.ObjectId(),
        platform: "LINKEDIN",
        scheduledAt: new Date(),
        status: "FAILED",
        isLive: null,
        attempts: 3,
        maxAttempts: 3,
        needsReview: true,
        createdBy: owner,
        lastError: {
          code: "OUTCOME_UNKNOWN",
          message: "Check the account",
          occurredAt: new Date(),
        },
      },
      {
        workspace,
        post: new Types.ObjectId(),
        socialAccount: new Types.ObjectId(),
        platform: "FACEBOOK",
        scheduledAt: new Date(),
        status: "FAILED",
        isLive: null,
        attempts: 1,
        maxAttempts: 3,
        createdBy: owner,
      },
    ]);
    expect(await Schedule.countDocuments({ workspace }).setOptions(unscoped)).toBe(2);

    const review = (
      await call(admin, "get", "/admin/publishing-failures?needsReview=true").expect(200)
    ).body.data;
    expect(review.total).toBe(1);
    expect(review.items[0]).toMatchObject({
      topic: "Launch day",
      workspaceName: "Mia's Coffee",
      error: { code: "OUTCOME_UNKNOWN" },
    });
    const facebook = (
      await call(admin, "get", "/admin/publishing-failures?platform=FACEBOOK").expect(200)
    ).body.data;
    expect(facebook.total).toBe(1);
  });

  it("inspects usage for exactly one user or workspace, and audits it", async () => {
    await call(admin, "get", "/admin/usage").expect(422);
    await call(admin, "get", `/admin/usage?userId=${member.id}&workspaceId=${workspaceId}`).expect(
      422,
    );

    const byUser = (await call(admin, "get", `/admin/usage?userId=${member.id}`).expect(200)).body
      .data;
    expect(byUser).toMatchObject({ scope: "user", plan: "AGENCY" });
    expect(byUser.workspaces[0]).toMatchObject({ name: "Mia's Coffee", members: 1 });

    const byWorkspace = (
      await call(admin, "get", `/admin/usage?workspaceId=${workspaceId}`).expect(200)
    ).body.data;
    expect(byWorkspace).toMatchObject({ scope: "workspace", billingOwnerId: member.id });
    const records = await audits("USAGE_INSPECTED");
    expect(records.map((record) => record.targetType)).toEqual(["USER", "WORKSPACE"]);
  });

  it("lists social connections across workspaces with safe fields", async () => {
    await createConnectedAccount({
      workspaceId,
      connectedBy: member.id,
      provider: new MockSocialProvider(),
      accountName: "Mia on LinkedIn",
    });
    const res = await call(admin, "get", "/admin/social-connections?q=mia").expect(200);
    expect(res.body.data.items[0]).toMatchObject({
      accountName: "Mia on LinkedIn",
      workspaceName: "Mia's Coffee",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/encrypted/i);
    expect(await SocialAccount.countDocuments({ workspace: new Types.ObjectId(workspaceId) })).toBe(
      1,
    );
  });
});
