import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAIProvider } from "../src/integrations/ai/registry";
import { createDefaultSocialProviders } from "../src/integrations/social/providers";
import {
  setSocialProviderRegistry,
  SocialProviderRegistry,
} from "../src/integrations/social/registry";
import type { PublishImageInput, PublishVideoInput } from "../src/integrations/social/types";
import { PublishJob } from "../src/models/publishJob.model";
import { Schedule } from "../src/models/schedule.model";
import { StoredFile } from "../src/models/file.model";
import { setPublishQueue } from "../src/queues/publish.queue";
import { runPublishJob } from "../src/services/publishing.service";
import { memoryObjectStore } from "../src/utils/storage.util";
import { app } from "./helpers/client";
import { useTestDatabase } from "./helpers/database";
import { FakeAIProvider } from "./helpers/fakeAIProvider";
import { MemoryPublishQueue } from "./helpers/memoryQueue";
import { MockSocialProvider } from "./helpers/mockSocialProvider";
import { postContent } from "./helpers/postFixture";
import { createConnectedAccount } from "./helpers/socialAccountFixture";
import { API, call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

const unscoped = { skipWorkspaceScope: true } as const;
const DAY_MS = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

// Minimal files whose leading bytes pass the server's type detection.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5a60000000049454e44ae426082",
  "hex",
);
const MP4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypisom"),
  Buffer.from([0x00, 0x00, 0x02, 0x00]),
  Buffer.from("isomiso2mp41"),
  Buffer.alloc(256),
]);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

let owner: TestUser;
let workspaceId: string;
let queue: MemoryPublishQueue;
let restoreRegistry: () => void;
let restoreQueue: () => void;
let restoreAI: () => void;
const providers: Record<string, MockSocialProvider> = {};

beforeEach(async () => {
  memoryObjectStore.clear();
  for (const [platform, capabilities] of [
    ["LINKEDIN", ["TEXT_POST", "IMAGE_POST", "TOKEN_REFRESH"]],
    ["INSTAGRAM", ["IMAGE_POST", "CAROUSEL", "VIDEO_POST", "SHORT_VIDEO"]],
    ["TIKTOK", ["VIDEO_POST", "SHORT_VIDEO", "TOKEN_REFRESH"]],
    ["YOUTUBE", ["VIDEO_POST", "SHORT_VIDEO", "TOKEN_REFRESH"]],
  ] as const) {
    providers[platform] = new MockSocialProvider({
      platform,
      displayName: platform,
      capabilities: [...capabilities],
    });
  }
  restoreRegistry = setSocialProviderRegistry(
    new SocialProviderRegistry([
      ...Object.values(providers),
      ...createDefaultSocialProviders().filter((item) => !(item.platform in providers)),
    ]),
  );
  queue = new MemoryPublishQueue();
  restoreQueue = setPublishQueue(queue);
  restoreAI = setAIProvider(new FakeAIProvider(() => ({ drafts: [] })));
  owner = await createUser("Olivia Owner");
  workspaceId = (await createWorkspace(owner)).id;
});

afterEach(() => {
  restoreRegistry();
  restoreQueue();
  restoreAI();
});

const postsPath = () => `/workspaces/${workspaceId}/posts`;

const upload = async (buffer: Buffer, filename: string, name?: string, workspace = workspaceId) => {
  let test = request(app)
    .post(`${API}/workspaces/${workspace}/files`)
    .set("X-Forwarded-For", owner.client.ip)
    .set("Authorization", `Bearer ${owner.token}`)
    .attach("file", buffer, { filename, contentType: "application/octet-stream" });
  if (name) test = test.field("name", name);
  const res = await test.expect(201);
  return res.body.data.file as { id: string; name: string };
};

interface PostResponse {
  id: string;
  versionCount: number;
  currentVersion: {
    id: string;
    media: { id: string; name: string; kind: string }[];
    videoFormat: string | null;
    mediaIssue: string | null;
  };
}

const createPost = async (platform: string, body: object = {}) => {
  const res = await call(owner, "post", postsPath(), {
    platform,
    topic: "Why fresh beans matter",
    status: "APPROVED",
    content: postContent({ text: "Fresh beans taste better." }),
    ...body,
  }).expect(201);
  return res.body.data.post as PostResponse;
};

const attach = (post: PostResponse, media: string[], extra: object = {}) =>
  call(owner, "patch", `${postsPath()}/${post.id}`, {
    baseVersion: post.versionCount,
    content: postContent({ text: "Fresh beans taste better." }),
    media,
    ...extra,
  });

