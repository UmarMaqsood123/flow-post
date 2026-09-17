import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAIProvider } from "../src/integrations/ai/registry";
import { createDefaultSocialProviders } from "../src/integrations/social/providers";
import {
  setSocialProviderRegistry,
  SocialProviderRegistry,
} from "../src/integrations/social/registry";
import { Post } from "../src/models/post.model";
import { PostVersion } from "../src/models/postVersion.model";
import { setPublishQueue } from "../src/queues/publish.queue";
import { useTestDatabase } from "./helpers/database";
import { FakeAIProvider } from "./helpers/fakeAIProvider";
import { MemoryPublishQueue } from "./helpers/memoryQueue";
import { MockSocialProvider } from "./helpers/mockSocialProvider";
import { postContent } from "./helpers/postFixture";
import { createConnectedAccount } from "./helpers/socialAccountFixture";
import { addMember, call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

let restoreProvider: () => void;
let restoreRegistry: () => void;
let restoreQueue: () => void;
let owner: TestUser;
let workspaceId: string;

const DAY_MS = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

beforeEach(async () => {
  restoreProvider = setAIProvider(new FakeAIProvider(() => ({ drafts: [] })));
  // Scheduling an approved post queues a real publish, so the calendar tests need
  // a platform that can publish and an account to publish with.
  const social = new MockSocialProvider({ platform: "LINKEDIN", displayName: "LinkedIn" });
  restoreRegistry = setSocialProviderRegistry(
    new SocialProviderRegistry([
      social,
      ...createDefaultSocialProviders().filter((item) => item.platform !== "LINKEDIN"),
    ]),
  );
  restoreQueue = setPublishQueue(new MemoryPublishQueue());
  owner = await createUser("Olivia Owner");
  workspaceId = (await createWorkspace(owner)).id;
  await createConnectedAccount({ workspaceId, connectedBy: owner.id, provider: social });
});
afterEach(() => {
  restoreProvider();
  restoreRegistry();
  restoreQueue();
});

const postsPath = (id = workspaceId) => `/workspaces/${id}/posts`;
const calendarPath = (query: string) => `${postsPath()}/calendar?${query}`;

interface CreatedPost {
  id: string;
  status: string;
  scheduledAt: string | null;
  pillar: string | null;
}

const createPost = async (body: object = {}, user: TestUser = owner) => {
  const res = await call(user, "post", postsPath(), {
    platform: "LINKEDIN",
    topic: "Why fresh beans matter",
    ...body,
  }).expect(201);
  return res.body.data.post as CreatedPost;
};

const schedule = (
  postId: string,
  scheduledAt: string | null,
  user: TestUser = owner,
  publish = false,
) => call(user, "patch", `${postsPath()}/${postId}/schedule`, { scheduledAt, publish });

const range = (fromMs: number, toMs: number) =>
  `from=${encodeURIComponent(iso(fromMs))}&to=${encodeURIComponent(iso(toMs))}`;

const storedPost = (postId: string) =>
  Post.findById(postId).setOptions({ skipWorkspaceScope: true }).lean();

describe("Creating posts from the calendar", () => {
  it("creates an idea with its topic as the first version", async () => {
    const post = await createPost({ status: "IDEA", pillar: "Brewing" });

    expect(post).toMatchObject({ status: "IDEA", pillar: "Brewing", scheduledAt: null });
    const detail = await call(owner, "get", `${postsPath()}/${post.id}`).expect(200);
    expect(detail.body.data.post.currentVersion).toMatchObject({
      version: 1,
      source: "CREATE",
      label: "Created",
      generation: null,
      content: { text: "Why fresh beans matter" },
    });
  });

  it("accepts ready-made content and a slot", async () => {
    const at = iso(2 * DAY_MS);
    const post = await createPost({
      status: "DRAFT",
      scheduledAt: at,
      content: postContent({ text: "Written elsewhere" }),
    });

    expect(post.scheduledAt).toBe(new Date(at).toISOString());
    const stored = await storedPost(post.id);
    expect(stored?.scheduledAt).toEqual(new Date(at));
  });

  it("stores the same instant whatever offset the client sends", async () => {
    // 09:00 in Berlin (+02:00) is the same moment as 07:00 UTC.
    const berlin = await createPost({ scheduledAt: "2027-06-15T09:00:00+02:00" });
    const utc = await createPost({ scheduledAt: "2027-06-15T07:00:00Z" });

    expect(berlin.scheduledAt).toBe("2027-06-15T07:00:00.000Z");
    expect(berlin.scheduledAt).toBe(utc.scheduledAt);
    expect((await storedPost(berlin.id))?.scheduledAt).toEqual(
      (await storedPost(utc.id))?.scheduledAt,
    );
  });

  it("validates the request", async () => {
    await call(owner, "post", postsPath(), { platform: "LINKEDIN" }).expect(422);
    await call(owner, "post", postsPath(), { platform: "MYSPACE", topic: "x" }).expect(422);
    await createPostExpecting({ status: "PUBLISHED" }, 422);
    // A time without an offset is ambiguous, so it's refused.
    await createPostExpecting({ scheduledAt: "2027-06-15T09:00:00" }, 422);
  });
});

const createPostExpecting = (body: object, status: number) =>
  call(owner, "post", postsPath(), {
    platform: "LINKEDIN",
    topic: "Why fresh beans matter",
    ...body,
  }).expect(status);

describe("Scheduling", () => {
  it("schedules, reschedules and unschedules an approved post", async () => {
    const post = await createPost({ status: "APPROVED", content: postContent() });

    const scheduled = await schedule(post.id, iso(DAY_MS)).expect(200);
    expect(scheduled.body.data.post).toMatchObject({ status: "SCHEDULED" });

    const later = iso(3 * DAY_MS);
    const moved = await schedule(post.id, later).expect(200);
    expect(moved.body.data.post).toMatchObject({
      status: "SCHEDULED",
      scheduledAt: new Date(later).toISOString(),
    });

    const cleared = await schedule(post.id, null).expect(200);
    expect(cleared.body.data.post).toMatchObject({ status: "APPROVED", scheduledAt: null });
  });

  it("won't queue a post in the past, but ideas can hold any slot", async () => {
    const approved = await createPost({ status: "APPROVED", content: postContent() });
    const past = await schedule(approved.id, iso(-2 * DAY_MS)).expect(400);
    expect(past.body.message).toContain("future");
    expect((await storedPost(approved.id))?.scheduledAt).toBeNull();

    const idea = await createPost({ status: "IDEA" });
    const planned = await schedule(idea.id, iso(-2 * DAY_MS)).expect(200);
    expect(planned.body.data.post).toMatchObject({ status: "IDEA" });
  });

  it("moves a draft on when the user presses Schedule", async () => {
    const draft = await createPost({ status: "DRAFT", content: postContent() });

    const res = await schedule(draft.id, iso(DAY_MS), owner, true).expect(200);

    expect(res.body.data.post).toMatchObject({ status: "SCHEDULED" });
    expect(res.body.message).toBe("Post scheduled");
  });

  it("says so when a date only moves a post, without queueing it", async () => {
    const idea = await createPost({ status: "IDEA", content: postContent() });

    const res = await schedule(idea.id, iso(DAY_MS)).expect(200);

    expect(res.body.data.post).toMatchObject({ status: "IDEA" });
    expect(res.body.message).toContain("won't publish");
  });

  it("won't queue a draft for the past, even on Schedule", async () => {
    const draft = await createPost({ status: "DRAFT", content: postContent() });

    const res = await schedule(draft.id, iso(-2 * DAY_MS), owner, true).expect(400);

    expect(res.body.message).toContain("future");
    expect((await storedPost(draft.id))?.status).toBe("DRAFT");
  });

  it("validates the time", async () => {
    const post = await createPost();
    await schedule(post.id, "next tuesday").expect(422);
    await call(owner, "patch", `${postsPath()}/${post.id}/schedule`, {}).expect(422);
  });
});

describe("Calendar range", () => {
  const seed = async () => {
    const soon = await createPost({
      status: "APPROVED",
      pillar: "Brewing",
      content: postContent(),
    });
    await schedule(soon.id, iso(DAY_MS)).expect(200);

    // TikTok can't publish yet, so it holds a calendar slot as an idea.
    const later = await createPost({
      platform: "TIKTOK",
      status: "IDEA",
      pillar: "Origins",
      content: postContent(),
    });
    await schedule(later.id, iso(10 * DAY_MS)).expect(200);

    const backlog = await createPost({ platform: "INSTAGRAM", status: "IDEA", pillar: "Brewing" });
    return { soon, later, backlog };
  };

  it("returns posts inside the range and the unscheduled backlog", async () => {
    const { soon, later, backlog } = await seed();

    const res = await call(owner, "get", calendarPath(range(0, 7 * DAY_MS))).expect(200);
    const { items, unscheduled } = res.body.data as {
      items: { id: string; preview: string; topic: string; status: string }[];
      unscheduled: { id: string }[];
    };
    expect(items.map((item) => item.id)).toEqual([soon.id]);
    expect(items[0]).toMatchObject({ status: "SCHEDULED", topic: "Why fresh beans matter" });
    expect(items[0].preview.length).toBeGreaterThan(0);
    expect(unscheduled.map((item) => item.id)).toEqual([backlog.id]);

    const wider = await call(owner, "get", calendarPath(range(0, 14 * DAY_MS))).expect(200);
    expect((wider.body.data.items as { id: string }[]).map((item) => item.id)).toEqual([
      soon.id,
      later.id,
    ]);

    const withoutBacklog = await call(
      owner,
      "get",
      `${calendarPath(range(0, 14 * DAY_MS))}&includeUnscheduled=false`,
    ).expect(200);
    expect(withoutBacklog.body.data.unscheduled).toEqual([]);
  });

  it("filters by platform, status and pillar", async () => {
    const { soon, later, backlog } = await seed();
    const window = range(-DAY_MS, 14 * DAY_MS);

    const tikTok = await call(owner, "get", `${calendarPath(window)}&platform=TIKTOK`).expect(200);
    expect((tikTok.body.data.items as { id: string }[]).map((item) => item.id)).toEqual([later.id]);

    const both = await call(
      owner,
      "get",
      `${calendarPath(window)}&platform=TIKTOK,LINKEDIN`,
    ).expect(200);
    expect(both.body.data.items).toHaveLength(2);

    const scheduled = await call(owner, "get", `${calendarPath(window)}&status=SCHEDULED`).expect(
      200,
    );
    // Only the approved LinkedIn post is queued; the TikTok idea just holds its slot.
    expect((scheduled.body.data.items as { id: string }[]).map((item) => item.id)).toEqual([
      soon.id,
    ]);
    expect(scheduled.body.data.unscheduled).toEqual([]);
    expect(later.status).toBe("IDEA");

    const brewing = await call(owner, "get", `${calendarPath(window)}&pillar=Brewing`).expect(200);
    expect((brewing.body.data.items as { id: string }[]).map((item) => item.id)).toEqual([soon.id]);
    expect((brewing.body.data.unscheduled as { id: string }[]).map((item) => item.id)).toEqual([
      backlog.id,
    ]);

    await call(owner, "get", `${calendarPath(window)}&platform=MYSPACE`).expect(422);
  });

  it("validates the range", async () => {
    await call(owner, "get", calendarPath(range(7 * DAY_MS, 0))).expect(422);
    await call(owner, "get", calendarPath(range(0, 200 * DAY_MS))).expect(422);
    await call(owner, "get", `${postsPath()}/calendar`).expect(422);
  });
});

describe("Duplicating and editing details", () => {
  it("duplicates a post as an unscheduled draft with its own history", async () => {
    const post = await createPost({
      status: "APPROVED",
      pillar: "Brewing",
      content: postContent({ text: "The original words" }),
    });
    await schedule(post.id, iso(DAY_MS)).expect(200);

    const res = await call(owner, "post", `${postsPath()}/${post.id}/duplicate`).expect(201);
    const copy = res.body.data.post as { id: string; status: string; scheduledAt: string | null };
    expect(copy).toMatchObject({ status: "DRAFT", scheduledAt: null });
    expect(copy.id).not.toBe(post.id);

    const detail = await call(owner, "get", `${postsPath()}/${copy.id}`).expect(200);
    expect(detail.body.data.post).toMatchObject({
      pillar: "Brewing",
      versionCount: 1,
      currentVersion: { source: "DUPLICATE", content: { text: "The original words" } },
    });
    expect(detail.body.data.versions).toHaveLength(1);

    const original = await call(owner, "get", `${postsPath()}/${post.id}`).expect(200);
    expect(original.body.data.post).toMatchObject({ status: "SCHEDULED" });
  });

  it("edits the topic and pillar", async () => {
    const post = await createPost({ pillar: "Brewing" });

    const updated = await call(owner, "patch", `${postsPath()}/${post.id}/details`, {
      topic: "Grind size explained",
      pillar: null,
    }).expect(200);
    expect(updated.body.data.post).toMatchObject({
      pillar: null,
      brief: { topic: "Grind size explained" },
    });

    await call(owner, "patch", `${postsPath()}/${post.id}/details`, {}).expect(422);
    await call(owner, "patch", `${postsPath()}/${post.id}/details`, { topic: "" }).expect(422);
  });
});

describe("Status rules", () => {
  it("only accepts statuses a person owns", async () => {
    const post = await createPost();
    for (const status of ["IDEA", "DRAFT", "READY", "APPROVED"]) {
      const res = await call(owner, "patch", `${postsPath()}/${post.id}/status`, { status }).expect(
        200,
      );
      expect(res.body.data.post.status).toBe(status);
    }
    await call(owner, "patch", `${postsPath()}/${post.id}/status`, { status: "PUBLISHING" }).expect(
      422,
    );
    await call(owner, "patch", `${postsPath()}/${post.id}/status`, { status: "PUBLISHED" }).expect(
      422,
    );
  });

  it("locks published posts but still allows duplicating them", async () => {
    const post = await createPost({ content: postContent() });
    await Post.updateOne(
      { _id: post.id },
      { $set: { status: "PUBLISHED", publishedAt: new Date() } },
    )
      .setOptions({ skipWorkspaceScope: true })
      .exec();

    const edit = await call(owner, "patch", `${postsPath()}/${post.id}`, {
      baseVersion: 1,
      content: postContent({ text: "Sneaky edit" }),
    }).expect(409);
    expect(edit.body.message).toContain("published");
    await call(owner, "post", `${postsPath()}/${post.id}/refine`, { action: "SHORTEN" }).expect(
      409,
    );
    await schedule(post.id, iso(DAY_MS)).expect(409);
    await call(owner, "patch", `${postsPath()}/${post.id}/details`, { topic: "New" }).expect(409);
    await call(owner, "patch", `${postsPath()}/${post.id}/status`, { status: "DRAFT" }).expect(409);

    await call(owner, "post", `${postsPath()}/${post.id}/duplicate`).expect(201);
  });
});

describe("Calendar permissions and isolation", () => {
  it("lets members read the calendar and editors change it", async () => {
    const editor = await createUser("Eddie Editor");
    const viewer = await createUser("Vera Viewer");
    await addMember(owner, workspaceId, editor, "EDITOR");
    await addMember(owner, workspaceId, viewer, "VIEWER");

    const post = await createPost({}, editor);
    await call(viewer, "get", calendarPath(range(-DAY_MS, DAY_MS))).expect(200);
    await call(viewer, "post", postsPath(), { platform: "LINKEDIN", topic: "Nope" }).expect(403);
    await schedule(post.id, iso(DAY_MS), viewer).expect(403);
    await call(viewer, "post", `${postsPath()}/${post.id}/duplicate`).expect(403);
    await call(viewer, "patch", `${postsPath()}/${post.id}/details`, { topic: "Nope" }).expect(403);
  });

  it("keeps another workspace's posts off the calendar", async () => {
    const post = await createPost({ status: "APPROVED", content: postContent() });
    await schedule(post.id, iso(DAY_MS)).expect(200);

    const outsider = await createUser("Oscar Outsider");
    const otherWorkspace = (await createWorkspace(outsider)).id;
    const res = await call(
      outsider,
      "get",
      `${postsPath(otherWorkspace)}/calendar?${range(-DAY_MS, 14 * DAY_MS)}`,
    ).expect(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.unscheduled).toEqual([]);

    await schedule(post.id, iso(DAY_MS), outsider).expect(404);
    expect(await PostVersion.countDocuments({}).setOptions({ skipWorkspaceScope: true })).toBe(1);
  });
});
