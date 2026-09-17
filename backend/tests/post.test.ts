import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAIProvider } from "../src/integrations/ai/registry";
import type { StructuredGenerationRequest } from "../src/integrations/ai/types";
import { AIUsage } from "../src/models/aiUsage.model";
import { ContentStrategy } from "../src/models/contentStrategy.model";
import { Post } from "../src/models/post.model";
import { PostVersion } from "../src/models/postVersion.model";
import { Workspace } from "../src/models/workspace.model";
import type { PostContent, PostDraft } from "../src/validators/post.validator";
import { useTestDatabase } from "./helpers/database";
import { FakeAIProvider } from "./helpers/fakeAIProvider";
import { postContent, postDraft } from "./helpers/postFixture";
import { strategyContent } from "./helpers/strategyFixture";
import { addMember, call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

let drafts: PostDraft[];
let refined: PostContent;
let provider: FakeAIProvider;
let restoreProvider: () => void;
let owner: TestUser;
let workspaceId: string;

const respond = (request: StructuredGenerationRequest<unknown>) =>
  request.schema.name === "platform_posts" ? { drafts } : refined;

beforeEach(async () => {
  drafts = [postDraft("LINKEDIN"), postDraft("INSTAGRAM")];
  refined = postContent({ text: "Shorter text about fresh coffee", hashtags: ["#coffee"] });
  provider = new FakeAIProvider(respond);
  restoreProvider = setAIProvider(provider);
  owner = await createUser("Olivia Owner");
  workspaceId = (await createWorkspace(owner)).id;
});
afterEach(() => restoreProvider());

const postsPath = (id = workspaceId) => `/workspaces/${id}/posts`;
const generate = (user: TestUser = owner, body: object = {}) =>
  call(user, "post", `${postsPath()}/generate`, {
    topic: "Why fresh beans matter",
    platforms: ["LINKEDIN", "INSTAGRAM"],
    ...body,
  });
const generateOne = async (platform = "LINKEDIN", body: object = {}) => {
  drafts = [postDraft(platform as "LINKEDIN")];
  const res = await generate(owner, { platforms: [platform], ...body }).expect(201);
  return res.body.data.posts[0] as { id: string; versionCount: number };
};
const getPost = (user: TestUser, postId: string) => call(user, "get", `${postsPath()}/${postId}`);
const refine = (user: TestUser, postId: string, body: object) =>
  call(user, "post", `${postsPath()}/${postId}/refine`, body);

const storedPosts = () => Post.find({}).setOptions({ skipWorkspaceScope: true }).lean();
const storedVersions = (postId: string) =>
  PostVersion.find({ post: postId })
    .setOptions({ skipWorkspaceScope: true })
    .sort({ version: 1 })
    .lean();

describe("Generating posts", () => {
  it("writes one post per platform, each with only that platform's fields", async () => {
    const res = await generate(owner, {
      topic: "Why fresh beans matter",
      goal: "SALES",
      tone: "FRIENDLY",
      instructions: "Mention the subscription",
      platforms: ["LINKEDIN", "INSTAGRAM"],
    }).expect(201);

    const posts = res.body.data.posts as {
      id: string;
      platform: string;
      status: string;
      versionCount: number;
      brief: Record<string, unknown>;
      currentVersion: { version: number; source: string; label: string; content: PostContent };
    }[];
    expect(posts.map((post) => post.platform)).toEqual(["LINKEDIN", "INSTAGRAM"]);

    const [linkedIn, instagram] = posts;
    expect(linkedIn).toMatchObject({
      status: "DRAFT",
      versionCount: 1,
      brief: {
        topic: "Why fresh beans matter",
        goal: "SALES",
        tone: "FRIENDLY",
        instructions: "Mention the subscription",
      },
      currentVersion: { version: 1, source: "GENERATE", label: "Generated" },
    });
    // LinkedIn uses hook, body, CTA and hashtags, but never a title.
    expect(linkedIn.currentVersion.content).toMatchObject({
      title: null,
      hook: "Fresh beans taste better.",
      body: expect.any(String),
      cta: "Shop the roast [link]",
      hashtags: ["#coffee"],
    });
    // Instagram keeps the caption and hashtags only.
    expect(instagram.currentVersion.content).toMatchObject({
      title: null,
      hook: null,
      body: null,
      cta: null,
      text: "INSTAGRAM text about fresh coffee",
    });

    const usage = await AIUsage.find({}).setOptions({ skipWorkspaceScope: true }).lean();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ operation: "CREATE_POSTS", status: "SUCCESS" });
    expect(provider.requests[0].input).toContain("Platforms, in order: LINKEDIN, INSTAGRAM");
    expect(provider.requests[0].input).toContain("Topic: Why fresh beans matter");
  });

  it("warns when two platforms come out almost identical", async () => {
    drafts = [
      postDraft("LINKEDIN", { text: "Fresh beans taste better!" }),
      postDraft("FACEBOOK", { text: "fresh beans taste better" }),
    ];
    const res = await generate(owner, { platforms: ["LINKEDIN", "FACEBOOK"] }).expect(201);
    expect(res.body.data.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("almost identical")]),
    );
  });

  it("gives the AI the active content strategy", async () => {
    await ContentStrategy.create({
      workspace: new Types.ObjectId(workspaceId),
      version: 1,
      status: "ACTIVE",
      content: strategyContent(),
      inputs: { timeframe: "MONTH", platforms: [], focus: null, instructions: null },
      generation: {
        provider: "fake",
        model: "test",
        promptVersion: "2.0.0",
        inputTokens: 1,
        outputTokens: 1,
        estimatedCostUsd: 0,
        brandProfileComplete: true,
        warnings: [],
        generatedAt: new Date(),
      },
      createdBy: new Types.ObjectId(owner.id),
    });

    await generate().expect(201);
    const [request] = provider.requests;
    expect(request.input).toContain("Content pillars: Brewing; Origins");
    expect(request.input).toContain("A friendly expert who never talks down.");
    expect(request.input).toContain("3 to 8 per post");
  });

  it("validates the brief", async () => {
    await generate(owner, { topic: "" }).expect(422);
    await generate(owner, { platforms: [] }).expect(422);
    await generate(owner, { platforms: ["MYSPACE"] }).expect(422);
    await generate(owner, { goal: "WORLD_PEACE" }).expect(422);
    expect(provider.requests).toHaveLength(0);
  });
});

