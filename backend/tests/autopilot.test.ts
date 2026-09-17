import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTOPILOT_RULES, type AutopilotEventTypeValue } from "../src/constants/autopilot.constant";
import { setAIProvider } from "../src/integrations/ai/registry";
import type { StructuredGenerationRequest } from "../src/integrations/ai/types";
import {
  leastRecentlyUsed,
  plannedTimes,
  timesForWeek,
} from "../src/integrations/autopilot/planner";
import { checkQuality } from "../src/integrations/autopilot/quality";
import {
  findSimilar,
  textSimilarity,
  wordSimilarity,
} from "../src/integrations/autopilot/similarity";
import { createDefaultSocialProviders } from "../src/integrations/social/providers";
import {
  setSocialProviderRegistry,
  SocialProviderRegistry,
} from "../src/integrations/social/registry";
import { AutopilotEvent } from "../src/models/autopilotEvent.model";
import { AutopilotSettings } from "../src/models/autopilotSettings.model";
import { AutopilotSlot } from "../src/models/autopilotSlot.model";
import { Post } from "../src/models/post.model";
import { PostVersion } from "../src/models/postVersion.model";
import { PublishJob } from "../src/models/publishJob.model";
import { Schedule } from "../src/models/schedule.model";
import { setPublishQueue } from "../src/queues/publish.queue";
import * as AutopilotAudit from "../src/services/autopilotAudit.service";
import { processSlot, runAutopilotSweep } from "../src/services/autopilot.service";
import { runPublishJob } from "../src/services/publishing.service";
import type { PostContent } from "../src/validators/post.validator";
import { setUserPlan } from "./helpers/billing";
import { useTestDatabase } from "./helpers/database";
import { FakeAIProvider } from "./helpers/fakeAIProvider";
import { MemoryPublishQueue } from "./helpers/memoryQueue";
import { MockSocialProvider } from "./helpers/mockSocialProvider";
import { postContent } from "./helpers/postFixture";
import { createConnectedAccount } from "./helpers/socialAccountFixture";
import { addMember, call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

const unscoped = { skipWorkspaceScope: true } as const;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const WORDS = [
  "espresso grind calibration",
  "milk steaming texture",
  "bean storage containers",
  "water hardness minerals",
  "pour over bloom timing",
  "cold brew concentrate ratios",
  "roast date freshness windows",
  "decaf processing methods",
  "burr grinder maintenance",
  "latte art pitchers",
  "single origin tasting notes",
  "home scale accuracy",
];

let counter = 0;
let provider: FakeAIProvider;
let social: MockSocialProvider;
let queue: MemoryPublishQueue;
let restore: (() => void)[] = [];
let owner: TestUser;
let workspaceId: string;
/** Overrides for the next AI responses, by schema name. */
let topicResponses: { topic: string; angle: string }[][] = [];
let draftOverrides: ((platform: string) => Partial<PostContent>)[] = [];
let onCreatePosts: (() => Promise<void>) | null = null;

const draftFor = (platform: string, overrides: Partial<PostContent> = {}) => {
  counter += 1;
  const words = WORDS[counter % WORDS.length];
  return {
    platform,
    ...postContent({
      title: platform === "YOUTUBE" ? `Guide ${counter}` : null,
      hook: `${words} changed how we work (${platform} ${counter})`,
      body: `A detailed note about ${words} for home baristas, draft ${counter}.`,
      cta: "Tell us what you would try first.",
      text: `${words} matters more than people think. Here is what we learned about ${words} after a season of testing, version ${counter} for ${platform}.\n\nTell us what you would try first.`,
      hashtags: ["#coffee"],
      ...overrides,
    }),
  };
};

const respond = (request: StructuredGenerationRequest<unknown>) => {
  if (request.schema.name === "autopilot_topics") {
    const next = topicResponses.shift();
    if (next) return { topics: next };
    counter += 1;
    return {
      topics: [
        {
          topic: `${WORDS[counter % WORDS.length]} explained ${counter}`,
          angle: "Small changes beat new gear.",
        },
      ],
    };
  }
  const platforms = (/Platforms, in order: (.+)/.exec(request.input)?.[1] ?? "LINKEDIN")
    .split(",")
    .map((item) => item.trim());
  const override = draftOverrides.shift();
  return { drafts: platforms.map((platform) => draftFor(platform, override?.(platform))) };
};

class HookedProvider extends FakeAIProvider {
  override async generateStructured<T>(request: StructuredGenerationRequest<T>) {
    if (request.schema.name === "platform_posts" && onCreatePosts) await onCreatePosts();
    return super.generateStructured(request);
  }
}

beforeEach(async () => {
  counter = 0;
  topicResponses = [];
  draftOverrides = [];
  onCreatePosts = null;
  provider = new HookedProvider(respond);
  social = new MockSocialProvider({ platform: "LINKEDIN", displayName: "LinkedIn" });
  queue = new MemoryPublishQueue();
  restore = [
    setAIProvider(provider),
    setSocialProviderRegistry(
      new SocialProviderRegistry([
        social,
        ...createDefaultSocialProviders().filter((item) => item.platform !== "LINKEDIN"),
      ]),
    ),
    setPublishQueue(queue),
  ];
  owner = await createUser("Olivia Owner");
  workspaceId = (await createWorkspace(owner)).id;
  await createConnectedAccount({ workspaceId, connectedBy: owner.id, provider: social });
});
afterEach(() => restore.forEach((undo) => undo()));

const path = (suffix = "") => `/workspaces/${workspaceId}/autopilot${suffix}`;
const workspaceOid = () => new Types.ObjectId(workspaceId);

const validSettings = (overrides: object = {}) => ({
  platforms: ["LINKEDIN"],
  postsPerWeek: 14,
  postingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"],
  postingTimes: ["09:00", "15:00"],
  pillars: ["Brewing", "Sourcing"],
  formats: ["TIPS", "HOW_TO"],
  approvalRequired: true,
  maxPostsPerDay: 3,
  ...overrides,
});

const configure = async (overrides: object = {}) => {
  // Most tests want every posting time used, which is above the Free plan.
  await setUserPlan(owner.id, "AGENCY");
  await call(owner, "put", path("/settings"), validSettings(overrides)).expect(200);
  await call(owner, "post", path("/start")).expect(200);
};

const events = (type?: AutopilotEventTypeValue) =>
  AutopilotEvent.find({ workspace: workspaceOid(), ...(type ? { type } : {}) }).sort({
    createdAt: 1,
  });
const autopilotPosts = () =>
  Post.find({ workspace: workspaceOid(), "autopilot.slot": { $exists: true } }).sort({
    createdAt: 1,
  });
const plannedSlots = () =>
  AutopilotSlot.find({ workspace: workspaceOid(), status: "PLANNED" }).sort({ scheduledAt: 1 });
const slotById = (id: Types.ObjectId) =>
  AutopilotSlot.findOne({ _id: id, workspace: workspaceOid() }).orFail();
const settingsDoc = () => AutopilotSettings.findOne({ workspace: workspaceOid() }).orFail();

/** An earlier published post, so repeats have something to match. */
const seedExistingPost = async (topic: string, content: Partial<PostContent>) => {
  const post = await Post.create({
    workspace: workspaceOid(),
    platform: "LINKEDIN",
    status: "PUBLISHED",
    publishedAt: new Date(Date.now() - 5 * DAY_MS),
    brief: { topic },
    versionCount: 1,
    createdBy: new Types.ObjectId(owner.id),
  });
  const version = await PostVersion.create({
    workspace: workspaceOid(),
    post: post._id,
    version: 1,
    content: postContent(content),
    source: "CREATE",
    label: "Created",
    createdBy: new Types.ObjectId(owner.id),
  });
  await Post.updateOne({ _id: post._id }, { currentVersion: version._id }).setOptions(unscoped);
};

// ── Pure logic ─────────────────────────────────────────────

describe("Planning posting times", () => {
  const input = {
    postingDays: ["TUESDAY", "THURSDAY"] as const,
    postingTimes: ["17:00", "09:00"],
    postsPerWeek: 2,
    timeZone: "UTC",
  };

  it("spreads posts across the week instead of stacking them on the first day", () => {
    const times = timesForWeek("2026-09-14", { ...input, postingDays: [...input.postingDays] });
    expect(times.map((time) => time.scheduledAt.toISOString())).toEqual([
      "2026-09-15T09:00:00.000Z",
      "2026-09-17T09:00:00.000Z",
    ]);
  });

  it("uses the workspace clock, including across a daylight saving change", () => {
    const times = plannedTimes(
      {
        postingDays: ["SUNDAY", "MONDAY"],
        postingTimes: ["09:00"],
        postsPerWeek: 2,
        timeZone: "America/New_York",
      },
      new Date("2026-10-30T00:00:00Z"),
      new Date("2026-11-03T00:00:00Z"),
    );
    // 09:00 is EDT (UTC-4) on Sunday 1 November before 02:00... and EST (UTC-5) after.
    expect(times.map((time) => time.scheduledAt.toISOString())).toEqual([
      "2026-11-01T14:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
    ]);
  });

  it("rotates to whatever was used least recently", () => {
    expect(leastRecentlyUsed(["A", "B", "C"], ["A", "B"])).toBe("C");
    expect(leastRecentlyUsed(["A", "B"], ["A", "B", "A"])).toBe("B");
    expect(leastRecentlyUsed([], ["A"])).toBeNull();
  });
});

describe("Repeat and quality checks", () => {
  it("scores reworded topics as repeats but different subjects as new", () => {
    expect(wordSimilarity("Why fresh beans matter", "Why do fresh beans matter?")).toBe(1);
    expect(wordSimilarity("Grinding beans at home", "Cold brew ratios")).toBe(0);
    expect(
      findSimilar("How to store coffee beans", ["Storing your coffee beans"], 0.6),
    ).not.toBeNull();
    expect(
      textSimilarity(
        "Fresh beans taste better because the oils are still there after roasting",
        "Fresh beans taste better because the oils are still there after roasting. Try it.",
      ),
    ).toBeGreaterThan(0.7);
  });

  it("blocks unusable drafts and flags ones a person should check", () => {
    const short = checkQuality("LINKEDIN", postContent({ text: "Too short." }));
    expect(short.blocking.length).toBeGreaterThan(0);

    const placeholder = checkQuality(
      "FACEBOOK",
      postContent({
        text: "Our new roast is out now and it's the best one yet. Shop it here [link]",
      }),
    );
    expect(placeholder.blocking).toEqual([]);
    expect(placeholder.review[0]).toContain("[link]");
  });
});

// ── Settings and permissions ───────────────────────────────

describe("Autopilot settings", () => {
  it("rejects more posts a week than the posting days and times allow", async () => {
    const res = await call(
      owner,
      "put",
      path("/settings"),
      validSettings({ postingDays: ["MONDAY"], postingTimes: ["09:00"], postsPerWeek: 2 }),
    ).expect(422);
    expect(JSON.stringify(res.body)).toContain("posting slots a week");
  });

  it("enforces the workspace plan", async () => {
    await setUserPlan(owner.id, "FREE");
    const tooMany = await call(
      owner,
      "put",
      path("/settings"),
      validSettings({ postsPerWeek: 5 }),
    ).expect(403);
    expect(tooMany.body.error?.code ?? tooMany.body.code).toBe("PLAN_LIMIT_REACHED");
    await call(
      owner,
      "put",
      path("/settings"),
      validSettings({ platforms: ["LINKEDIN", "FACEBOOK", "INSTAGRAM"] }),
    ).expect(403);

    await setUserPlan(owner.id, "PRO");
    await call(owner, "put", path("/settings"), validSettings({ postsPerWeek: 5 })).expect(200);
    await call(owner, "post", path("/start")).expect(200);

    // A downgrade after setup: Autopilot won't start again above the new limit.
    await call(owner, "post", path("/pause")).expect(200);
    await setUserPlan(owner.id, "FREE");
    const blocked = await call(owner, "post", path("/start")).expect(400);
    expect(blocked.body.message ?? JSON.stringify(blocked.body)).toContain("Free plan");
  });

  it("lets editors pause but only admins change settings or start it", async () => {
    const editor = await createUser("Eda Editor");
    const viewer = await createUser("Vic Viewer");
    await addMember(owner, workspaceId, editor, "EDITOR");
    await addMember(owner, workspaceId, viewer, "VIEWER");
    await configure();

    await call(editor, "put", path("/settings"), validSettings()).expect(403);
    await call(editor, "post", path("/start")).expect(403);
    await call(viewer, "post", path("/pause")).expect(403);
    await call(viewer, "get", path()).expect(200);
    await call(editor, "post", path("/pause"), { reason: "Launch week" }).expect(200);

    const settings = await settingsDoc();
    expect(settings.status).toBe("PAUSED");
    expect(settings.pausedBy?.toString()).toBe(editor.id);
  });

  it("records settings changes with before and after values and replans", async () => {
    await configure();
    expect((await plannedSlots()).length).toBeGreaterThan(0);

    await call(
      owner,
      "put",
      path("/settings"),
      validSettings({ postingTimes: ["11:00"], postsPerWeek: 7 }),
    ).expect(200);
    const changed = (await events("SETTINGS_UPDATED")).at(-1)!;
    expect(changed.actor?.toString()).toBe(owner.id);
    expect(changed.details).toEqual({
      changes: {
        postingTimes: { from: ["09:00", "15:00"], to: ["11:00"] },
        postsPerWeek: { from: 14, to: 7 },
      },
    });
    expect(await events("SLOTS_CLEARED")).toHaveLength(1);
    const slots = await plannedSlots();
    expect(slots.every((slot) => slot.scheduledAt.toISOString().endsWith("T11:00:00.000Z"))).toBe(
      true,
    );
  });
});

// ── The pipeline ───────────────────────────────────────────

describe("Approval on", () => {
  it("writes posts, holds them for approval, and schedules only when approved", async () => {
    await configure({ approvalRequired: true });
    const { processed } = await runAutopilotSweep();
    expect(processed).toBe(AUTOPILOT_RULES.maxSlotsPerSweep);

    const posts = await autopilotPosts();
    expect(posts).toHaveLength(2);
    expect(posts.every((post) => post.status === "READY")).toBe(true);
    expect(posts[0].autopilot?.heldReason).toBe("APPROVAL_REQUIRED");
    expect(posts[0].pillar).toBe("Brewing");
    expect(posts[1].pillar).toBe("Sourcing");
    expect(queue.added).toHaveLength(0);

    const types = (await events()).map((event) => event.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "STARTED",
        "SLOTS_PLANNED",
        "TOPIC_SELECTED",
        "CONTENT_GENERATED",
        "HELD_FOR_REVIEW",
      ]),
    );

    const overview = (await call(owner, "get", path()).expect(200)).body.data;
    expect(overview.queue).toHaveLength(2);

    const postId = posts[0]._id.toString();
    await call(owner, "post", path(`/posts/${postId}/approve`), {}).expect(200);
    const approved = await Post.findById(postId).setOptions(unscoped).orFail();
    expect(approved.status).toBe("SCHEDULED");
    expect(approved.autopilot?.approvedBy?.toString()).toBe(owner.id);
    expect(queue.added).toHaveLength(1);
    const [approval] = await events("APPROVED");
    expect(approval.actor?.toString()).toBe(owner.id);
  });

  it("rejecting moves the post to drafts and records who did it", async () => {
    await configure();
    await runAutopilotSweep();
    const [post] = await autopilotPosts();
    await call(owner, "post", path(`/posts/${post._id}/reject`), { reason: "Off brand" }).expect(
      200,
    );

    const rejected = await Post.findById(post._id).setOptions(unscoped).orFail();
    expect(rejected).toMatchObject({ status: "DRAFT", scheduledAt: null });
    const [event] = await events("REJECTED");
    expect(event.message).toContain("Off brand");
  });

  it("marks approvals whose time passed and requires a new time", async () => {
    await configure();
    await runAutopilotSweep();
    const [post] = await autopilotPosts();
    await Post.updateOne(
      { _id: post._id },
      { scheduledAt: new Date(Date.now() - HOUR_MS) },
    ).setOptions(unscoped);

    await runAutopilotSweep();
    const expired = await Post.findById(post._id).setOptions(unscoped).orFail();
    expect(expired.autopilot?.heldReason).toBe("EXPIRED");
    expect(await events("APPROVAL_EXPIRED")).toHaveLength(1);

    await call(owner, "post", path(`/posts/${post._id}/approve`), {}).expect(400);
    await call(owner, "post", path(`/posts/${post._id}/approve`), {
      scheduledAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
    }).expect(200);
  });
});

