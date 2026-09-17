import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STRATEGY_SECTIONS } from "../src/constants/contentStrategy.constant";
import { setAIProvider } from "../src/integrations/ai/registry";
import { AIUsage } from "../src/models/aiUsage.model";
import { ContentStrategy } from "../src/models/contentStrategy.model";
import { Workspace } from "../src/models/workspace.model";
import type { StrategyContent } from "../src/validators/contentStrategy.validator";
import { useTestDatabase } from "./helpers/database";
import { FakeAIProvider } from "./helpers/fakeAIProvider";
import { strategyContent } from "./helpers/strategyFixture";
import { addMember, call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

let aiOutput: unknown;
let provider: FakeAIProvider;
let restoreProvider: () => void;
let owner: TestUser;
let workspaceId: string;

beforeEach(async () => {
  aiOutput = strategyContent();
  provider = new FakeAIProvider(() => aiOutput);
  restoreProvider = setAIProvider(provider);
  owner = await createUser("Olivia Owner");
  workspaceId = (await createWorkspace(owner)).id;
});
afterEach(() => restoreProvider());

const strategiesPath = (id = workspaceId) => `/workspaces/${id}/content-strategies`;
const generate = (user: TestUser = owner, body: object = {}) =>
  call(user, "post", `${strategiesPath()}/generate`, body);
const generateId = async (body: object = {}) =>
  (await generate(owner, body).expect(201)).body.data.strategy.id as string;
const activate = (user: TestUser, strategyId: string) =>
  call(user, "post", `${strategiesPath()}/${strategyId}/activate`);
const update = (user: TestUser, strategyId: string, body: object) =>
  call(user, "patch", `${strategiesPath()}/${strategyId}`, body);

/** Every stored strategy across workspaces, by version. */
const storedStrategies = () =>
  ContentStrategy.find({}).setOptions({ skipWorkspaceScope: true }).sort({ version: 1 }).lean();

interface ErrorDetail {
  path: string;
  message: string;
}
const detailPaths = (body: { error: { details?: ErrorDetail[] } }) =>
  (body.error.details ?? []).map((detail) => detail.path);

describe("Generating a content strategy", () => {
  it("creates a draft version from the brand profile and validated AI output", async () => {
    await call(owner, "patch", `/workspaces/${workspaceId}/brand-profile`, {
      businessName: "Acme Coffee",
      targetAudience: "Home baristas",
      primaryGoal: "SALES",
      preferredPlatforms: ["INSTAGRAM"],
    }).expect(200);

    const res = await generate(owner, {
      name: "Q4 plan",
      timeframe: "QUARTER",
      focus: "Launch subscriptions",
    }).expect(201);

    expect(res.body.data.strategy).toMatchObject({
      version: 1,
      name: "Q4 plan",
      status: "DRAFT",
      revision: 0,
      basedOnVersion: null,
      inputs: {
        timeframe: "QUARTER",
        platforms: [],
        focus: "Launch subscriptions",
        instructions: null,
      },
      generation: {
        provider: "fake",
        model: "gpt-5.6-terra-2026-08-01",
        promptVersion: "2.2.0",
        inputTokens: 1000,
        outputTokens: 500,
        brandProfileComplete: false,
        brandProfileUpdatedAt: expect.any(String),
      },
      createdBy: { id: owner.id, name: "Olivia Owner" },
      content: strategyContent(),
    });
    expect(res.body.data.warnings[0]).toContain("brand profile isn't complete");

    const [sent] = provider.requests;
    expect(sent.schema.name).toBe("content_strategy");
    expect(sent.maxRetries).toBe(1);
    for (const expected of [
      "Business name: Acme Coffee",
      "Target audience: Home baristas",
      "Primary goal: Increase sales",
      "INSTAGRAM (Instagram)",
      "Timeframe: The next three months",
      "Focus: Launch subscriptions",
    ]) {
      expect(sent.input).toContain(expected);
    }
    for (const section of STRATEGY_SECTIONS) {
      expect(sent.schema.jsonSchema).toHaveProperty(["properties", section]);
    }

    const usage = await AIUsage.find({}).setOptions({ skipWorkspaceScope: true }).lean();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      operation: "CONTENT_STRATEGY",
      promptVersion: "2.2.0",
      status: "SUCCESS",
    });
  });

  it("cleans up AI output so it passes the same validation as manual edits", async () => {
    const messy: StrategyContent = strategyContent();
    messy.contentPillars[0].name = `  ${"P".repeat(300)}  `;
    messy.contentPillars.push({ name: " ", description: "", objective: "", exampleTopics: [] });
    messy.contentFormats = [
      { format: "CAROUSEL", sharePercent: 50, purpose: "" },
      { format: "SHORT_VIDEO", sharePercent: 30, purpose: "" },
      { format: "CAROUSEL", sharePercent: 20, purpose: "Duplicate" },
    ];
    messy.postingFrequency = {
      summary: "",
      postsPerWeek: 99,
      platforms: [
        { platform: "INSTAGRAM", postsPerWeek: 3, bestDays: ["MONDAY"], timing: "" },
        { platform: "LINKEDIN", postsPerWeek: 2.4, bestDays: ["MONDAY", "MONDAY"], timing: "" },
      ],
    };
    messy.hashtagApproach = {
      ...messy.hashtagApproach,
      minPerPost: 9,
      maxPerPost: 2,
      community: ["home barista", "#HomeBarista", "coffee!"],
    };
    aiOutput = messy;

    const res = await generate().expect(201);
    const { content } = res.body.data.strategy;

    expect(content.contentPillars).toHaveLength(2);
    expect(content.contentPillars[0].name).toBe("P".repeat(120));
    expect(content.contentFormats).toEqual([
      { format: "CAROUSEL", sharePercent: 63, purpose: "" },
      { format: "SHORT_VIDEO", sharePercent: 37, purpose: "" },
    ]);
    expect(content.postingFrequency.postsPerWeek).toBe(5);
    expect(content.postingFrequency.platforms[1]).toMatchObject({
      postsPerWeek: 2,
      bestDays: ["MONDAY"],
    });
    expect(content.hashtagApproach).toMatchObject({
      minPerPost: 2,
      maxPerPost: 9,
      community: ["#homebarista", "#coffee"],
    });
  });

  it("returns 503 and stores nothing when AI isn't configured", async () => {
    provider.available = false;
    const res = await generate().expect(503);
    expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
    expect(await storedStrategies()).toHaveLength(0);
  });

  it("validates generation options", async () => {
    await generate(owner, { timeframe: "YEAR" }).expect(422);
    await generate(owner, { platforms: ["MYSPACE"] }).expect(422);
    await generate(owner, { focus: "x".repeat(501) }).expect(422);
    expect(provider.requests).toHaveLength(0);
  });
});