describe("Post versions", () => {
  it("keeps every version: regenerate, edit, refine and restore all append", async () => {
    const created = await generateOne("LINKEDIN", { tone: "FRIENDLY" });

    drafts = [postDraft("LINKEDIN", { text: "A second take on fresh coffee" })];
    const regenerated = await call(owner, "post", `${postsPath()}/${created.id}/regenerate`, {
      instructions: "Lead with the subscription",
    }).expect(201);
    expect(regenerated.body.data.post).toMatchObject({
      versionCount: 2,
      brief: { tone: "FRIENDLY", instructions: "Lead with the subscription" },
      currentVersion: {
        version: 2,
        source: "REGENERATE",
        label: "Regenerated",
        content: { text: "A second take on fresh coffee" },
      },
    });

    const edited = await call(owner, "patch", `${postsPath()}/${created.id}`, {
      baseVersion: 2,
      content: { ...postContent({ text: "  My own words  " }), title: null },
    }).expect(200);
    expect(edited.body.data.post).toMatchObject({
      versionCount: 3,
      currentVersion: {
        version: 3,
        source: "EDIT",
        label: "Edited",
        generation: null,
        content: { text: "My own words" },
      },
    });

    refined = postContent({ text: "Shorter still" });
    const shortened = await refine(owner, created.id, { action: "SHORTEN" }).expect(201);
    expect(shortened.body.data.post.currentVersion).toMatchObject({
      version: 4,
      source: "SHORTEN",
      label: "Shortened",
      content: { text: "Shorter still" },
    });

    const versions = await storedVersions(created.id);
    expect(versions.map((version) => version.source)).toEqual([
      "GENERATE",
      "REGENERATE",
      "EDIT",
      "SHORTEN",
    ]);
    expect(versions[0].content.text).toBe("LINKEDIN text about fresh coffee");

    const restored = await call(
      owner,
      "post",
      `${postsPath()}/${created.id}/versions/${versions[0]._id.toString()}/restore`,
    ).expect(200);
    expect(restored.body.data.post.currentVersion).toMatchObject({
      version: 5,
      source: "RESTORE",
      label: "Restored version 1",
      content: { text: "LINKEDIN text about fresh coffee" },
    });

    const listed = await getPost(owner, created.id).expect(200);
    expect(listed.body.data.versions).toHaveLength(5);
    expect(listed.body.data.versions[0].version).toBe(5);
    expect(listed.body.data.post.currentVersion.version).toBe(5);
  });

  it("rejects edits based on an outdated version", async () => {
    const created = await generateOne();
    await call(owner, "patch", `${postsPath()}/${created.id}`, {
      baseVersion: 1,
      content: postContent({ text: "First edit" }),
    }).expect(200);

    const stale = await call(owner, "patch", `${postsPath()}/${created.id}`, {
      baseVersion: 1,
      content: postContent({ text: "Second edit" }),
    }).expect(409);
    expect(stale.body.error.code).toBe("CONFLICT");

    const current = await getPost(owner, created.id).expect(200);
    expect(current.body.data.post.currentVersion.content.text).toBe("First edit");
  });

  it("validates edited content", async () => {
    const created = await generateOne();
    const empty = await call(owner, "patch", `${postsPath()}/${created.id}`, {
      baseVersion: 1,
      content: postContent({ text: "   " }),
    }).expect(422);
    expect((empty.body.error.details as { path: string }[]).map((d) => d.path)).toContain(
      "content.text",
    );
    await call(owner, "patch", `${postsPath()}/${created.id}`, {
      content: postContent(),
    }).expect(422);
    expect(await storedVersions(created.id)).toHaveLength(1);
  });
});

