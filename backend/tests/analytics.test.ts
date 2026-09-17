import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnalyticsScope } from "../src/constants/analytics.constant";
import { setAIProvider } from "../src/integrations/ai/registry";
import { createDefaultSocialProviders } from "../src/integrations/social/providers";
import {
  setSocialProviderRegistry,
  SocialProviderRegistry,
} from "../src/integrations/social/registry";
import { AnalyticsSnapshot } from "../src/models/analyticsSnapshot.model";
import { Post } from "../src/models/post.model";
import { Schedule } from "../src/models/schedule.model";
import { setPublishQueue } from "../src/queues/publish.queue";
import * as AnalyticsService from "../src/services/analytics.service";
import { useTestDatabase } from "./helpers/database";
import { FakeAIProvider } from "./helpers/fakeAIProvider";
import { MemoryPublishQueue } from "./helpers/memoryQueue";
import { MockSocialProvider } from "./helpers/mockSocialProvider";
import { createConnectedAccount } from "./helpers/socialAccountFixture";
import { call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

let restoreAI: () => void;
let restoreRegistry: () => void;
let restoreQueue: () => void;
let owner: TestUser;
let workspaceId: string;
let accountId: string;
let social: MockSocialProvider;

const DAY_MS = 86_400_000;
const unscoped = { skipWorkspaceScope: true } as const;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);

beforeEach(async () => {
  restoreAI = setAIProvider(new FakeAIProvider(() => ({ drafts: [] })));
  social = new MockSocialProvider({
    platform: "TIKTOK",
    displayName: "TikTok",
    capabilities: ["VIDEO_POST", "SHORT_VIDEO", "ANALYTICS", "TOKEN_REFRESH"],
  });
  restoreRegistry = setSocialProviderRegistry(
    new SocialProviderRegistry([
      social,
      ...createDefaultSocialProviders().filter((item) => item.platform !== "TIKTOK"),
    ]),
  );
  restoreQueue = setPublishQueue(new MemoryPublishQueue());

  owner = await createUser("Olivia Owner");
  workspaceId = (await createWorkspace(owner)).id;
  const account = await createConnectedAccount({
    workspaceId,
    connectedBy: owner.id,
    provider: social,
    accountName: "Acme on TikTok",
  });
  accountId = account.id;
});

afterEach(() => {
  restoreAI();
  restoreRegistry();
  restoreQueue();
});

const analyticsPath = (query = "") => `/workspaces/${workspaceId}/analytics${query}`;

/** A published post with a schedule carrying the platform's own post id. */
const publishPost = async ({
  providerPostId,
  publishedAt,
  pillar = null,
  topic = "Fresh beans",
}: {
  providerPostId: string;
  publishedAt: Date;
  pillar?: string | null;
  topic?: string;
}) => {
  const post = await Post.create({
    workspace: new Types.ObjectId(workspaceId),
    platform: "TIKTOK",
    status: "PUBLISHED",
    pillar,
    publishedAt,
    brief: { topic },
    versionCount: 1,
    createdBy: new Types.ObjectId(owner.id),
    updatedBy: new Types.ObjectId(owner.id),
  });
  await Schedule.create({
    workspace: new Types.ObjectId(workspaceId),
    post: post._id,
    socialAccount: new Types.ObjectId(accountId),
    platform: "TIKTOK",
    scheduledAt: publishedAt,
    publishedAt,
    status: "PUBLISHED",
    isLive: null,
    maxAttempts: 3,
    createdBy: new Types.ObjectId(owner.id),
    result: { providerPostId, url: `https://tiktok.test/${providerPostId}` },
  });
  return post;
};

