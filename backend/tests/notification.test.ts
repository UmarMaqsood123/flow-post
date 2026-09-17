import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setStreamTimings } from "../src/controllers/notification.controller";
import { Notification } from "../src/models/notification.model";
import { Post } from "../src/models/post.model";
import { User } from "../src/models/user.model";
import { closeAllStreams, streamCount } from "../src/realtime/notificationHub";
import { notify } from "../src/services/notification.service";
import * as NotificationEvents from "../src/services/notificationEvents.service";
import { app } from "./helpers/client";
import { useTestDatabase } from "./helpers/database";
import {
  API,
  addMember,
  call,
  createUser,
  createWorkspace,
  getMemberId,
  type TestUser,
} from "./helpers/workspace";

useTestDatabase();

let owner: TestUser;
let workspaceId: string;

beforeEach(async () => {
  owner = await createUser("Olivia Owner");
  workspaceId = (await createWorkspace(owner)).id;
});

const list = async (user: TestUser, workspace: string | null = workspaceId) => {
  const query = workspace ? `?workspaceId=${workspace}` : "";
  const res = await call(user, "get", `/notifications${query}`).expect(200);
  return res.body.data as {
    notifications: { id: string; type: string; title: string; href: string; read: boolean }[];
    unread: number;
    hasMore: boolean;
  };
};

describe("Notifications API", () => {
  it("notifies the inviter when an invitation is accepted, and marks read", async () => {
    const eddie = await createUser("Eddie Editor");
    await addMember(owner, workspaceId, eddie, "EDITOR");

    const { notifications, unread } = await list(owner);
    expect(unread).toBe(1);
    expect(notifications[0]).toMatchObject({
      type: "INVITATION_ACCEPTED",
      title: expect.stringContaining("Eddie Editor"),
      href: "/team",
      read: false,
    });

    const marked = await call(owner, "post", "/notifications/read", {
      workspaceId,
      ids: [notifications[0]!.id],
    }).expect(200);
    expect(marked.body.data.unread).toBe(0);
    expect((await list(owner)).notifications[0]!.read).toBe(true);
  });

  it("tells members about role changes and removal; removal is account-level", async () => {
    const eddie = await createUser("Eddie Editor");
    await addMember(owner, workspaceId, eddie, "EDITOR");
    const memberId = await getMemberId(owner, workspaceId, eddie);

    await call(owner, "patch", `/workspaces/${workspaceId}/members/${memberId}`, {
      role: "VIEWER",
    }).expect(200);
    expect((await list(eddie)).notifications[0]).toMatchObject({ type: "MEMBER_ROLE_CHANGED" });

    await call(owner, "delete", `/workspaces/${workspaceId}/members/${memberId}`).expect(200);
    // Visible without the workspace they can no longer open.
    const accountLevel = await list(eddie, null);
    expect(accountLevel.notifications.map((n) => n.type)).toEqual(["MEMBER_REMOVED"]);
  });

  it("never shows or changes another user's notifications", async () => {
    const mallory = await createUser("Mallory");
    await notify({
      recipients: [owner.id],
      workspace: workspaceId,
      type: "POST_PUBLISHED",
      title: "Private",
      body: "Owner only",
      href: "/content",
    });
    const own = await list(owner);
    expect(own.unread).toBe(1);

    expect((await list(mallory, workspaceId)).notifications).toHaveLength(0);
    await call(mallory, "post", "/notifications/read", {
      workspaceId,
      ids: [own.notifications[0]!.id],
    }).expect(200);
    await call(mallory, "post", "/notifications/read", { workspaceId, all: true }).expect(200);
    expect((await list(owner)).unread).toBe(1);
  });

  it("shows a workspace's notifications only in that workspace", async () => {
    const other = (await createWorkspace(owner, { name: "Second" })).id;
    await notify({
      recipients: [owner.id],
      workspace: other,
      type: "INSIGHTS_READY",
      title: "Second workspace",
      body: "…",
      href: "/analytics",
    });
    expect((await list(owner, workspaceId)).notifications).toHaveLength(0);
    expect((await list(owner, other)).notifications).toHaveLength(1);

    await call(owner, "post", "/notifications/read", { workspaceId, all: true }).expect(200);
    expect((await list(owner, other)).unread).toBe(1);
  });

  it("dedupes repeated events and only keeps in-app links", async () => {
    const input = {
      recipients: [owner.id, owner.id],
      workspace: workspaceId,
      type: "POST_FAILED" as const,
      title: "Failed",
      body: "…",
      href: "//evil.example/phish",
      dedupeKey: "failed:1",
    };
    await notify(input);
    await notify(input);
    const { notifications } = await list(owner);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.href).toBe("/");
  });

  it("validates input and requires authentication", async () => {
    await call(owner, "post", "/notifications/read", { workspaceId }).expect(422);
    await call(owner, "post", "/notifications/read", { ids: ["nope"] }).expect(422);
    await call(owner, "get", "/notifications?workspaceId=bad").expect(422);
    await request(app).get(`${API}/notifications`).expect(401);
  });

  it("tells the author and workspace admins when a publish fails", async () => {
    const eddie = await createUser("Eddie Editor");
    const alex = await createUser("Alex Admin");
    await addMember(owner, workspaceId, eddie, "EDITOR");
    await addMember(owner, workspaceId, alex, "ADMIN");
    const post = await Post.create({
      workspace: new Types.ObjectId(workspaceId),
      platform: "LINKEDIN",
      status: "FAILED",
      brief: { topic: "Launch day" },
      createdBy: new Types.ObjectId(eddie.id),
    });
    const scheduleId = new Types.ObjectId();

    await NotificationEvents.postFailed(scheduleId, post._id, { message: "Token revoked" }, false);
    await NotificationEvents.postFailed(scheduleId, post._id, { message: "Token revoked" }, false);

    for (const user of [eddie, alex, owner]) {
      const failures = (await list(user)).notifications.filter((n) => n.type === "POST_FAILED");
      expect(failures).toHaveLength(1);
      expect(failures[0]!.href).toBe(`/create?post=${post.id}`);
    }
  });
});