describe("Strategy versions", () => {
  it("lists versions without content and has no active strategy at first", async () => {
    const first = await generateId();
    const second = await generateId();

    const list = await call(owner, "get", strategiesPath()).expect(200);
    const strategies = list.body.data.strategies as { id: string; version: number }[];
    expect(strategies.map((item) => [item.id, item.version])).toEqual([
      [second, 2],
      [first, 1],
    ]);
    expect(strategies[0]).not.toHaveProperty("content");

    const single = await call(owner, "get", `${strategiesPath()}/${first}`).expect(200);
    expect(single.body.data.strategy.content).toEqual(strategyContent());

    const active = await call(owner, "get", `${strategiesPath()}/active`).expect(200);
    expect(active.body.data.strategy).toBeNull();
  });

  it("regenerates a new draft from a version's settings, leaving the source unchanged", async () => {
    const source = await generateId({
      name: "Team",
      timeframe: "WEEK",
      platforms: ["LINKEDIN"],
      focus: "Hiring",
    });
    aiOutput = {
      ...strategyContent(),
      brandTone: { ...strategyContent().brandTone, summary: "New" },
    };

    const res = await call(owner, "post", `${strategiesPath()}/${source}/regenerate`, {
      instructions: "More video",
      focus: "",
    }).expect(201);

    expect(res.body.data.strategy).toMatchObject({
      version: 2,
      name: "Team",
      status: "DRAFT",
      basedOnVersion: 1,
      inputs: {
        timeframe: "WEEK",
        platforms: ["LINKEDIN"],
        focus: null,
        instructions: "More video",
      },
      content: { brandTone: { summary: "New" } },
    });
    const regenerated = provider.requests[1].input;
    expect(regenerated).toContain("Change instructions: More video");
    expect(regenerated).toContain("Timeframe: The next week");
    expect(regenerated).toContain("LINKEDIN (LinkedIn)");
    expect(regenerated).not.toContain("Focus:");

    const original = await call(owner, "get", `${strategiesPath()}/${source}`).expect(200);
    expect(original.body.data.strategy).toMatchObject({
      version: 1,
      revision: 0,
      inputs: { focus: "Hiring" },
      content: { brandTone: { summary: strategyContent().brandTone.summary } },
    });
  });
});

