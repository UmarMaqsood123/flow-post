import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AIProviderError } from "../src/integrations/ai/errors";
import { estimateOpenAICostUsd } from "../src/integrations/ai/pricing";
import { setAIProvider } from "../src/integrations/ai/registry";
import type {
  AIProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from "../src/integrations/ai/types";
import { AIUsage } from "../src/models/aiUsage.model";
import { Workspace } from "../src/models/workspace.model";
import { useTestDatabase } from "./helpers/database";
import { strategyContent } from "./helpers/strategyFixture";
import { addMember, call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

const USAGE = { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 200 };
// gpt-5.6-terra: 800 input × $2 + 200 cached × $0.20 + 500 output × $12, per 1M tokens.
const EXPECTED_COST = 0.00764;

/** Canned structured output per schema name. */
const OUTPUTS: Record<string, unknown> = {
  content_strategy: strategyContent(),
  content_ideas: {
    ideas: Array.from({ length: 4 }, (_, index) => ({
      title: `Idea ${index + 1}`,
      angle: "Myth-busting",
      format: "CAROUSEL",
      platform: "INSTAGRAM",
      hook: "Your grinder is lying to you",
      whyItWorks: "Curiosity",
    })),
  },
  generate_post: {
    text: "Fresh beans taste better.\n\nShop now [link]\n\n#coffee #Coffee",
    hook: "Fresh beans taste better.",
    cta: "Shop now [link]",
    hashtags: ["#coffee", "Coffee", "specialty coffee!", ""],
    imageSuggestion: null,
  },
  rewrite_post: { text: "Shorter.", summaryOfChanges: ["Trimmed"] },
  hashtags: {
    hashtags: [
      { tag: "#Coffee", category: "BROAD" },
      { tag: "coffee", category: "BROAD" },
      { tag: "#Lisbon Coffee", category: "LOCATION" },
    ],
  },
  hooks: { hooks: [{ text: "Stop brewing like this", style: "CONTRARIAN" }] },
  ctas: { ctas: [{ text: "Subscribe today", intent: "SALES" }] },
  platform_adaptations: {
    adaptations: [
      { platform: "X", text: "x".repeat(300), hashtags: ["coffee"], notes: "Condensed" },
    ],
  },
};

class FakeAIProvider implements AIProvider {
  readonly name = "fake";
  readonly defaultModel = "gpt-5.6-terra";
  available = true;
  failWith: AIProviderError | null = null;
  requests: StructuredGenerationRequest<unknown>[] = [];

  isAvailable() {
    return this.available;
  }

  generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    this.requests.push(request as StructuredGenerationRequest<unknown>);
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve({
      data: request.schema.parse(OUTPUTS[request.schema.name]),
      model: "gpt-5.6-terra-2026-08-01",
      usage: USAGE,
      attempts: 1,
      requestId: "req_123",
    });
  }

  estimateCostUsd = estimateOpenAICostUsd;
}

let provider: FakeAIProvider;
let restoreProvider: () => void;
let owner: TestUser;
let workspaceId: string;

beforeEach(async () => {
  provider = new FakeAIProvider();
  restoreProvider = setAIProvider(provider);
  owner = await createUser("Olivia Owner");
  workspaceId = (await createWorkspace(owner)).id;
});
afterEach(() => restoreProvider());

/** Every usage record across workspaces, oldest first. */
const usageRecords = () =>
  AIUsage.find({}).setOptions({ skipWorkspaceScope: true }).sort({ createdAt: 1 }).lean();

const aiPath = (path: string) => `/workspaces/${workspaceId}/ai${path}`;
const generate = (user: TestUser, path: string, body: object) =>
  call(user, "post", aiPath(path), body);

const fillBrandProfile = () =>
  call(owner, "patch", `/workspaces/${workspaceId}/brand-profile`, {
    businessName: "Acme Coffee",
    description: "Roasts specialty coffee for home baristas.",
    targetAudience: "Home baristas in Lisbon",
    primaryGoal: "SALES",
    brandVoice: { tones: ["FRIENDLY"], notes: "No jargon" },
    keywords: ["single origin"],
    preferredPlatforms: ["INSTAGRAM"],
  }).expect(200);

describe("AI generation", () => {
  it("includes the brand profile in the request and returns structured data", async () => {
    await fillBrandProfile();
    const res = await generate(owner, "/posts/generate", {
      platform: "INSTAGRAM",
      topic: "Why fresh beans matter",
    }).expect(200);

    expect(res.body.data).toMatchObject({
      operation: "GENERATE_POST",
      promptVersion: "1.0.0",
      model: "gpt-5.6-terra-2026-08-01",
      brandProfileComplete: false,
      usage: { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: EXPECTED_COST },
      data: {
        platform: "INSTAGRAM",
        cta: "Shop now [link]",
        hashtags: ["#coffee", "#specialtycoffee"],
        characterCount: expect.any(Number),
      },
    });
    expect(res.body.data.warnings[0]).toContain("brand profile isn't complete");

    expect(provider.requests).toHaveLength(1);
    const [sent] = provider.requests;
    expect(sent.schema.name).toBe("generate_post");
    expect(sent.instructions).toContain("Never invent facts");
    for (const expected of [
      "Business name: Acme Coffee",
      "Target audience: Home baristas in Lisbon",
      "Primary goal: Increase sales",
      "Brand voice: Friendly",
      "Topic: Why fresh beans matter",
    ]) {
      expect(sent.input).toContain(expected);
    }
  });

  it("supports every operation", async () => {
    await fillBrandProfile();
    const cases: [string, object, string][] = [
      ["/content-strategy", { timeframe: "WEEK" }, "CONTENT_STRATEGY"],
      ["/content-ideas", { count: 2 }, "CONTENT_IDEAS"],
      ["/posts/generate", { platform: "LINKEDIN", topic: "Launch" }, "GENERATE_POST"],
      ["/posts/rewrite", { text: "A long post.", length: "SHORTER" }, "REWRITE_POST"],
      ["/hashtags", { platform: "INSTAGRAM", topic: "Coffee", count: 5 }, "HASHTAGS"],
      ["/hooks", { platform: "LINKEDIN", text: "Our new roast" }, "HOOK"],
      ["/ctas", { platform: "INSTAGRAM", topic: "Subscriptions" }, "CTA"],
      ["/posts/adapt", { text: "Big news!", targetPlatforms: ["X"] }, "ADAPT_FOR_PLATFORM"],
    ];
    for (const [path, body, operation] of cases) {
      const res = await generate(owner, path, body).expect(200);
      expect(res.body.data.operation).toBe(operation);
    }

    const records = await usageRecords();
    expect(records.map((record) => record.operation)).toEqual(cases.map(([, , op]) => op));
  });

  it("post-processes results to respect the request", async () => {
    const ideas = await generate(owner, "/content-ideas", { count: 2 }).expect(200);
    expect(ideas.body.data.data.ideas).toHaveLength(2);

    const hashtags = await generate(owner, "/hashtags", {
      platform: "INSTAGRAM",
      topic: "Coffee",
    }).expect(200);
    expect(hashtags.body.data.data.hashtags).toEqual([
      { tag: "#Coffee", category: "BROAD" },
      { tag: "#LisbonCoffee", category: "LOCATION" },
    ]);

    const noExtras = await generate(owner, "/posts/generate", {
      platform: "INSTAGRAM",
      topic: "Coffee",
      includeHashtags: false,
      includeCta: false,
    }).expect(200);
    expect(noExtras.body.data.data).toMatchObject({ cta: null, hashtags: [] });

    const adapted = await generate(owner, "/posts/adapt", {
      text: "Big news!",
      targetPlatforms: ["X", "LINKEDIN"],
    }).expect(200);
    expect(adapted.body.data.data.adaptations).toHaveLength(1);
    expect(adapted.body.data.warnings).toEqual(
      expect.arrayContaining([
        "The X version is 300 characters; the limit is 280.",
        "No LinkedIn version was generated.",
      ]),
    );
  });

  it("records usage for successful requests", async () => {
    await generate(owner, "/hooks", { platform: "LINKEDIN", topic: "Hiring" }).expect(200);

    const [record] = await usageRecords();
    expect(record).toMatchObject({
      operation: "HOOK",
      provider: "fake",
      model: "gpt-5.6-terra-2026-08-01",
      promptVersion: "1.0.0",
      inputTokens: 1000,
      outputTokens: 500,
      cachedInputTokens: 200,
      estimatedCostUsd: EXPECTED_COST,
      status: "SUCCESS",
      errorCode: null,
      attempts: 1,
      providerRequestId: "req_123",
    });
    expect(record.workspace.toString()).toBe(workspaceId);
    expect(record.user.toString()).toBe(owner.id);
    expect(record.createdAt).toBeInstanceOf(Date);
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    // Prompts and generated content are never stored.
    expect(JSON.stringify(record)).not.toContain("Hiring");
  });

  it.each([
    ["TIMEOUT", 504, "AI_TIMEOUT"],
    ["RATE_LIMITED", 429, "RATE_LIMITED"],
    ["REFUSED", 422, "AI_REFUSED"],
    ["INVALID_OUTPUT", 502, "AI_INVALID_OUTPUT"],
    ["QUOTA_EXCEEDED", 503, "AI_QUOTA_EXCEEDED"],
    ["AUTHENTICATION", 503, "AI_NOT_CONFIGURED"],
  ] as const)("records %s failures and responds %i", async (kind, status, code) => {
    const error = new AIProviderError(kind, "Provider detail with sk-secret", {
      provider: "fake",
      usage: { inputTokens: 300, outputTokens: 10, cachedInputTokens: 0 },
      detail: "raw provider message",
    });
    error.attempts = 3;
    provider.failWith = error;

    const res = await generate(owner, "/hooks", { platform: "X", topic: "Launch" }).expect(status);
    expect(res.body.error.code).toBe(code);
    expect(JSON.stringify(res.body)).not.toContain("sk-secret");
    expect(JSON.stringify(res.body)).not.toContain("raw provider message");

    const [record] = await usageRecords();
    expect(record).toMatchObject({
      operation: "HOOK",
      status: "FAILURE",
      errorCode: kind,
      inputTokens: 300,
      outputTokens: 10,
      attempts: 3,
      model: "gpt-5.6-terra",
    });
    expect(record.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("returns 503 without calling the provider when AI isn't configured", async () => {
    provider.available = false;
    const res = await generate(owner, "/hooks", { platform: "X", topic: "Launch" }).expect(503);
    expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
    expect(provider.requests).toHaveLength(0);
  });

  it("validates input before calling the provider", async () => {
    await generate(owner, "/posts/generate", { platform: "MYSPACE", topic: "" }).expect(422);
    await generate(owner, "/hashtags", { platform: "X" }).expect(422);
    await generate(owner, "/posts/adapt", { text: "Hi", targetPlatforms: [] }).expect(422);
    await generate(owner, "/content-ideas", { count: 100 }).expect(422);
    expect(provider.requests).toHaveLength(0);
    expect((await usageRecords()).length).toBe(0);
  });
});

describe("AI permissions and usage reporting", () => {
  it("lets editors generate but not viewers or outsiders", async () => {
    const editor = await createUser("Eddie Editor");
    const viewer = await createUser("Vera Viewer");
    const outsider = await createUser("Oscar Outsider");
    await addMember(owner, workspaceId, editor, "EDITOR");
    await addMember(owner, workspaceId, viewer, "VIEWER");

    const body = { platform: "LINKEDIN", topic: "Launch" };
    await generate(editor, "/hooks", body).expect(200);
    await generate(viewer, "/hooks", body).expect(403);
    await generate(outsider, "/hooks", body).expect(404);
    expect(provider.requests).toHaveLength(1);

    const [record] = await usageRecords();
    expect(record.user.toString()).toBe(editor.id);
    await call(editor, "get", aiPath("/usage")).expect(403);
  });

  it("summarizes usage for admins, scoped to the workspace", async () => {
    await generate(owner, "/hooks", { platform: "X", topic: "One" }).expect(200);
    await generate(owner, "/ctas", { platform: "X", topic: "Two" }).expect(200);
    provider.failWith = new AIProviderError("TIMEOUT", "Timed out", {
      provider: "fake",
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    });
    await generate(owner, "/hooks", { platform: "X", topic: "Three" }).expect(504);

    const other = await createWorkspace(owner, { name: "Other workspace" });
    provider.failWith = null;
    await call(owner, "post", `/workspaces/${other.id}/ai/hooks`, {
      platform: "X",
      topic: "Elsewhere",
    }).expect(200);

    const res = await call(owner, "get", aiPath("/usage?days=7")).expect(200);
    expect(res.body.data).toMatchObject({
      days: 7,
      totals: {
        requests: 3,
        failures: 1,
        inputTokens: 2000,
        outputTokens: 1000,
        estimatedCostUsd: EXPECTED_COST * 2,
      },
      byOperation: {
        HOOK: { requests: 2, failures: 1, inputTokens: 1000 },
        CTA: { requests: 1, failures: 0 },
      },
    });
  });

  it("deletes usage records with the workspace", async () => {
    await generate(owner, "/hooks", { platform: "X", topic: "One" }).expect(200);
    const workspace = await Workspace.findById(workspaceId).orFail();

    await call(owner, "delete", `/workspaces/${workspaceId}`).expect(200);
    await call(owner, "delete", `/workspaces/${workspaceId}/permanent`, {
      confirmName: workspace.name,
    }).expect(200);
    expect((await usageRecords()).length).toBe(0);
  });
});