describe("Approval off", () => {
  it("validates and schedules text posts, but holds platforms that need media", async () => {
    await configure({
      approvalRequired: false,
      platforms: ["LINKEDIN", "INSTAGRAM"],
      maxPostsPerDay: 3,
    });
    // With approval off, only slots within a day are written.
    await runAutopilotSweep({ now: new Date() });
    const posts = await autopilotPosts();
    const linkedin = posts.filter((post) => post.platform === "LINKEDIN");
    const instagram = posts.filter((post) => post.platform === "INSTAGRAM");
    expect(linkedin.length).toBeGreaterThan(0);
    expect(linkedin.every((post) => post.status === "SCHEDULED")).toBe(true);
    expect(instagram.every((post) => post.autopilot?.heldReason === "NEEDS_MEDIA")).toBe(true);
    expect(queue.added).toHaveLength(linkedin.length);
    expect(await events("SCHEDULED")).toHaveLength(linkedin.length);
  });

  it("holds a post with a placeholder for review instead of publishing it", async () => {
    await configure({ approvalRequired: false });
    draftOverrides = [
      () => ({
        text: "Our spring roast is out and it tastes like cherries and cocoa. Get yours at [link]",
      }),
    ];
    await runAutopilotSweep();
    const [post] = await autopilotPosts();
    expect(post.status).toBe("READY");
    expect(post.autopilot?.heldReason).toBe("QUALITY_REVIEW");
    expect(post.autopilot?.heldMessage).toContain("[link]");
  });
});