describe("Editing a strategy", () => {
  it("saves edited sections and leaves the others unchanged", async () => {
    const id = await generateId();

    const res = await update(owner, id, {
      revision: 0,
      name: "  Edited  ",
      sections: {
        contentPillars: [
          { name: "New pillar", description: "d", objective: "o", exampleTopics: ["a", " "] },
        ],
        hashtagApproach: { ...strategyContent().hashtagApproach, community: ["coffee lovers"] },
      },
    }).expect(200);

    expect(res.body.data.strategy).toMatchObject({
      name: "Edited",
      revision: 1,
      editedBy: { id: owner.id },
      editedAt: expect.any(String),
      content: {
        contentPillars: [
          { name: "New pillar", description: "d", objective: "o", exampleTopics: ["a"] },
        ],
        hashtagApproach: { community: ["#coffeelovers"] },
        audienceAnalysis: strategyContent().audienceAnalysis,
      },
    });
  });

  it("rejects saves based on an outdated revision", async () => {
    const id = await generateId();
    await update(owner, id, { revision: 0, name: "First" }).expect(200);

    const stale = await update(owner, id, { revision: 0, name: "Second" }).expect(409);
    expect(stale.body.error.code).toBe("CONFLICT");

    const current = await call(owner, "get", `${strategiesPath()}/${id}`).expect(200);
    expect(current.body.data.strategy).toMatchObject({ name: "First", revision: 1 });
  });

  it("validates each saved section in full", async () => {
    const id = await generateId();

    const shares = await update(owner, id, {
      revision: 0,
      sections: {
        contentFormats: [
          { format: "CAROUSEL", sharePercent: 50, purpose: "" },
          { format: "SHORT_VIDEO", sharePercent: 40, purpose: "" },
        ],
      },
    }).expect(422);
    expect(detailPaths(shares.body)).toContain("sections.contentFormats");

    const blankName = await update(owner, id, {
      revision: 0,
      sections: {
        contentPillars: [{ name: "", description: "", objective: "", exampleTopics: [] }],
      },
    }).expect(422);
    expect(detailPaths(blankName.body)).toContain("sections.contentPillars.0.name");

    const duplicatePlatform = await update(owner, id, {
      revision: 0,
      sections: {
        platformStrategy: [
          strategyContent().platformStrategy[0],
          strategyContent().platformStrategy[0],
        ],
      },
    }).expect(422);
    expect(detailPaths(duplicatePlatform.body)).toContain("sections.platformStrategy.1");

    await update(owner, id, { revision: 0, sections: { brandTone: { summary: "x" } } }).expect(422);
    await update(owner, id, {
      revision: 0,
      sections: {
        hashtagApproach: { ...strategyContent().hashtagApproach, minPerPost: 9, maxPerPost: 2 },
      },
    }).expect(422);
    await update(owner, id, { revision: 0 }).expect(422);

    const unchanged = await call(owner, "get", `${strategiesPath()}/${id}`).expect(200);
    expect(unchanged.body.data.strategy).toMatchObject({ revision: 0, content: strategyContent() });
  });
});