describe("Attaching media", () => {
  it("stores attachments on the version and reports what's still missing", async () => {
    const tikTok = await createPost("TIKTOK");
    // A TikTok post with no video can be saved, but isn't ready to publish.
    expect(tikTok.currentVersion.mediaIssue).toMatch(/TikTok posts need media/);

    const video = await upload(MP4, "pour.mp4", "Pour-over in 30 seconds");
    const res = await attach(tikTok, [video.id]).expect(200);
    const version = (res.body.data.post as PostResponse).currentVersion;

    expect(version.media).toEqual([
      expect.objectContaining({ id: video.id, name: "Pour-over in 30 seconds", kind: "video" }),
    ]);
    // TikTok only publishes short-form, so that's the format it gets.
    expect(version.videoFormat).toBe("short");
    expect(version.mediaIssue).toBeNull();
  });

  it.each([
    ["INSTAGRAM", PNG, "logo.png", /Instagram doesn't accept/],
    ["TIKTOK", JPEG, "photo.jpg", /TikTok posts can't include images/],
    ["LINKEDIN", MP4, "clip.mp4", /LinkedIn posts can't include video/],
  ])("refuses what %s can't publish", async (platform, buffer, filename, message) => {
    const post = await createPost(platform);
    const file = await upload(buffer, filename);

    const res = await attach(post, [file.id]).expect(400);
    expect(res.body.message).toMatch(message);
  });

  it("refuses documents, mixed media and too many images", async () => {
    const instagram = await createPost("INSTAGRAM");
    const pdf = await upload(PDF, "brief.pdf");
    const photo = await upload(JPEG, "a.jpg");
    const video = await upload(MP4, "b.mp4");

    expect((await attach(instagram, [pdf.id]).expect(400)).body.message).toMatch(
      /Documents can't be posted/,
    );
    expect((await attach(instagram, [photo.id, video.id]).expect(400)).body.message).toMatch(
      /images or a video, not both/,
    );

    const linkedIn = await createPost("LINKEDIN");
    const second = await upload(JPEG, "c.jpg");
    expect((await attach(linkedIn, [photo.id, second.id]).expect(400)).body.message).toMatch(
      /LinkedIn posts take one image/,
    );
  });

  it("won't attach a file from another workspace", async () => {
    const post = await createPost("LINKEDIN");
    const otherWorkspace = await createWorkspace(owner);
    const foreign = await upload(JPEG, "theirs.jpg", undefined, otherWorkspace.id);

    const res = await attach(post, [foreign.id]).expect(400);
    expect(res.body.message).toMatch(/isn't in this workspace's media library/);
  });

  it("keeps media when the text changes, and restoring brings old media back", async () => {
    const instagram = await createPost("INSTAGRAM");
    const first = await upload(JPEG, "first.jpg");
    const second = await upload(JPEG, "second.jpg");

    const withFirst = (await attach(instagram, [first.id]).expect(200)).body.data
      .post as PostResponse;
    const withSecond = (await attach(withFirst, [second.id]).expect(200)).body.data
      .post as PostResponse;

    // Leaving media out of an edit keeps what's attached.
    const textOnly = await call(owner, "patch", `${postsPath()}/${instagram.id}`, {
      baseVersion: withSecond.versionCount,
      content: postContent({ text: "A new caption" }),
    }).expect(200);
    expect((textOnly.body.data.post as PostResponse).currentVersion.media[0].id).toBe(second.id);

    const restored = await call(
      owner,
      "post",
      `${postsPath()}/${instagram.id}/versions/${withFirst.currentVersion.id}/restore`,
    ).expect(200);
    expect((restored.body.data.post as PostResponse).currentVersion.media[0].id).toBe(first.id);
  });

  it("shows a deleted library file as a problem rather than breaking the post", async () => {
    const tikTok = await createPost("TIKTOK");
    const video = await upload(MP4, "pour.mp4");
    await attach(tikTok, [video.id]).expect(200);

    await StoredFile.deleteOne({ _id: video.id }).setOptions(unscoped);

    const res = await call(owner, "get", `${postsPath()}/${tikTok.id}`).expect(200);
    const version = (res.body.data.post as PostResponse).currentVersion;
    expect(version.media).toEqual([]);
    expect(version.mediaIssue).toMatch(/deleted from the media library/);
  });
});

describe("Publishing with media", () => {
  const scheduleAndRun = async (post: PostResponse, platform: string) => {
    await createConnectedAccount({
      workspaceId,
      connectedBy: owner.id,
      provider: providers[platform],
    });
    await call(owner, "patch", `${postsPath()}/${post.id}/schedule`, {
      scheduledAt: iso(DAY_MS),
      publish: true,
    }).expect(200);
    const scheduleDoc = await Schedule.findOne({ post: post.id }).setOptions(unscoped).orFail();
    const job = await PublishJob.findOne({ schedule: scheduleDoc._id })
      .setOptions(unscoped)
      .orFail();
    return runPublishJob({ publishJobId: job._id.toString() });
  };

  it("won't schedule a video platform's post without its video", async () => {
    const youTube = await createPost("YOUTUBE");
    await createConnectedAccount({
      workspaceId,
      connectedBy: owner.id,
      provider: providers.YOUTUBE,
    });

    const res = await call(owner, "patch", `${postsPath()}/${youTube.id}/schedule`, {
      scheduledAt: iso(DAY_MS),
      publish: true,
    }).expect(400);
    expect(res.body.message).toMatch(/YouTube posts need media/);
    expect(queue.countAdds()).toBe(0);
  });

  it("publishes a TikTok video, reading the bytes from storage", async () => {
    const tikTok = await createPost("TIKTOK");
    const video = await upload(MP4, "pour.mp4");
    const attached = (await attach(tikTok, [video.id]).expect(200)).body.data.post as PostResponse;

    const outcome = await scheduleAndRun(attached, "TIKTOK");

    expect(outcome.outcome).toBe("published");
    const [input] = providers.TIKTOK.publishedInputs as PublishVideoInput[];
    expect(input.format).toBe("short");
    expect(input.video.mimeType).toBe("video/mp4");
    // The provider gets the file's real bytes, not just a link.
    expect((await input.video.read!()).equals(MP4)).toBe(true);
  });

  it("publishes an Instagram carousel in the order the images were attached", async () => {
    const instagram = await createPost("INSTAGRAM");
    const first = await upload(JPEG, "first.jpg");
    const second = await upload(JPEG, "second.jpg");
    const attached = (await attach(instagram, [second.id, first.id]).expect(200)).body.data
      .post as PostResponse;

    await scheduleAndRun(attached, "INSTAGRAM");

    const [input] = providers.INSTAGRAM.publishedInputs as PublishImageInput[];
    expect(input.images).toHaveLength(2);
    const stored = await StoredFile.find({ _id: { $in: [first.id, second.id] } }).setOptions(
      unscoped,
    );
    const urlOf = (id: string) => stored.find((file) => file._id.toString() === id)!.url;
    expect(input.images.map((image) => image.url)).toEqual([urlOf(second.id), urlOf(first.id)]);
  });

  it("still publishes a LinkedIn text post with no media", async () => {
    const linkedIn = await createPost("LINKEDIN");

    await scheduleAndRun(linkedIn, "LINKEDIN");

    expect(providers.LINKEDIN.publishedInputs).toEqual([{ text: "Fresh beans taste better." }]);
  });

  it("fails the job, not the worker, when media disappears after scheduling", async () => {
    const tikTok = await createPost("TIKTOK");
    const video = await upload(MP4, "pour.mp4");
    const attached = (await attach(tikTok, [video.id]).expect(200)).body.data.post as PostResponse;

    await createConnectedAccount({
      workspaceId,
      connectedBy: owner.id,
      provider: providers.TIKTOK,
    });
    await call(owner, "patch", `${postsPath()}/${attached.id}/schedule`, {
      scheduledAt: iso(DAY_MS),
      publish: true,
    }).expect(200);
    await StoredFile.deleteOne({ _id: video.id }).setOptions(unscoped);

    const scheduleDoc = await Schedule.findOne({ post: attached.id }).setOptions(unscoped).orFail();
    const job = await PublishJob.findOne({ schedule: scheduleDoc._id })
      .setOptions(unscoped)
      .orFail();
    const outcome = await runPublishJob({ publishJobId: job._id.toString() });

    expect(outcome.outcome).toBe("failed");
    expect(providers.TIKTOK.publishedInputs).toEqual([]);
    const failed = await PublishJob.findById(job._id).setOptions(unscoped).orFail();
    expect(failed.error?.code).toBe("MEDIA_MISSING");
  });
});

describe("Finding posts for the Content screen", () => {
  it("filters by several platforms, by media and by search", async () => {
    const linkedIn = await createPost("LINKEDIN", { topic: "Grind size guide" });
    const tikTok = await createPost("TIKTOK", { topic: "Pour-over timing" });
    await createPost("YOUTUBE", { topic: "Roastery tour" });
    const video = await upload(MP4, "pour.mp4");
    await attach(tikTok, [video.id]).expect(200);

    const ids = async (query: string) => {
      const res = await call(owner, "get", `${postsPath()}?${query}`).expect(200);
      return (res.body.data as { id: string }[]).map((post) => post.id).sort();
    };

    expect(await ids("platform=LINKEDIN,TIKTOK")).toEqual([linkedIn.id, tikTok.id].sort());
    expect(await ids("hasMedia=true")).toEqual([tikTok.id]);
    expect(await ids("q=grind")).toEqual([linkedIn.id]);
    // Searching matches the post's text as well as its topic.
    expect((await ids("q=fresh beans")).length).toBe(3);
  });
});