describe("Safeguards", () => {
  it("rejects a topic that repeats an earlier post and uses the next candidate", async () => {
    await seedExistingPost("Why fresh beans matter", {});
    await configure();
    topicResponses = [
      [
        { topic: "Why do fresh beans matter?", angle: "Freshness." },
        { topic: "Choosing a burr grinder", angle: "Consistency beats speed." },
      ],
    ];
    await runAutopilotSweep();

    const [duplicate] = await events("DUPLICATE_REJECTED");
    expect(duplicate.details).toMatchObject({ kind: "topic", match: "Why fresh beans matter" });
    const slot = await AutopilotSlot.findOne({ workspace: workspaceOid(), status: "GENERATED" })
      .sort({ scheduledAt: 1 })
      .orFail();
    expect(slot.topic).toBe("Choosing a burr grinder");
  });

  it("fails the slot and retries later when every topic is a repeat", async () => {
    await seedExistingPost("Why fresh beans matter", {});
    await configure();
    const repeat = [{ topic: "Why fresh beans matter", angle: "Again." }];
    topicResponses = [repeat, repeat];
    const [slot] = await plannedSlots();
    const now = new Date();

    expect(await processSlot(slot, now)).toBe("failed");
    const failed = await slotById(slot._id);
    expect(failed).toMatchObject({ status: "PLANNED", attempts: 1 });
    expect(failed.lastError?.code).toBe("DUPLICATE_TOPIC");
    expect(failed.nextAttemptAt?.getTime()).toBe(
      now.getTime() + AUTOPILOT_RULES.generationRetryBaseMs,
    );
    expect(await autopilotPosts()).toHaveLength(0);
  });

  it("rewrites a draft whose hook repeats an earlier one", async () => {
    await seedExistingPost("Something else entirely", {
      hook: "Your grinder matters more than your machine.",
    });
    await configure();
    draftOverrides = [() => ({ hook: "Your grinder matters more than your machine!" })];
    const [slot] = await plannedSlots();
    await processSlot(slot);

    const [duplicate] = await events("DUPLICATE_REJECTED");
    expect(duplicate.details).toMatchObject({ kind: "hook", round: 1 });
    const createRequests = provider.requests.filter(
      (request) => request.schema.name === "platform_posts",
    );
    expect(createRequests).toHaveLength(2);
    expect(createRequests[1].input).toContain("Your grinder matters more than your machine!");
    const [post] = await autopilotPosts();
    const version = await PostVersion.findById(post.currentVersion).setOptions(unscoped).orFail();
    expect(version.content.hook).not.toContain("Your grinder matters");
  });

  it("rejects a post that copies an earlier post on the same platform", async () => {
    const copied =
      "Espresso grind calibration matters more than people think and a small change fixes sour shots every single morning at home.";
    await seedExistingPost("Old espresso post", { text: copied });
    await configure();
    draftOverrides = [() => ({ text: copied }), () => ({ text: copied })];
    const [slot] = await plannedSlots();
    expect(await processSlot(slot)).toBe("failed");
    const kinds = (await events("DUPLICATE_REJECTED")).map((event) => event.details?.kind);
    expect(kinds).toEqual(["post", "post"]);
    expect((await slotById(slot._id)).lastError?.code).toBe("NO_USABLE_DRAFTS");
  });

  it("skips a slot when the day's publishing limit is already reached", async () => {
    await configure({ maxPostsPerDay: 1 });
    const [slot] = await plannedSlots();
    await Post.create({
      workspace: workspaceOid(),
      platform: "FACEBOOK",
      status: "SCHEDULED",
      scheduledAt: slot.scheduledAt,
      brief: { topic: "Manual post" },
      createdBy: new Types.ObjectId(owner.id),
    });

    expect(await processSlot(slot)).toBe("skipped");
    expect((await slotById(slot._id)).status).toBe("SKIPPED");
    const [skipped] = await events("SLOT_SKIPPED");
    expect(skipped.details).toMatchObject({ code: "DAILY_LIMIT" });
  });

  it("skips slots beyond the weekly plan limit", async () => {
    await configure({ postsPerWeek: 3 });
    const slots = await plannedSlots();
    const target = slots[slots.length - 1];
    await AutopilotSlot.create(
      [1, 2, 3].map((index) => ({
        workspace: workspaceOid(),
        scheduledAt: new Date(target.scheduledAt.getTime() - index * 60_000),
        localDay: target.localDay,
        weekStart: target.weekStart,
        status: "GENERATED" as const,
      })),
    );
    expect(await processSlot(target)).toBe("skipped");
    const [skipped] = await events("SLOT_SKIPPED");
    expect(skipped.details).toMatchObject({ code: "WEEKLY_LIMIT" });
  });

  it("retries failed generation with backoff and pauses itself after repeated failures", async () => {
    await configure({ postsPerWeek: 3 });
    provider.failWith = new Error("AI is down");
    const slots = await plannedSlots();

    for (const slot of slots.slice(0, 3)) {
      expect(await processSlot(slot)).toBe("failed");
    }
    const settings = await settingsDoc();
    expect(settings.status).toBe("PAUSED");
    expect(settings.pausedBy).toBeNull();
    expect(settings.pauseReason).toContain("Writing failed 3 times");
    expect(await events("GENERATION_FAILED")).toHaveLength(3);
    expect(await events("AUTO_PAUSED")).toHaveLength(1);

    const overview = (await call(owner, "get", path()).expect(200)).body.data;
    expect(overview.settings.pausedBySystem).toBe(true);
  });

  it("pauses itself after repeated publishing failures", async () => {
    await configure();
    await runAutopilotSweep();
    const [post] = await autopilotPosts();
    for (let index = 0; index < AUTOPILOT_RULES.autoPauseAfterPublishFailures; index += 1) {
      await AutopilotAudit.onPublishFailed(
        post._id,
        { code: "PROVIDER_ERROR", message: "LinkedIn is down" },
        false,
      );
    }
    expect((await settingsDoc()).status).toBe("PAUSED");
    expect(await events("PUBLISH_FAILED")).toHaveLength(3);
  });
});

