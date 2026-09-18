import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { UserRole } from "../src/constants/auth.constant";
import { ContactMessage } from "../src/models/contactMessage.model";
import { User } from "../src/models/user.model";
import { app } from "./helpers/client";
import { useTestDatabase } from "./helpers/database";
import { API, call, createUser, type TestUser } from "./helpers/workspace";

useTestDatabase();

let ipCounter = 0;
const send = (body: object, ip = `172.16.0.${++ipCounter}`) =>
  request(app).post(`${API}/contact`).set("X-Forwarded-For", ip).send(body);

const validMessage = {
  name: "Sam Sender",
  email: "Sam@Example.com",
  topic: "SUPPORT",
  message: "My LinkedIn post didn't publish this morning.",
};

describe("POST /contact", () => {
  it("stores the message without needing to sign in", async () => {
    const res = await send(validMessage).expect(201);
    expect(res.body.success).toBe(true);

    const stored = await ContactMessage.find().lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      name: "Sam Sender",
      email: "sam@example.com",
      topic: "SUPPORT",
      status: "NEW",
      user: null,
    });
    expect(stored[0].ip).toBeTruthy();
  });

  it("links the message to an existing account with the same email", async () => {
    const member = await createUser("Mia Member");
    await send({ ...validMessage, email: member.email }).expect(201);
    const stored = await ContactMessage.findOne().lean();
    expect(stored?.user?.toString()).toBe(member.id);
  });

  it("rejects missing or too-short fields with field errors", async () => {
    const res = await send({ name: "", email: "nope", topic: "WHATEVER", message: "hi" });
    expect(res.status).toBe(422);
    expect(await ContactMessage.countDocuments()).toBe(0);
  });

  it("rejects unknown fields", async () => {
    await send({ ...validMessage, status: "RESOLVED" }).expect(422);
  });

  it("pretends to accept honeypot submissions but doesn't store them", async () => {
    await send({ ...validMessage, website: "http://spam.example" }).expect(201);
    expect(await ContactMessage.countDocuments()).toBe(0);
  });

  it("rate limits repeated messages from one address", async () => {
    const ip = "172.16.99.1";
    for (let i = 0; i < 5; i += 1) await send(validMessage, ip).expect(201);
    await send(validMessage, ip).expect(429);
  });
});

describe("admin contact inbox", () => {
  let admin: TestUser;
  let member: TestUser;

  beforeEach(async () => {
    admin = await createUser("Ada Admin");
    await User.updateOne({ _id: admin.id }, { role: UserRole.SUPER_ADMIN });
    member = await createUser("Mia Member");
    await send(validMessage).expect(201);
    await send({ ...validMessage, name: "Bea Billing", topic: "BILLING" }).expect(201);
  });

  it("lists messages newest first with an unread count", async () => {
    const res = await call(admin, "get", "/admin/contact-messages").expect(200);
    const data = res.body.data;
    expect(data.total).toBe(2);
    expect(data.unread).toBe(2);
    expect(data.items[0].name).toBe("Bea Billing");
    expect(data.items[0]).not.toHaveProperty("ip");
  });

  it("filters by topic, status and search", async () => {
    const byTopic = await call(admin, "get", "/admin/contact-messages?topic=BILLING").expect(200);
    expect(byTopic.body.data.items.map((m: { name: string }) => m.name)).toEqual(["Bea Billing"]);

    const bySearch = await call(admin, "get", "/admin/contact-messages?q=linkedin").expect(200);
    expect(bySearch.body.data.total).toBe(2);

    const resolved = await call(admin, "get", "/admin/contact-messages?status=RESOLVED").expect(
      200,
    );
    expect(resolved.body.data.total).toBe(0);
  });

  it("updates status and note, recording who handled it", async () => {
    const [message] = await ContactMessage.find({ topic: "SUPPORT" }).lean();
    const res = await call(admin, "patch", `/admin/contact-messages/${message._id}`, {
      status: "RESOLVED",
      adminNote: "Reconnected their LinkedIn account.",
    }).expect(200);
    expect(res.body.data).toMatchObject({
      status: "RESOLVED",
      adminNote: "Reconnected their LinkedIn account.",
      handledByEmail: admin.email,
    });
    expect(res.body.data.handledAt).toBeTruthy();

    const reopened = await call(admin, "patch", `/admin/contact-messages/${message._id}`, {
      status: "NEW",
    }).expect(200);
    expect(reopened.body.data).toMatchObject({
      status: "NEW",
      handledByEmail: null,
      handledAt: null,
    });
  });

  it("returns 404 for a message that doesn't exist", async () => {
    await call(admin, "patch", "/admin/contact-messages/65a1b2c3d4e5f6a7b8c9d0e1", {
      status: "RESOLVED",
    }).expect(404);
  });

  it("hides the inbox from anyone who isn't a super admin", async () => {
    await call(member, "get", "/admin/contact-messages").expect(404);
    const [message] = await ContactMessage.find().lean();
    await call(member, "patch", `/admin/contact-messages/${message._id}`, {
      status: "RESOLVED",
    }).expect(404);
  });
});