describe("Activating a strategy", () => {
  it("keeps exactly one active strategy and archives the previous one", async () => {
    const first = await generateId();
    const second = await generateId();

    const activatedFirst = await activate(owner, first).expect(200);
    expect(activatedFirst.body.data.strategy).toMatchObject({
      status: "ACTIVE",
      activatedBy: { id: owner.id },
      activatedAt: expect.any(String),
    });
    const active = await call(owner, "get", `${strategiesPath()}/active`).expect(200);
    expect(active.body.data.strategy.id).toBe(first);

    await activate(owner, second).expect(200);
    const afterSecond = await storedStrategies();
    expect(afterSecond.map((item) => item.status)).toEqual(["ARCHIVED", "ACTIVE"]);
    expect(afterSecond[0].archivedAt).toBeInstanceOf(Date);

    // Previous versions are read-only but can be activated again.
    await update(owner, first, { revision: 0, name: "Nope" }).expect(409);
    await activate(owner, first).expect(200);
    expect((await storedStrategies()).map((item) => item.status)).toEqual(["ACTIVE", "ARCHIVED"]);

    // Activating the active strategy changes nothing.
    await activate(owner, first).expect(200);
    expect((await storedStrategies()).filter((item) => item.status === "ACTIVE")).toHaveLength(1);
  });

  it("guarantees a single active strategy under concurrent activation", async () => {
    await ContentStrategy.init();
    const ids = [await generateId(), await generateId(), await generateId()];

    const responses = await Promise.all(ids.map((id) => activate(owner, id)));
    for (const res of responses) expect([200, 409]).toContain(res.status);
    expect((await storedStrategies()).filter((item) => item.status === "ACTIVE")).toHaveLength(1);

    // The database itself rejects a second active strategy.
    await expect(
      ContentStrategy.updateMany({ status: "ARCHIVED" }, { $set: { status: "ACTIVE" } })
        .setOptions({ skipWorkspaceScope: true })
        .exec(),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe("Deleting a strategy", () => {
  const remove = (user: TestUser, strategyId: string) =>
    call(user, "delete", `${strategiesPath()}/${strategyId}`);

  it("lets editors delete drafts, and only admins delete active or previous versions", async () => {
    const editor = await createUser("Eddie Editor");
    await addMember(owner, workspaceId, editor, "EDITOR");

    const draft = await generateId();
    await remove(editor, draft).expect(200);
    await call(owner, "get", `${strategiesPath()}/${draft}`).expect(404);

    const first = await generateId();
    const second = await generateId();
    await activate(owner, first).expect(200);
    await activate(owner, second).expect(200);
    // `first` is now a previous version and `second` is active.

    expect((await remove(editor, first).expect(403)).body.message).toMatch(/previous versions/);
    expect((await remove(editor, second).expect(403)).body.message).toMatch(/active strategy/);

    await remove(owner, first).expect(200);
    await remove(owner, second).expect(200);
    expect(
      (await storedStrategies()).filter((item) => item.workspace.toString() === workspaceId),
    ).toEqual([]);
  });

  it("leaves the workspace without an active strategy when the active one goes", async () => {
    const strategyId = await generateId();
    await activate(owner, strategyId).expect(200);

    await remove(owner, strategyId).expect(200);

    const active = await call(owner, "get", `${strategiesPath()}/active`).expect(200);
    expect(active.body.data.strategy).toBeNull();
    // A new strategy can be activated straight away.
    const next = await generateId();
    await activate(owner, next).expect(200);
  });

  it("won't delete from another workspace, or for viewers", async () => {
    const strategyId = await generateId();

    const viewer = await createUser("Vera Viewer");
    await addMember(owner, workspaceId, viewer, "VIEWER");
    await remove(viewer, strategyId).expect(403);

    const outsider = await createUser("Olive Outsider");
    const otherWorkspace = await createWorkspace(outsider);
    await call(
      outsider,
      "delete",
      `/workspaces/${otherWorkspace.id}/content-strategies/${strategyId}`,
    ).expect(404);

    await call(owner, "get", `${strategiesPath()}/${strategyId}`).expect(200);
  });
});

describe("Strategy permissions", () => {
  it("lets members view, editors generate and edit drafts, and admins activate", async () => {
    const editor = await createUser("Eddie Editor");
    const viewer = await createUser("Vera Viewer");
    const admin = await createUser("Ada Admin");
    await addMember(owner, workspaceId, editor, "EDITOR");
    await addMember(owner, workspaceId, viewer, "VIEWER");
    await addMember(owner, workspaceId, admin, "ADMIN");

    const draft = (await generate(editor).expect(201)).body.data.strategy.id as string;
    await call(viewer, "get", strategiesPath()).expect(200);
    await call(viewer, "get", `${strategiesPath()}/${draft}`).expect(200);
    await generate(viewer).expect(403);
    await update(viewer, draft, { revision: 0, name: "Viewer" }).expect(403);
    await call(viewer, "post", `${strategiesPath()}/${draft}/regenerate`, {}).expect(403);

    await update(editor, draft, { revision: 0, name: "Editor draft" }).expect(200);
    await activate(editor, draft).expect(403);
    await activate(viewer, draft).expect(403);

    await activate(admin, draft).expect(200);
    const editActive = await update(editor, draft, { revision: 1, name: "Editor" }).expect(403);
    expect(editActive.body.message).toContain("active strategy");
    await update(admin, draft, { revision: 1, name: "Admin edit" }).expect(200);
  });

  it("keeps strategies private to their workspace and deletes them with it", async () => {
    const id = await generateId();
    const outsider = await createUser("Oscar Outsider");
    const otherWorkspace = (await createWorkspace(outsider)).id;

    // Another workspace's route can't reach this strategy.
    await call(outsider, "get", `${strategiesPath(otherWorkspace)}/${id}`).expect(404);
    await call(outsider, "patch", `${strategiesPath(otherWorkspace)}/${id}`, {
      revision: 0,
      name: "Hijack",
    }).expect(404);
    await call(outsider, "post", `${strategiesPath(otherWorkspace)}/${id}/activate`).expect(404);
    await call(outsider, "get", `${strategiesPath()}/${id}`).expect(404);
    await call(owner, "get", `${strategiesPath()}/not-an-id`).expect(422);

    const workspace = await Workspace.findById(workspaceId).orFail();
    await call(owner, "delete", `/workspaces/${workspaceId}`).expect(200);
    await call(owner, "delete", `/workspaces/${workspaceId}/permanent`, {
      confirmName: workspace.name,
    }).expect(200);
    expect(await storedStrategies()).toHaveLength(0);
  });
});
