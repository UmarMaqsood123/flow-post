import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAIProvider } from "../src/integrations/ai/registry";
import type { StructuredGenerationRequest } from "../src/integrations/ai/types";
import {
  calculatePerformance,
  classifyCta,
  classifyFormat,
  classifyHook,
  type PostSample,
  timeOfDayBucket,
} from "../src/integrations/insights/calculate";
import { AnalyticsSnapshot } from "../src/models/analyticsSnapshot.model";
import { PerformanceInsightReport } from "../src/models/performanceInsightReport.model";
import { Post } from "../src/models/post.model";
import { PostVersion } from "../src/models/postVersion.model";
import * as PerformanceInsightsService from "../src/services/performanceInsights.service";
import { useTestDatabase } from "./helpers/database";
import { FakeAIProvider } from "./helpers/fakeAIProvider";
import { postContent, postDraft } from "./helpers/postFixture";
import { addMember, call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

type AIInsight = {
  category: string;
  title: string;
  interpretation: string;
  recommendation: string;
  factIds: string[];
};

let aiInsights: AIInsight[];
let provider: FakeAIProvider;
let restoreProvider: () => void;
let owner: TestUser;
let workspaceId: string;

const DAY_MS = 86_400_000;
const unscoped = { skipWorkspaceScope: true } as const;

const respond = (request: StructuredGenerationRequest<unknown>) =>
  request.schema.name === "performance_insights"
    ? { insights: aiInsights }
    : { drafts: [postDraft("LINKEDIN")] };

beforeEach(async () => {
  aiInsights = [];
  provider = new FakeAIProvider(respond);
  restoreProvider = setAIProvider(provider);
  owner = await createUser("Olivia Owner");
  workspaceId = (await createWorkspace(owner)).id;
});
afterEach(() => restoreProvider());

const insightsPath = (suffix = "") => `/workspaces/${workspaceId}/insights${suffix}`;

/** A published post with a current version and one metrics snapshot. */
const seedPost = async ({
  daysAgo = 3,
  pillar = "Brewing",
  topic = "Grind size",
  hook = "Why does grind size matter?",
  likes = 10,
  views = 100,
}: {
  daysAgo?: number;
  pillar?: string | null;
  topic?: string;
  hook?: string;
  likes?: number;
  views?: number;
} = {}) => {
  const workspace = new Types.ObjectId(workspaceId);
  const user = new Types.ObjectId(owner.id);
  const publishedAt = new Date(Date.now() - daysAgo * DAY_MS);
  const post = await Post.create({
    workspace,
    platform: "LINKEDIN",
    status: "PUBLISHED",
    pillar,
    publishedAt,
    brief: { topic },
    versionCount: 1,
    createdBy: user,
    updatedBy: user,
  });
  const version = await PostVersion.create({
    workspace,
    post: post._id,
    version: 1,
    content: postContent({ hook }),
    source: "CREATE",
    label: "Created",
    createdBy: user,
  });
  await Post.updateOne({ _id: post._id }, { currentVersion: version._id }).setOptions(unscoped);
  await AnalyticsSnapshot.create({
    workspace,
    socialAccount: new Types.ObjectId(),
    platform: "LINKEDIN",
    scope: "POST",
    post: post._id,
    metrics: { likes, views },
    raw: {},
    capturedAt: new Date(),
    capturedOn: new Date().toISOString().slice(0, 10),
  });
  return post;
};

const seedPosts = async (count: number) => {
  for (let index = 0; index < count; index += 1) {
    await seedPost({ likes: 10 + index });
  }
};

const validInsight = (overrides: Partial<AIInsight> = {}): AIInsight => ({
  category: "PILLAR",
  title: "Brewing posts carry the account",
  interpretation: "Posts about brewing drew the most engagement.",
  recommendation: "Keep brewing as the lead pillar next week.",
  factIds: ["PILLAR:brewing"],
  ...overrides,
});

const generate = (user: TestUser = owner) => call(user, "post", insightsPath("/generate"));

// ── Calculation ─────────────────────────────────────────────

describe("Calculating performance", () => {
  const sample = (overrides: Partial<PostSample> = {}): PostSample => ({
    postId: new Types.ObjectId().toString(),
    platform: "LINKEDIN",
    pillar: "Brewing",
    topic: "Grind size",
    publishedAt: new Date("2026-09-14T09:30:00Z"),
    hook: null,
    text: "Fresh beans taste better.",
    cta: null,
    format: "TEXT",
    engagement: 10,
    views: 100,
    ...overrides,
  });

  it("classifies hooks, calls to action and formats", () => {
    expect(classifyHook("Why does grind size matter?", "")).toBe("QUESTION");
    expect(classifyHook(null, "How to dial in espresso\nMore")).toBe("HOW_TO");
    expect(classifyHook("5 mistakes with pour over", "")).toBe("NUMBER");
    expect(classifyHook("Stop buying pre-ground coffee", "")).toBe("CONTRARIAN");
    expect(classifyHook("Fresh beans taste better.", "")).toBe("STATEMENT");

    expect(classifyCta("Tell us your go-to brew", "")).toBe("COMMENT");
    expect(classifyCta("Shop the roast", "")).toBe("LINK");
    expect(classifyCta(null, "Great coffee.\nFollow for more\n#coffee")).toBe("FOLLOW");
    expect(classifyCta(null, "")).toBe("NONE");

    expect(classifyFormat([], null)).toBe("TEXT");
    expect(classifyFormat([{ kind: "image" }, { kind: "image" }], null)).toBe("CAROUSEL");
    expect(classifyFormat([{ kind: "video" }], "short")).toBe("SHORT_VIDEO");
    expect(timeOfDayBucket(23).key).toBe("NIGHT");
    expect(timeOfDayBucket(2).key).toBe("NIGHT");
  });

  it("groups posts, measures them against the average and rates confidence by post count", () => {
    const samples = [
      ...Array.from({ length: 5 }, () => sample({ pillar: "Brewing", engagement: 30 })),
      sample({ pillar: "Hiring", engagement: 0, views: null }),
    ];
    const { postsAnalyzed, baseline, facts } = calculatePerformance(samples, "UTC");

    expect(postsAnalyzed).toBe(6);
    expect(baseline.avgEngagement).toBe(25);
    const brewing = facts.find((fact) => fact.id === "PILLAR:brewing")!;
    expect(brewing).toMatchObject({
      posts: 5,
      totalEngagement: 150,
      avgEngagement: 30,
      avgViews: 100,
      engagementRate: 0.3,
      liftVsAverage: 1.2,
      confidence: "HIGH",
    });
    const hiring = facts.find((fact) => fact.id === "PILLAR:hiring")!;
    expect(hiring).toMatchObject({
      posts: 1,
      avgViews: null,
      engagementRate: null,
      confidence: "LOW",
    });
    // Monday 09:30 UTC, read in the workspace's own time zone.
    expect(facts.some((fact) => fact.id === "WEEKDAY:1")).toBe(true);
    expect(facts.some((fact) => fact.id === "TIME_OF_DAY:MORNING")).toBe(true);
    expect(
      calculatePerformance([sample()], "America/Los_Angeles").facts.some(
        (fact) => fact.id === "TIME_OF_DAY:NIGHT",
      ),
    ).toBe(true);
  });
});

// ── Reports ────────────────────────────────────────────────

describe("Generating insight reports", () => {
  it("stores the numbers but skips the AI when there isn't enough data", async () => {
    await seedPosts(2);
    const res = await generate().expect(201);

    expect(res.body.data).toMatchObject({
      status: "INSUFFICIENT_DATA",
      postsAnalyzed: 2,
      minPostsNeeded: 5,
      insights: [],
      generation: null,
    });
    expect(res.body.data.facts.length).toBeGreaterThan(0);
    expect(provider.requests).toHaveLength(0);
  });

  it("ignores posts without collected metrics instead of counting them as zero", async () => {
    await seedPosts(5);
    const withoutMetrics = await seedPost();
    await AnalyticsSnapshot.deleteMany({ post: withoutMetrics._id }).setOptions(unscoped);

    const res = await generate().expect(201);
    expect(res.body.data.postsAnalyzed).toBe(5);
  });

  it("sends only calculated facts to the AI and keeps insights that follow the rules", async () => {
    await seedPosts(5);
    aiInsights = [validInsight()];

    const res = await generate().expect(201);
    const report = res.body.data;
    expect(report.status).toBe("READY");
    expect(report.generation).toMatchObject({ promptVersion: "1.0.0" });
    expect(report.insights).toHaveLength(1);
    expect(report.insights[0]).toMatchObject({ status: "PENDING", factIds: ["PILLAR:brewing"] });

    const input = provider.requests[0].input;
    expect(input).toContain("[PILLAR:brewing]");
    expect(input).toContain("Published posts analysed: 5");
  });

  it("throws away insights that write their own numbers or cite facts they shouldn't", async () => {
    await seedPosts(5);
    await seedPost({ pillar: "Hiring" });
    aiInsights = [
      validInsight({ interpretation: "Brewing posts got 3x more likes." }),
      validInsight({ factIds: ["PILLAR:made-up"] }),
      validInsight({ category: "TOPIC" }),
      validInsight({ factIds: ["PILLAR:hiring"] }),
      validInsight(),
    ];

    const report = (await generate().expect(201)).body.data;
    expect(report.insights).toHaveLength(1);
    expect(report.rejectedInsights).toBe(4);
  });

  it("keeps the calculation when the AI fails", async () => {
    await seedPosts(5);
    provider.failWith = new Error("boom");

    const report = (await generate().expect(201)).body.data;
    expect(report.status).toBe("READY");
    expect(report.facts.length).toBeGreaterThan(0);
    expect(report.insights).toEqual([]);
    expect(report.aiError).toBeTruthy();
    expect(await PerformanceInsightReport.countDocuments({}).setOptions(unscoped)).toBe(1);
  });

  it("lets viewers read reports but not generate or approve them", async () => {
    await seedPosts(5);
    aiInsights = [validInsight()];
    const report = (await generate().expect(201)).body.data;

    const viewer = await createUser("Vic Viewer");
    const editor = await createUser("Eda Editor");
    await addMember(owner, workspaceId, viewer, "VIEWER");
    await addMember(owner, workspaceId, editor, "EDITOR");

    const overview = (await call(viewer, "get", insightsPath()).expect(200)).body.data;
    expect(overview.latest.id).toBe(report.id);
    expect(overview.reports).toHaveLength(1);
    await call(viewer, "get", insightsPath(`/${report.id}`)).expect(200);
    await generate(viewer).expect(403);

    const decide = `/${report.id}/insights/${report.insights[0].id}`;
    await call(editor, "patch", insightsPath(decide), { status: "APPROVED" }).expect(403);
    await call(owner, "patch", insightsPath(decide), { status: "WRONG" }).expect(422);
  });
});

// ── Approval and generation ────────────────────────────────

describe("Approved insights", () => {
  const approveOne = async () => {
    await seedPosts(5);
    aiInsights = [validInsight()];
    const report = (await generate().expect(201)).body.data;
    const path = insightsPath(`/${report.id}/insights/${report.insights[0].id}`);
    return { report, path };
  };

  it("only steer post generation once an admin approves them", async () => {
    const { path } = await approveOne();
    const generatePost = () =>
      call(owner, "post", `/workspaces/${workspaceId}/posts/generate`, {
        topic: "Why fresh beans matter",
        platforms: ["LINKEDIN"],
      }).expect(201);

    await generatePost();
    expect(provider.requests.at(-1)!.input).not.toContain("<performance_insights>");

    const approved = await call(owner, "patch", path, { status: "APPROVED" }).expect(200);
    expect(approved.body.data.insights[0].status).toBe("APPROVED");
    const overview = (await call(owner, "get", insightsPath()).expect(200)).body.data;
    expect(overview.approved).toHaveLength(1);

    await generatePost();
    const input = provider.requests.at(-1)!.input;
    expect(input).toContain("<performance_insights>");
    expect(input).toContain("Keep brewing as the lead pillar next week.");

    await call(owner, "patch", path, { status: "DISMISSED" }).expect(200);
    await generatePost();
    expect(provider.requests.at(-1)!.input).not.toContain("<performance_insights>");
  });

  it("returns 404 for an insight in another workspace", async () => {
    const { report } = await approveOne();
    const stranger = await createUser("Sam Stranger");
    const otherId = (await createWorkspace(stranger)).id;
    await call(
      stranger,
      "patch",
      `/workspaces/${otherId}/insights/${report.id}/insights/${report.insights[0].id}`,
      { status: "APPROVED" },
    ).expect(404);
  });
});

describe("Weekly reports", () => {
  it("writes one automatic report per workspace per week", async () => {
    await seedPosts(5);
    aiInsights = [validInsight()];
    const now = new Date();

    expect(await PerformanceInsightsService.generateDueReports({ now })).toEqual({ generated: 1 });
    expect(await PerformanceInsightsService.generateDueReports({ now })).toEqual({ generated: 0 });

    const reports = await PerformanceInsightReport.find({}).setOptions(unscoped).lean();
    expect(reports).toHaveLength(1);
    expect(reports[0].createdBy).toBeNull();

    const nextWeek = new Date(now.getTime() + 7 * DAY_MS);
    expect(await PerformanceInsightsService.generateDueReports({ now: nextWeek })).toEqual({
      generated: 1,
    });
  });

  it("dates the week from Monday in the workspace time zone", () => {
    // Sunday 23:30 in New York is already Monday in UTC.
    const date = new Date("2026-09-14T03:30:00Z");
    expect(PerformanceInsightsService.weekStartFor(date, "UTC")).toBe("2026-09-14");
    expect(PerformanceInsightsService.weekStartFor(date, "America/New_York")).toBe("2026-09-07");
  });
});