describe("Pausing", () => {
  it("takes Autopilot's scheduled posts off the queue immediately", async () => {
    await configure({ approvalRequired: false });
    await runAutopilotSweep();
    const scheduled = (await autopilotPosts()).filter((post) => post.status === "SCHEDULED");
    expect(scheduled.length).toBeGreaterThan(0);

    await call(owner, "post", path("/pause"), {}).expect(200);
    for (const post of scheduled) {
      const reloaded = await Post.findById(post._id).setOptions(unscoped).orFail();
      expect(reloaded.status).toBe("READY");
      expect(reloaded.autopilot?.heldReason).toBe("PAUSED");
      expect(
        await Schedule.exists({ post: post._id, isLive: true }).setOptions(unscoped),
      ).toBeNull();
    }
    expect(queue.added).toHaveLength(0);
    expect(await events("UNSCHEDULED")).toHaveLength(scheduled.length);

    // Nothing is written while paused.
    const before = provider.requests.length;
    await runAutopilotSweep();
    expect(provider.requests.length).toBe(before);
  });

  it("stops a publish that was already queued when the worker reaches it", async () => {
    await configure({ approvalRequired: false });
    await runAutopilotSweep();
    const post = (await autopilotPosts()).find((item) => item.status === "SCHEDULED");
    expect(post).toBeDefined();
    const job = await PublishJob.findOne({ post: post!._id }).setOptions(unscoped).orFail();

    // Simulates the pause landing between cleanup and the worker picking up the job.
    await AutopilotSettings.updateOne({ workspace: workspaceOid() }, { status: "PAUSED" });
    const outcome = await runPublishJob({ publishJobId: job._id.toString() });

    expect(outcome).toEqual({ outcome: "skipped", reason: "autopilot-paused" });
    expect(social.publishedInputs).toHaveLength(0);
    expect(await events("PUBLISH_BLOCKED")).toHaveLength(1);
  });

  it("still publishes posts a person approved", async () => {
    await configure();
    await runAutopilotSweep();
    const [post] = await autopilotPosts();
    await call(owner, "post", path(`/posts/${post._id}/approve`), {}).expect(200);
    await call(owner, "post", path("/pause"), {}).expect(200);

    const job = await PublishJob.findOne({ post: post._id }).setOptions(unscoped).orFail();
    const outcome = await runPublishJob({ publishJobId: job._id.toString() });
    expect(outcome.outcome).toBe("published");
    expect(await events("PUBLISHED")).toHaveLength(1);
  });

  it("throws away writing that finishes after a pause", async () => {
    await configure();
    onCreatePosts = async () => {
      await AutopilotSettings.updateOne({ workspace: workspaceOid() }, { status: "PAUSED" });
    };
    const [slot] = await plannedSlots();
    expect(await processSlot(slot)).toBe("released");
    expect(await autopilotPosts()).toHaveLength(0);
    expect(await events("GENERATION_DISCARDED")).toHaveLength(1);
    expect((await slotById(slot._id)).status).toBe("PLANNED");
  });
});

describe("Audit trail", () => {
  it("is append-only and readable by any member", async () => {
    await configure();
    await runAutopilotSweep();
    await expect(
      AutopilotEvent.updateOne({ workspace: workspaceOid() }, { message: "edited" }),
    ).rejects.toThrow("append-only");

    const viewer = await createUser("Vic Viewer");
    await addMember(owner, workspaceId, viewer, "VIEWER");
    const page = (await call(viewer, "get", path("/events?limit=2")).expect(200)).body.data;
    expect(page.events).toHaveLength(2);
    expect(page.nextBefore).not.toBeNull();

    const started = (await call(viewer, "get", path("/events?type=STARTED")).expect(200)).body.data;
    expect(started.events[0].actor.name).toBe("Olivia Owner");
  });
});
