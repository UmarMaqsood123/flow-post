import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PublishAttemptStatus,
  PublishJobStatus,
  ScheduleStatus,
} from "../src/constants/publishing.constant";
import { SocialAccountStatus } from "../src/constants/social.constant";
import { setAIProvider } from "../src/integrations/ai/registry";
import { SocialProviderError } from "../src/integrations/social/errors";
import { createDefaultSocialProviders } from "../src/integrations/social/providers";
import {
  setSocialProviderRegistry,
  SocialProviderRegistry,
} from "../src/integrations/social/registry";
import { Post } from "../src/models/post.model";
import { PublishAttempt } from "../src/models/publishAttempt.model";
import { PublishJob } from "../src/models/publishJob.model";
import { Schedule } from "../src/models/schedule.model";
import { SocialAccount } from "../src/models/socialAccount.model";
import { setPublishQueue } from "../src/queues/publish.queue";
import { recoverPublishing, runPublishJob } from "../src/services/publishing.service";
import { useTestDatabase } from "./helpers/database";
import { FakeAIProvider } from "./helpers/fakeAIProvider";
import { MemoryPublishQueue } from "./helpers/memoryQueue";
import { MockSocialProvider } from "./helpers/mockSocialProvider";
import { postContent } from "./helpers/postFixture";
import { createConnectedAccount } from "./helpers/socialAccountFixture";
import { addMember, call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

const unscoped = { skipWorkspaceScope: true } as const;
const DAY_MS = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

let provider: MockSocialProvider;
let queue: MemoryPublishQueue;
let restoreRegistry: () => void;
let restoreQueue: () => void;
let restoreAI: () => void;
let owner: TestUser;
let workspaceId: string;

const useProvider = (options = {}) => {
  restoreRegistry?.();
  provider = new MockSocialProvider({ platform: "LINKEDIN", displayName: "LinkedIn", ...options });
  restoreRegistry = setSocialProviderRegistry(
    new SocialProviderRegistry([
      provider,
      ...createDefaultSocialProviders().filter((item) => item.platform !== "LINKEDIN"),
    ]),
  );
};

beforeEach(async () => {
  useProvider();
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

const createPost = async (body: object = {}, user: TestUser = owner) => {
  const res = await call(user, "post", postsPath(), {
    platform: "LINKEDIN",
    topic: "Why fresh beans matter",
    status: "APPROVED",
    content: postContent({ text: "Fresh beans taste better." }),
    ...body,
  }).expect(201);
  return res.body.data.post as { id: string; status: string };
};

const schedule = (postId: string, body: object, user: TestUser = owner) =>
  call(user, "patch", `${postsPath()}/${postId}/schedule`, body);

/** A post that's approved, has a connected account, and is queued to publish. */
const scheduleReadyPost = async (
  options: { scheduledAt?: string; tokenExpiresAt?: Date | null } = {},
) => {
  const account = await createConnectedAccount({
    workspaceId,
    connectedBy: owner.id,
    provider,
    tokenExpiresAt: options.tokenExpiresAt,
  });
  const post = await createPost();
  await schedule(post.id, { scheduledAt: options.scheduledAt ?? iso(DAY_MS) }).expect(200);
  const scheduleDoc = await Schedule.findOne({ post: post.id }).setOptions(unscoped).orFail();
  const job = await PublishJob.findOne({ schedule: scheduleDoc._id }).setOptions(unscoped).orFail();
  return { account, post, schedule: scheduleDoc, job };
};

const reload = async (ids: { scheduleId: string; jobId: string; postId: string }) => ({
  schedule: await Schedule.findById(ids.scheduleId).setOptions(unscoped).orFail(),
  job: await PublishJob.findById(ids.jobId).setOptions(unscoped).orFail(),
  post: await Post.findById(ids.postId).setOptions(unscoped).orFail(),
  attempts: await PublishAttempt.find({ publishJob: ids.jobId })
    .sort({ attempt: 1 })
    .setOptions(unscoped),
});

describe("Scheduling a publish", () => {
  it("queues a delayed job and records the schedule", async () => {
    const at = iso(2 * DAY_MS);
    const { post, schedule: scheduleDoc, job } = await scheduleReadyPost({ scheduledAt: at });

    expect(scheduleDoc).toMatchObject({
      status: ScheduleStatus.SCHEDULED,
      platform: "LINKEDIN",
      isLive: true,
      attempts: 0,
      needsReview: false,
    });
    expect(scheduleDoc.scheduledAt.toISOString()).toBe(new Date(at).toISOString());
    expect(job).toMatchObject({
      status: PublishJobStatus.QUEUED,
      queueJobId: `publish:${scheduleDoc._id.toString()}:1`,
      idempotencyKey: `${scheduleDoc._id.toString()}:1`,
      attempts: 0,
    });

    const [queued] = queue.added;
    expect(queued.options.jobId).toBe(job.queueJobId);
    expect(queued.options.attempts).toBe(job.maxAttempts);
    expect(queued.options.backoffMs).toBeGreaterThan(0);
    // Delayed until the scheduled time, give or take the time the test took.
    expect(queued.options.delayMs).toBeGreaterThan(DAY_MS);
    expect(queued.data).toMatchObject({ publishJobId: job._id.toString(), postId: post.id });

    const stored = await Post.findById(post.id).setOptions(unscoped).orFail();
    expect(stored.status).toBe("SCHEDULED");
  });

  it("needs exactly one connected account, or a choice", async () => {
    const post = await createPost();
    const noAccount = await schedule(post.id, { scheduledAt: iso(DAY_MS) }).expect(409);
    // Platform names reach users the way they're written, not as enum values.
    expect(noAccount.body.message).toContain("Connect a LinkedIn account");
    expect(queue.countAdds()).toBe(0);
    expect((await Post.findById(post.id).setOptions(unscoped).orFail()).status).toBe("APPROVED");

    const first = await createConnectedAccount({ workspaceId, connectedBy: owner.id, provider });
    provider.setProfile({ providerAccountId: "mock-account-2" });
    const second = await createConnectedAccount({ workspaceId, connectedBy: owner.id, provider });

    const ambiguous = await schedule(post.id, { scheduledAt: iso(DAY_MS) }).expect(400);
    expect(ambiguous.body.message).toContain("Choose which account");

    await schedule(post.id, {
      scheduledAt: iso(DAY_MS),
      socialAccountId: second._id.toString(),
    }).expect(200);
    const scheduleDoc = await Schedule.findOne({ post: post.id }).setOptions(unscoped).orFail();
    expect(scheduleDoc.socialAccount.toString()).toBe(second._id.toString());
    expect(scheduleDoc.socialAccount.toString()).not.toBe(first._id.toString());
  });

  it("refuses a video platform's post until it has its video", async () => {
    await createConnectedAccount({ workspaceId, connectedBy: owner.id, provider });
    const tikTok = await createPost({ platform: "TIKTOK" });
    // TikTok has no text-only post, so the missing video is the real problem.
    const res = await schedule(tikTok.id, { scheduledAt: iso(DAY_MS) }).expect(400);
    expect(res.body.message).toMatch(/TikTok posts need media/);
    expect(queue.countAdds()).toBe(0);
  });

  it("replaces the live schedule when rescheduled and clears it when unscheduled", async () => {
    const { post, schedule: first, job: firstJob } = await scheduleReadyPost();

    await schedule(post.id, { scheduledAt: iso(3 * DAY_MS) }).expect(200);
    const cancelled = await Schedule.findById(first._id).setOptions(unscoped).orFail();
    expect(cancelled).toMatchObject({ status: ScheduleStatus.CANCELLED, isLive: null });
    expect(queue.events).toContainEqual({ type: "remove", jobId: firstJob.queueJobId });

    const live = await Schedule.find({ post: post.id, isLive: true }).setOptions(unscoped);
    expect(live).toHaveLength(1);

    await schedule(post.id, { scheduledAt: null }).expect(200);
    expect(await Schedule.find({ post: post.id, isLive: true }).setOptions(unscoped)).toHaveLength(
      0,
    );
    const stored = await Post.findById(post.id).setOptions(unscoped).orFail();
    expect(stored.status).toBe("APPROVED");
  });

  it("lets the database reject a second live schedule", async () => {
    await Schedule.init();
    const { schedule: live } = await scheduleReadyPost();

    await expect(
      Schedule.create({
        workspace: live.workspace,
        post: live.post,
        socialAccount: live.socialAccount,
        platform: live.platform,
        scheduledAt: new Date(),
        isLive: true,
        maxAttempts: 3,
        createdBy: live.createdBy,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe("Publishing a job", () => {
  it("publishes, then records the result everywhere", async () => {
    const { post, schedule: scheduleDoc, job } = await scheduleReadyPost();

    const outcome = await runPublishJob({ publishJobId: job._id.toString() });
    expect(outcome.outcome).toBe("published");

    expect(provider.publishedInputs).toEqual([{ text: "Fresh beans taste better." }]);
    const after = await reload({
      scheduleId: scheduleDoc._id.toString(),
      jobId: job._id.toString(),
      postId: post.id,
    });

    expect(after.schedule).toMatchObject({
      status: ScheduleStatus.PUBLISHED,
      isLive: null,
      attempts: 1,
      needsReview: false,
    });
    expect(after.schedule.result?.providerPostId).toMatch(/^mock-post-/);
    expect(after.schedule.publishedAt).toBeInstanceOf(Date);
    expect(after.job).toMatchObject({ status: PublishJobStatus.SUCCEEDED, attempts: 1 });
    expect(after.job.result?.url).toContain("mock-social.test");
    expect(after.post.status).toBe("PUBLISHED");
    expect(after.post.publishedAt).toBeInstanceOf(Date);
    expect(after.attempts).toHaveLength(1);
    expect(after.attempts[0]).toMatchObject({
      status: PublishAttemptStatus.SUCCEEDED,
      requestSent: true,
      attempt: 1,
    });
    expect(after.attempts[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("does nothing the second time the same job runs", async () => {
    const { job } = await scheduleReadyPost();

    await runPublishJob({ publishJobId: job._id.toString() });
    const again = await runPublishJob({ publishJobId: job._id.toString() });

    expect(again).toEqual({ outcome: "skipped", reason: "already-published" });
    expect(provider.countCalls("publishText")).toBe(1);
  });

  it("publishes once when two workers pick up the same job", async () => {
    const { job } = await scheduleReadyPost();

    const outcomes = await Promise.all([
      runPublishJob({ publishJobId: job._id.toString() }),
      runPublishJob({ publishJobId: job._id.toString() }),
    ]);

    expect(provider.countCalls("publishText")).toBe(1);
    expect(outcomes.filter((outcome) => outcome.outcome === "published")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.outcome === "skipped")).toHaveLength(1);
  });

  it("retries a rate limit, then publishes", async () => {
    const { post, schedule: scheduleDoc, job } = await scheduleReadyPost();
    provider.failNext(
      "publishText",
      new SocialProviderError("RATE_LIMITED", "Too many requests", {
        platform: "LINKEDIN",
        retryable: true,
      }),
    );

    const first = await runPublishJob({ publishJobId: job._id.toString() });
    expect(first.outcome).toBe("retry");

    const between = await reload({
      scheduleId: scheduleDoc._id.toString(),
      jobId: job._id.toString(),
      postId: post.id,
    });
    expect(between.job).toMatchObject({ status: PublishJobStatus.QUEUED, attempts: 1 });
    expect(between.job.lockedAt).toBeNull();
    expect(between.schedule.status).toBe(ScheduleStatus.SCHEDULED);
    expect(between.schedule.lastError?.code).toBe("RATE_LIMITED");
    expect(between.post.status).toBe("SCHEDULED");
    expect(between.attempts[0]).toMatchObject({
      status: PublishAttemptStatus.FAILED,
      requestSent: true,
    });

    const second = await runPublishJob({ publishJobId: job._id.toString(), queueAttempt: 2 });
    expect(second.outcome).toBe("published");
    const after = await reload({
      scheduleId: scheduleDoc._id.toString(),
      jobId: job._id.toString(),
      postId: post.id,
    });
    expect(after.schedule.status).toBe(ScheduleStatus.PUBLISHED);
    expect(after.attempts).toHaveLength(2);
  });

  it("gives up once the attempts run out", async () => {
    const { post, schedule: scheduleDoc, job } = await scheduleReadyPost();
    await PublishJob.updateOne({ _id: job._id }, { $set: { maxAttempts: 2 } }).setOptions(unscoped);

    for (const attempt of [1, 2]) {
      provider.failNext(
        "publishText",
        new SocialProviderError("PROVIDER_ERROR", "LinkedIn had a problem", {
          platform: "LINKEDIN",
          retryable: true,
        }),
      );
      const outcome = await runPublishJob({
        publishJobId: job._id.toString(),
        queueAttempt: attempt,
      });
      expect(outcome.outcome).toBe(attempt === 1 ? "retry" : "failed");
    }

    const after = await reload({
      scheduleId: scheduleDoc._id.toString(),
      jobId: job._id.toString(),
      postId: post.id,
    });
    expect(after.job).toMatchObject({ status: PublishJobStatus.FAILED, attempts: 2 });
    expect(after.schedule).toMatchObject({
      status: ScheduleStatus.FAILED,
      isLive: null,
      needsReview: false,
    });
    expect(after.post.status).toBe("FAILED");
    expect(provider.countCalls("publishText")).toBe(2);
  });

  it("fails immediately when the platform rejects the post", async () => {
    const { schedule: scheduleDoc, job, post } = await scheduleReadyPost();
    provider.failNext(
      "publishText",
      new SocialProviderError("INVALID_REQUEST", "Post text is too long", {
        platform: "LINKEDIN",
      }),
    );

    const outcome = await runPublishJob({ publishJobId: job._id.toString() });
    expect(outcome).toMatchObject({ outcome: "failed", needsReview: false });

    const after = await reload({
      scheduleId: scheduleDoc._id.toString(),
      jobId: job._id.toString(),
      postId: post.id,
    });
    expect(after.job).toMatchObject({ status: PublishJobStatus.FAILED, attempts: 1 });
    expect(after.job.error).toMatchObject({ code: "INVALID_REQUEST", retryable: false });
    expect(after.schedule.status).toBe(ScheduleStatus.FAILED);
  });
});

describe("Never publishing twice", () => {
  it("stops after a timeout instead of retrying, and asks for a human", async () => {
    const { post, schedule: scheduleDoc, job } = await scheduleReadyPost();
    provider.failNext(
      "publishText",
      new SocialProviderError("PROVIDER_ERROR", "LinkedIn took too long to respond", {
        platform: "LINKEDIN",
        retryable: true,
        outcomeUnknown: true,
      }),
    );

    const outcome = await runPublishJob({ publishJobId: job._id.toString() });
    expect(outcome).toMatchObject({ outcome: "failed", needsReview: true });

    const after = await reload({
      scheduleId: scheduleDoc._id.toString(),
      jobId: job._id.toString(),
      postId: post.id,
    });
    expect(after.schedule).toMatchObject({ status: ScheduleStatus.FAILED, needsReview: true });
    expect(after.schedule.lastError?.message).toContain("may already be live");
    expect(after.job.outcomeUnknown).toBe(true);
    expect(after.post.status).toBe("FAILED");

    // Running it again must not send a second post.
    const again = await runPublishJob({ publishJobId: job._id.toString(), queueAttempt: 2 });
    expect(again).toEqual({ outcome: "skipped", reason: "already-failed" });
    expect(provider.countCalls("publishText")).toBe(1);
  });

  it("refuses to republish when an attempt never reported back", async () => {
    const { post, schedule: scheduleDoc, job } = await scheduleReadyPost();
    // A worker that died mid-request leaves this behind.
    await PublishAttempt.create({
      workspace: scheduleDoc.workspace,
      publishJob: job._id,
      schedule: scheduleDoc._id,
      post: scheduleDoc.post,
      attempt: 1,
      status: PublishAttemptStatus.IN_FLIGHT,
      requestSent: true,
      startedAt: new Date(Date.now() - 60_000),
      worker: "crashed-worker:1",
    });
    await PublishJob.updateOne({ _id: job._id }, { $set: { attempts: 1 } }).setOptions(unscoped);

    const outcome = await runPublishJob({ publishJobId: job._id.toString(), queueAttempt: 2 });

    expect(outcome).toMatchObject({ outcome: "failed", needsReview: true });
    expect(provider.countCalls("publishText")).toBe(0);
    const after = await reload({
      scheduleId: scheduleDoc._id.toString(),
      jobId: job._id.toString(),
      postId: post.id,
    });
    expect(after.schedule.needsReview).toBe(true);
    expect(after.attempts[0]).toMatchObject({
      status: PublishAttemptStatus.FAILED,
      error: { code: "OUTCOME_UNKNOWN" },
    });
  });

  it("skips a cancelled schedule", async () => {
    const { post, job } = await scheduleReadyPost();
    await schedule(post.id, { scheduledAt: null }).expect(200);

    const outcome = await runPublishJob({ publishJobId: job._id.toString() });

    expect(outcome).toMatchObject({ outcome: "skipped", reason: "cancelled" });
    expect(provider.countCalls("publishText")).toBe(0);
  });
});

describe("Connections", () => {
  it("refreshes an expired token before publishing", async () => {
    const { account, job } = await scheduleReadyPost({
      tokenExpiresAt: new Date(Date.now() - 60_000),
    });
    const tokenBefore = provider.lastAccessToken;

    const outcome = await runPublishJob({ publishJobId: job._id.toString() });

    expect(outcome.outcome).toBe("published");
    expect(provider.countCalls("refreshAccessToken")).toBe(1);
    expect(provider.lastAccessToken).not.toBe(tokenBefore);
    const stored = await SocialAccount.findById(account._id).setOptions(unscoped).orFail();
    expect(stored.status).toBe(SocialAccountStatus.CONNECTED);
    expect(stored.lastRefreshedAt).toBeInstanceOf(Date);
  });

  it("fails without retrying when the account needs reconnecting", async () => {
    const { account, schedule: scheduleDoc, job, post } = await scheduleReadyPost();
    await SocialAccount.updateOne(
      { _id: account._id },
      { $set: { status: SocialAccountStatus.REAUTH_REQUIRED } },
    ).setOptions(unscoped);

    const outcome = await runPublishJob({ publishJobId: job._id.toString() });

    expect(outcome).toMatchObject({ outcome: "failed", needsReview: false });
    expect(provider.countCalls("publishText")).toBe(0);
    const after = await reload({
      scheduleId: scheduleDoc._id.toString(),
      jobId: job._id.toString(),
      postId: post.id,
    });
    expect(after.schedule.status).toBe(ScheduleStatus.FAILED);
    expect(after.post.status).toBe("FAILED");
  });
});

describe("Recovery after a crash", () => {
  const abandon = async (jobId: string) => {
    await PublishJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: PublishJobStatus.PROCESSING,
          lockedBy: "crashed-worker:1",
          lockedAt: new Date(Date.now() - 60 * 60_000),
          attempts: 1,
        },
      },
    ).setOptions(unscoped);
  };

  it("requeues a job a crashed worker left behind", async () => {
    const { job } = await scheduleReadyPost();
    await abandon(job._id.toString());
    await queue.remove(job.queueJobId);

    const result = await recoverPublishing();

    expect(result).toMatchObject({ requeued: 1, failed: 0 });
    expect(await queue.has(job.queueJobId)).toBe(true);
    const stored = await PublishJob.findById(job._id).setOptions(unscoped).orFail();
    expect(stored).toMatchObject({ status: PublishJobStatus.QUEUED, lockedAt: null });
  });

  it("flags a crashed job whose platform call had already started", async () => {
    const { schedule: scheduleDoc, job } = await scheduleReadyPost();
    await abandon(job._id.toString());
    await PublishAttempt.create({
      workspace: scheduleDoc.workspace,
      publishJob: job._id,
      schedule: scheduleDoc._id,
      post: scheduleDoc.post,
      attempt: 1,
      status: PublishAttemptStatus.IN_FLIGHT,
      requestSent: true,
      startedAt: new Date(Date.now() - 60 * 60_000),
      worker: "crashed-worker:1",
    });

    const result = await recoverPublishing();

    expect(result).toMatchObject({ requeued: 0, failed: 1 });
    const stored = await Schedule.findById(scheduleDoc._id).setOptions(unscoped).orFail();
    expect(stored).toMatchObject({ status: ScheduleStatus.FAILED, needsReview: true });
  });

  it("queues work again when the queue entry of a job coming due has disappeared", async () => {
    const { job } = await scheduleReadyPost({ scheduledAt: iso(5 * 60_000) });
    await queue.remove(job.queueJobId);

    const result = await recoverPublishing();

    expect(result.requeued).toBe(1);
    const queued = queue.jobs.get(job.queueJobId);
    expect(queued?.data.publishJobId).toBe(job._id.toString());
  });

  it("leaves jobs far in the future until they come due", async () => {
    const { job } = await scheduleReadyPost({ scheduledAt: iso(DAY_MS) });
    await queue.remove(job.queueJobId);
    expect((await recoverPublishing()).requeued).toBe(0);
  });

  it("only one recovery sweep handles an abandoned job", async () => {
    const { job } = await scheduleReadyPost();
    await abandon(job._id.toString());
    const [first, second] = await Promise.all([recoverPublishing(), recoverPublishing()]);
    expect(first.requeued + second.requeued).toBe(1);
  });
});

describe("Duplicate publishing guards", () => {
  it("refuses to cancel or reschedule while the post is being sent", async () => {
    const { post, schedule: scheduleDoc } = await scheduleReadyPost();
    await Schedule.updateOne(
      { _id: scheduleDoc._id },
      { status: ScheduleStatus.PROCESSING },
    ).setOptions(unscoped);

    await schedule(post.id, { scheduledAt: iso(2 * DAY_MS) }).expect(409);
    await schedule(post.id, { scheduledAt: null }).expect(409);
    expect(await Schedule.countDocuments({ post: post.id }).setOptions(unscoped)).toBe(1);
  });

  it("a worker holding a stale job never revives a cancelled schedule", async () => {
    const { post, job } = await scheduleReadyPost();
    // The job was read as queued, but the user unscheduled before the claim.
    await Schedule.updateOne(
      { post: post.id },
      { status: ScheduleStatus.CANCELLED, isLive: null },
    ).setOptions(unscoped);

    const outcome = await runPublishJob({ publishJobId: job._id.toString() });

    expect(outcome).toMatchObject({ outcome: "skipped", reason: "cancelled" });
    expect(provider.publishedInputs).toHaveLength(0);
    const stored = await Schedule.findOne({ post: post.id }).setOptions(unscoped).orFail();
    expect(stored.status).toBe(ScheduleStatus.CANCELLED);
  });
});

describe("Schedule history", () => {
  it("returns the schedule with its jobs and attempts", async () => {
    const { post, job } = await scheduleReadyPost();
    provider.failNext(
      "publishText",
      new SocialProviderError("RATE_LIMITED", "Too many requests", { platform: "LINKEDIN" }),
    );
    await runPublishJob({ publishJobId: job._id.toString() });
    await runPublishJob({ publishJobId: job._id.toString(), queueAttempt: 2 });

    const res = await call(owner, "get", `${postsPath()}/${post.id}/schedule`).expect(200);

    expect(res.body.data.schedule).toMatchObject({
      status: ScheduleStatus.PUBLISHED,
      attempts: 2,
      needsReview: false,
    });
    expect(res.body.data.schedule.result.providerPostId).toMatch(/^mock-post-/);
    const [publishJob] = res.body.data.jobs as {
      status: string;
      attemptHistory: { attempt: number; status: string; requestSent: boolean }[];
    }[];
    expect(publishJob.status).toBe(PublishJobStatus.SUCCEEDED);
    expect(publishJob.attemptHistory).toHaveLength(2);
    expect(publishJob.attemptHistory[0]).toMatchObject({ attempt: 1, status: "FAILED" });
    expect(publishJob.attemptHistory[1]).toMatchObject({ attempt: 2, status: "SUCCEEDED" });
  });

  it("is empty for a post that was never scheduled, and viewers can read it", async () => {
    const viewer = await createUser("Vera Viewer");
    await addMember(owner, workspaceId, viewer, "VIEWER");
    const post = await createPost();

    const res = await call(viewer, "get", `${postsPath()}/${post.id}/schedule`).expect(200);
    expect(res.body.data).toEqual({ schedule: null, jobs: [] });

    await schedule(post.id, { scheduledAt: iso(DAY_MS) }, viewer).expect(403);
  });
});