describe("Live stream", () => {
  let server: Server;
  let base: string;
  let restoreTimings: () => void;

  beforeAll(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${API}`;
  });
  afterAll(async () => {
    closeAllStreams();
    await new Promise((resolve) => server.close(resolve));
  });
  beforeEach(() => {
    restoreTimings = setStreamTimings({ heartbeatMs: 100 });
  });
  afterEach(() => {
    closeAllStreams();
    restoreTimings();
  });

  /** Opens a stream and collects parsed events. */
  const open = async (user: TestUser) => {
    const controller = new AbortController();
    const res = await fetch(`${base}/notifications/stream`, {
      headers: { Authorization: `Bearer ${user.token}`, "X-Forwarded-For": user.client.ip },
      signal: controller.signal,
    });
    const events: { event: string; data: unknown }[] = [];
    let ended = false;
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let index;
          while ((index = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const event = /^event: (.*)$/m.exec(frame)?.[1];
            const data = /^data: (.*)$/m.exec(frame)?.[1];
            if (event && data) events.push({ event, data: JSON.parse(data) });
          }
        }
      } catch {
        // aborted
      }
      ended = true;
    })();
    const waitFor = async (predicate: () => boolean) => {
      for (let i = 0; i < 100 && !predicate(); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(predicate()).toBe(true);
    };
    await waitFor(() => events.some((e) => e.event === "ready"));
    return { res, events, waitFor, isEnded: () => ended, close: () => controller.abort() };
  };

  it("pushes a user's new notifications to their open stream only", async () => {
    const mallory = await createUser("Mallory");
    const ownerStream = await open(owner);
    const malloryStream = await open(mallory);
    expect(ownerStream.res.headers.get("content-type")).toContain("text/event-stream");
    expect(ownerStream.res.headers.get("content-encoding")).toBeNull();

    await notify({
      recipients: [owner.id],
      workspace: workspaceId,
      type: "POST_PUBLISHED",
      title: "Live now",
      body: "…",
      href: "/content",
    });

    await ownerStream.waitFor(() => ownerStream.events.some((e) => e.event === "notification"));
    expect(ownerStream.events.find((e) => e.event === "notification")!.data).toMatchObject({
      title: "Live now",
      workspaceId,
      read: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(malloryStream.events.some((e) => e.event === "notification")).toBe(false);

    ownerStream.close();
    malloryStream.close();
  });

  it("rejects unauthenticated streams", async () => {
    const res = await fetch(`${base}/notifications/stream`);
    expect(res.status).toBe(401);
  });

  it("closes a stream when the session is revoked", async () => {
    const stream = await open(owner);
    await User.updateOne({ _id: owner.id }, { $inc: { tokenVersion: 1 } });
    await stream.waitFor(() => stream.events.some((e) => e.event === "revoked"));
    await stream.waitFor(() => stream.isEnded());
    await stream.waitFor(() => streamCount() === 0);
  });

  it("keeps notifications stored even with nobody connected", async () => {
    await notify({
      recipients: [owner.id],
      workspace: workspaceId,
      type: "INSIGHTS_READY",
      title: "Stored",
      body: "…",
      href: "/analytics",
    });
    expect(await Notification.countDocuments({ user: owner.id })).toBe(1);
  });
});