/** Writes a snapshot directly, standing in for a past collection run. */
const snapshot = async ({
  post,
  providerPostId,
  metrics,
  capturedAt,
  scope = AnalyticsScope.POST,
}: {
  post?: Types.ObjectId | null;
  providerPostId?: string | null;
  metrics: Record<string, number>;
  capturedAt: Date;
  scope?: (typeof AnalyticsScope)[keyof typeof AnalyticsScope];
}) =>
  AnalyticsSnapshot.create({
    workspace: new Types.ObjectId(workspaceId),
    socialAccount: new Types.ObjectId(accountId),
    platform: "TIKTOK",
    scope,
    post: post ?? null,
    providerPostId: providerPostId ?? null,
    metrics,
    raw: {},
    capturedAt,
    capturedOn: capturedAt.toISOString().slice(0, 10),
  });

const getReport = async (query = "") => {
  const res = await call(owner, "get", analyticsPath(query)).expect(200);
  return res.body.data as {
    totals: { totals: Record<string, number>; engagement: number };
    availableMetrics: string[];
    unavailableMetrics: string[];
    followerGrowth: { accountName: string; first: number | null; change: number | null }[];
    series: { date: string; engagement: number; views: number }[];
    topPosts: { postId: string; engagement: number; metrics: Record<string, number> }[];
    bestPlatform: { platform: string; engagement: number } | null;
    bestPillar: { pillar: string; engagement: number } | null;
    bestTimes: { weekday: number; hour: number; engagement: number }[];
    platformNotes: { platform: string; note: string }[];
    isEmpty: boolean;
  };
};

describe("Collecting analytics", () => {
  it("stores a snapshot per account and per published post", async () => {
    const post = await publishPost({ providerPostId: "v-1", publishedAt: ago(2) });

    const result = await AnalyticsService.collectWorkspaceAnalytics(
      new Types.ObjectId(workspaceId),
    );

    expect(result).toMatchObject({ collected: 2, failed: 0 });
    const stored = await AnalyticsSnapshot.find({ workspace: workspaceId }).lean();
    expect(stored).toHaveLength(2);

    const postSnapshot = stored.find((item) => item.scope === "POST");
    expect(postSnapshot?.post?.toString()).toBe(post.id);
    expect(postSnapshot?.providerPostId).toBe("v-1");
    // .lean() gives a plain object for the Map-typed metrics field.
    expect(postSnapshot?.metrics).toEqual({ views: 1200, likes: 48, comments: 6, shares: 3 });

    const accountSnapshot = stored.find((item) => item.scope === "ACCOUNT");
    expect(accountSnapshot?.metrics).toEqual({ followers: 900 });
    // The provider's own payload is kept beside the normalized numbers.
    expect(accountSnapshot?.raw).toEqual({ mock: true });
  });

  it("keeps one snapshot per day, updating it rather than stacking readings", async () => {
    await publishPost({ providerPostId: "v-1", publishedAt: ago(1) });

    await AnalyticsService.collectWorkspaceAnalytics(new Types.ObjectId(workspaceId));
    await AnalyticsService.collectWorkspaceAnalytics(new Types.ObjectId(workspaceId));

    expect(await AnalyticsSnapshot.countDocuments({ workspace: workspaceId })).toBe(2);
  });

  it("keeps going when one post's metrics can't be read", async () => {
    await publishPost({ providerPostId: "v-1", publishedAt: ago(1) });
    await publishPost({ providerPostId: "v-2", publishedAt: ago(1) });
    // The account call succeeds, then the first post call fails.
    social.failNext("getAnalytics", social.error("PROVIDER_ERROR"));

    const result = await AnalyticsService.collectWorkspaceAnalytics(
      new Types.ObjectId(workspaceId),
    );

    expect(result.failed).toBe(1);
    expect(result.collected).toBeGreaterThanOrEqual(2);
  });

  it("leaves platforms that report nothing alone", async () => {
    const linkedin = new MockSocialProvider({ platform: "LINKEDIN", displayName: "LinkedIn" });
    await createConnectedAccount({ workspaceId, connectedBy: owner.id, provider: linkedin });

    const result = await AnalyticsService.collectWorkspaceAnalytics(
      new Types.ObjectId(workspaceId),
    );

    // LinkedIn has no ANALYTICS capability, so it's skipped rather than failed.
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });
});