describe("Refining a post", () => {
  it("supports every action and records what was asked for", async () => {
    const created = await generateOne();

    refined = postContent({ text: "Longer text with more detail" });
    const expanded = await refine(owner, created.id, { action: "EXPAND" }).expect(201);
    expect(expanded.body.data.post.currentVersion).toMatchObject({
      source: "EXPAND",
      label: "Expanded",
    });

    refined = postContent({ text: "Playful text" });
    const retoned = await refine(owner, created.id, {
      action: "CHANGE_TONE",
      tone: "PLAYFUL",
    }).expect(201);
    expect(retoned.body.data.post.currentVersion).toMatchObject({
      source: "CHANGE_TONE",
      label: "Tone changed to Playful",
      tone: "PLAYFUL",
    });

    refined = postContent({ hashtags: ["#coffee", "#specialty"] });
    const hashtags = await refine(owner, created.id, { action: "GENERATE_HASHTAGS" }).expect(201);
    expect(hashtags.body.data.post.currentVersion).toMatchObject({
      source: "GENERATE_HASHTAGS",
      label: "Hashtags regenerated",
      content: { hashtags: ["#coffee", "#specialty"] },
    });

    // The refine prompt is given the post as it stands.
    const lastRequest = provider.requests.at(-1);
    expect(lastRequest?.schema.name).toBe("refined_post");
    expect(lastRequest?.input).toContain("Playful text");
  });

  it("removes emoji without calling the AI", async () => {
    const created = await generateOne();
    refined = postContent({ text: "Fresh beans ☕️ taste better 🎉", hook: "Hi 👋" });
    await refine(owner, created.id, { action: "ADD_EMOJIS" }).expect(201);
    const requestsAfterAdd = provider.requests.length;

    const cleaned = await refine(owner, created.id, { action: "REMOVE_EMOJIS" }).expect(201);
    expect(cleaned.body.data.post.currentVersion).toMatchObject({
      source: "REMOVE_EMOJIS",
      label: "Emojis removed",
      generation: null,
      content: { text: "Fresh beans taste better", hook: "Hi" },
    });
    expect(provider.requests).toHaveLength(requestsAfterAdd);

    const again = await refine(owner, created.id, { action: "REMOVE_EMOJIS" }).expect(400);
    expect(again.body.message).toContain("emoji");
  });

  it("validates the action", async () => {
    const created = await generateOne();
    await refine(owner, created.id, { action: "MAKE_IT_POP" }).expect(422);
    const missingTone = await refine(owner, created.id, { action: "CHANGE_TONE" }).expect(422);
    expect((missingTone.body.error.details as { path: string }[]).map((d) => d.path)).toContain(
      "tone",
    );
  });
});

describe("Listing, status and permissions", () => {
  it("lists posts with filters and paging", async () => {
    await generate().expect(201);
    await generateOne("TIKTOK");

    const all = await call(owner, "get", postsPath()).expect(200);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.meta.pagination).toMatchObject({ page: 1, total: 3, totalPages: 1 });

    const tikTok = await call(owner, "get", `${postsPath()}?platform=TIKTOK`).expect(200);
    expect(tikTok.body.data).toHaveLength(1);
    expect(tikTok.body.data[0].platform).toBe("TIKTOK");

    const paged = await call(owner, "get", `${postsPath()}?page=2&limit=2`).expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.pagination).toMatchObject({ page: 2, hasPrevPage: true });
  });

  it("moves through the review statuses", async () => {
    const created = await generateOne();
    const ready = await call(owner, "patch", `${postsPath()}/${created.id}/status`, {
      status: "READY",
    }).expect(200);
    expect(ready.body.data.post.status).toBe("READY");

    const approved = await call(owner, "patch", `${postsPath()}/${created.id}/status`, {
      status: "APPROVED",
    }).expect(200);
    expect(approved.body.data.post.status).toBe("APPROVED");

    // Publishing statuses belong to the publisher, not to people.
    await call(owner, "patch", `${postsPath()}/${created.id}/status`, {
      status: "PUBLISHED",
    }).expect(422);

    await call(owner, "patch", `${postsPath()}/${created.id}/status`, { status: "DRAFT" }).expect(
      200,
    );
    await refine(owner, created.id, { action: "SHORTEN" }).expect(201);
  });

  it("lets members read, editors write, and only authors or admins delete", async () => {
    const editor = await createUser("Eddie Editor");
    const other = await createUser("Ethan Editor");
    const viewer = await createUser("Vera Viewer");
    await addMember(owner, workspaceId, editor, "EDITOR");
    await addMember(owner, workspaceId, other, "EDITOR");
    await addMember(owner, workspaceId, viewer, "VIEWER");

    drafts = [postDraft("LINKEDIN")];
    const created = (await generate(editor, { platforms: ["LINKEDIN"] }).expect(201)).body.data
      .posts[0] as { id: string };

    await call(viewer, "get", postsPath()).expect(200);
    await getPost(viewer, created.id).expect(200);
    await generate(viewer).expect(403);
    await refine(viewer, created.id, { action: "SHORTEN" }).expect(403);
    await call(viewer, "delete", `${postsPath()}/${created.id}`).expect(403);

    await call(other, "delete", `${postsPath()}/${created.id}`).expect(403);
    await call(editor, "delete", `${postsPath()}/${created.id}`).expect(200);
    expect(await storedPosts()).toHaveLength(0);
    expect(await PostVersion.countDocuments({}).setOptions({ skipWorkspaceScope: true })).toBe(0);
  });

  it("keeps posts inside their workspace and deletes them with it", async () => {
    const created = await generateOne();
    const outsider = await createUser("Oscar Outsider");
    const otherWorkspace = (await createWorkspace(outsider)).id;

    await call(outsider, "get", `${postsPath(otherWorkspace)}/${created.id}`).expect(404);
    await call(outsider, "get", `${postsPath()}/${created.id}`).expect(404);
    await call(owner, "get", `${postsPath()}/not-an-id`).expect(422);

    const workspace = await Workspace.findById(workspaceId).orFail();
    await call(owner, "delete", `/workspaces/${workspaceId}`).expect(200);
    await call(owner, "delete", `/workspaces/${workspaceId}/permanent`, {
      confirmName: workspace.name,
    }).expect(200);
    expect(await storedPosts()).toHaveLength(0);
    expect(await PostVersion.countDocuments({}).setOptions({ skipWorkspaceScope: true })).toBe(0);
  });
});