describe("Reading the report", () => {
  it("says so when nothing has been collected yet", async () => {
    const report = await getReport();
    expect(report.isEmpty).toBe(true);
    expect(report.totals.engagement).toBe(0);
    expect(report.topPosts).toEqual([]);
  });

  it("totals only the metrics a platform reported", async () => {
    const post = await publishPost({ providerPostId: "v-1", publishedAt: ago(3) });
    await snapshot({
      post: post._id,
      providerPostId: "v-1",
      metrics: { views: 500, likes: 10, comments: 2, shares: 1 },
      capturedAt: ago(1),
    });

    const report = await getReport();

    expect(report.totals.totals).toEqual({ views: 500, likes: 10, comments: 2, shares: 1 });
    // Engagement is likes + comments + shares + saves, counting only what's there.
    expect(report.totals.engagement).toBe(13);
    // TikTok reports no impressions, reach, clicks or saves.
    expect(report.unavailableMetrics).toContain("impressions");
    expect(report.availableMetrics).toEqual(
      expect.arrayContaining(["views", "likes", "comments", "shares", "followers"]),
    );
  });

  it("uses the latest reading per post, not the sum of every reading", async () => {
    const post = await publishPost({ providerPostId: "v-1", publishedAt: ago(5) });
    // Lifetime counters climb, so adding days together would count them twice.
    await snapshot({
      post: post._id,
      providerPostId: "v-1",
      metrics: { views: 100, likes: 5 },
      capturedAt: ago(3),
    });
    await snapshot({
      post: post._id,
      providerPostId: "v-1",
      metrics: { views: 400, likes: 20 },
      capturedAt: ago(1),
    });

    const report = await getReport();

    expect(report.totals.totals.views).toBe(400);
    expect(report.topPosts[0].metrics.likes).toBe(20);
  });

  it("works out follower growth from the ends of the range", async () => {
    await snapshot({
      scope: AnalyticsScope.ACCOUNT,
      metrics: { followers: 1000 },
      capturedAt: ago(6),
    });
    await snapshot({
      scope: AnalyticsScope.ACCOUNT,
      metrics: { followers: 1150 },
      capturedAt: ago(1),
    });

    const report = await getReport();

    expect(report.followerGrowth).toEqual([
      expect.objectContaining({ accountName: "Acme on TikTok", first: 1000, change: 150 }),
    ]);
    // A follower count is an account total, so it isn't added into post totals.
    expect(report.totals.totals.followers).toBeUndefined();
  });

  it("ranks top posts, best platform and best pillar by engagement", async () => {
    const quiet = await publishPost({
      providerPostId: "v-1",
      publishedAt: ago(4),
      pillar: "Origins",
      topic: "Quiet post",
    });
    const loud = await publishPost({
      providerPostId: "v-2",
      publishedAt: ago(3),
      pillar: "Brewing",
      topic: "Loud post",
    });
    await snapshot({
      post: quiet._id,
      providerPostId: "v-1",
      metrics: { likes: 2 },
      capturedAt: ago(1),
    });
    await snapshot({
      post: loud._id,
      providerPostId: "v-2",
      metrics: { likes: 40, shares: 5 },
      capturedAt: ago(1),
    });

    const report = await getReport();

    expect(report.topPosts.map((item) => item.postId)).toEqual([loud.id, quiet.id]);
    expect(report.bestPlatform).toMatchObject({ platform: "TIKTOK", engagement: 47 });
    expect(report.bestPillar).toMatchObject({ pillar: "Brewing", engagement: 45 });
  });

  it("reports the times that performed best", async () => {
    const published = new Date(Date.UTC(2026, 8, 14, 9, 0, 0));
    const post = await publishPost({ providerPostId: "v-1", publishedAt: published });
    await snapshot({
      post: post._id,
      providerPostId: "v-1",
      metrics: { likes: 30 },
      capturedAt: ago(1),
    });

    const report = await getReport();

    expect(report.bestTimes[0]).toMatchObject({
      weekday: published.getUTCDay(),
      hour: 9,
      engagement: 30,
    });
  });

  it("explains platforms that expose no analytics at all", async () => {
    const linkedin = new MockSocialProvider({ platform: "LINKEDIN", displayName: "LinkedIn" });
    await createConnectedAccount({ workspaceId, connectedBy: owner.id, provider: linkedin });

    const report = await getReport();

    expect(report.platformNotes).toEqual([
      { platform: "LINKEDIN", note: expect.stringContaining("Community Management API") },
    ]);
  });

  it("only counts snapshots inside the range", async () => {
    const post = await publishPost({ providerPostId: "v-1", publishedAt: ago(40) });
    await snapshot({
      post: post._id,
      providerPostId: "v-1",
      metrics: { likes: 99 },
      capturedAt: ago(40),
    });

    expect((await getReport("?range=7d")).isEmpty).toBe(true);
    expect((await getReport("?range=90d")).totals.engagement).toBe(99);
  });

  it("filters by platform", async () => {
    const post = await publishPost({ providerPostId: "v-1", publishedAt: ago(2) });
    await snapshot({
      post: post._id,
      providerPostId: "v-1",
      metrics: { likes: 7 },
      capturedAt: ago(1),
    });

    expect((await getReport("?platform=TIKTOK")).totals.engagement).toBe(7);
    expect((await getReport("?platform=FACEBOOK")).isEmpty).toBe(true);
  });

  it("validates a custom range", async () => {
    await call(owner, "get", analyticsPath("?range=custom")).expect(422);
    await call(
      owner,
      "get",
      analyticsPath("?range=custom&from=2026-09-10T00:00:00Z&to=2026-09-01T00:00:00Z"),
    ).expect(422);

    const res = await call(
      owner,
      "get",
      analyticsPath("?range=custom&from=2026-09-01T00:00:00Z&to=2026-09-10T00:00:00Z"),
    ).expect(200);
    expect(res.body.data.range.from).toBe("2026-09-01T00:00:00.000Z");
  });

  it("keeps analytics inside their workspace", async () => {
    const post = await publishPost({ providerPostId: "v-1", publishedAt: ago(2) });
    await snapshot({
      post: post._id,
      providerPostId: "v-1",
      metrics: { likes: 5 },
      capturedAt: ago(1),
    });

    const outsider = await createUser("Olive Outsider");
    await call(outsider, "get", analyticsPath()).expect(404);

    const otherWorkspace = await createWorkspace(outsider);
    const res = await call(outsider, "get", `/workspaces/${otherWorkspace.id}/analytics`).expect(
      200,
    );
    expect(res.body.data.isEmpty).toBe(true);
  });

  it("deletes snapshots with the workspace", async () => {
    const post = await publishPost({ providerPostId: "v-1", publishedAt: ago(2) });
    await snapshot({
      post: post._id,
      providerPostId: "v-1",
      metrics: { likes: 5 },
      capturedAt: ago(1),
    });

    await AnalyticsService.deleteWorkspaceAnalytics(new Types.ObjectId(workspaceId));

    expect(
      await AnalyticsSnapshot.countDocuments({ workspace: workspaceId }).setOptions(unscoped),
    ).toBe(0);
  });
});

describe("Refreshing on demand", () => {
  it("collects immediately for an editor", async () => {
    await publishPost({ providerPostId: "v-1", publishedAt: ago(1) });

    const res = await call(owner, "post", analyticsPath("/refresh")).expect(200);

    expect(res.body.data).toMatchObject({ collected: 2, failed: 0 });
    expect(await AnalyticsSnapshot.countDocuments({ workspace: workspaceId })).toBe(2);
  });
});
