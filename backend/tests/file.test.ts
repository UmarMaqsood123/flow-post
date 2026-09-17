import { readdirSync } from "node:fs";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { StoredFile } from "../src/models/file.model";
import { UPLOAD_TEMP_DIR } from "../src/middlewares/upload.middleware";
import { memoryObjectStore } from "../src/utils/storage.util";
import { app } from "./helpers/client";
import { useTestDatabase } from "./helpers/database";
import {
  addMember,
  API,
  call,
  createUser,
  createWorkspace,
  type TestUser,
} from "./helpers/workspace";

useTestDatabase();

beforeEach(() => {
  memoryObjectStore.clear();
});

// Minimal valid fixtures (magic bytes are what matter).
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5a60000000049454e44ae426082",
  "hex",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const CSV = Buffer.from("name,email\nAda,ada@example.com\n");
const MB = 1024 * 1024;

/** Minimal ISO base-media header (`ftyp` box) — enough for type detection. */
const mp4Header = (brand = "isom") =>
  Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from(`ftyp${brand}`),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from("isomiso2mp41"),
  ]);
const MP4 = Buffer.concat([mp4Header(), Buffer.alloc(256)]);
const WEBM = Buffer.concat([
  Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81,
    0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84,
  ]),
  Buffer.from("webm"),
  Buffer.alloc(128),
]);

interface Fixture {
  buffer: Buffer;
  name: string;
  contentType?: string;
}

const withAuth = (test: request.Test, user: TestUser) =>
  test.set("X-Forwarded-For", user.client.ip).set("Authorization", `Bearer ${user.token}`);

const uploadOne = (user: TestUser, workspaceId: string, file: Fixture) =>
  withAuth(request(app).post(`${API}/workspaces/${workspaceId}/files`), user).attach(
    "file",
    file.buffer,
    { filename: file.name, contentType: file.contentType ?? "application/octet-stream" },
  );

const uploadMany = (user: TestUser, workspaceId: string, files: Fixture[]) => {
  let test = withAuth(request(app).post(`${API}/workspaces/${workspaceId}/files/batch`), user);
  for (const file of files) {
    test = test.attach("files", file.buffer, {
      filename: file.name,
      contentType: file.contentType ?? "application/octet-stream",
    });
  }
  return test;
};

const storedCount = (workspaceId: string) => StoredFile.countDocuments({ workspace: workspaceId });

describe("File uploads", () => {
  it("stores an image under a server-generated key and returns a public URL", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    const res = await uploadOne(alice, workspace.id, {
      buffer: PNG,
      name: "../../Brand Logo.png",
      contentType: "image/png",
    }).expect(201);

    const file = res.body.data.file;
    expect(file).toMatchObject({
      name: "Brand Logo.png",
      mimeType: "image/png",
      kind: "image",
      size: PNG.length,
      uploadedBy: alice.id,
    });
    expect(file.url).toMatch(
      new RegExp(
        `^https://storage\\.flowpost\\.test/workspaces/${workspace.id}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.png$`,
      ),
    );
    expect(file.url).not.toContain("Logo");

    const record = await StoredFile.findOne({ _id: file.id, workspace: workspace.id });
    const stored = memoryObjectStore.get(record!.key);
    expect(stored?.contentType).toBe("image/png");
    expect(stored?.contentDisposition).toMatch(/^inline;/);

    const list = await call(alice, "get", `/workspaces/${workspace.id}/files`).expect(200);
    expect(list.body.data.files).toHaveLength(1);
  });

  it("uploads several documents at once and serves them as downloads", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    const res = await uploadMany(alice, workspace.id, [
      { buffer: PDF, name: "brief.pdf", contentType: "application/pdf" },
      { buffer: CSV, name: "contacts.csv", contentType: "text/csv" },
    ]).expect(201);

    expect(res.body.data.files.map((f: { mimeType: string }) => f.mimeType)).toEqual([
      "application/pdf",
      "text/csv",
    ]);
    for (const object of memoryObjectStore.values()) {
      expect(object.contentDisposition).toMatch(/^attachment;/);
    }

    const images = await call(alice, "get", `/workspaces/${workspace.id}/files?kind=image`).expect(
      200,
    );
    expect(images.body.data.files).toHaveLength(0);
  });

  it("detects the type from file contents, not the name or declared MIME type", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    const fakeImage = await uploadOne(alice, workspace.id, {
      buffer: Buffer.from("<script>alert(1)</script>"),
      name: "photo.png",
      contentType: "image/png",
    }).expect(415);
    expect(fakeImage.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");

    await uploadOne(alice, workspace.id, {
      buffer: Buffer.from("MZ\x90\x00executable"),
      name: "report.pdf",
      contentType: "application/pdf",
    }).expect(415);

    await uploadOne(alice, workspace.id, {
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      name: "logo.svg",
      contentType: "image/svg+xml",
    }).expect(415);

    expect(memoryObjectStore.size).toBe(0);
    expect(await storedCount(workspace.id)).toBe(0);
  });

  it("rejects files over the size limit and empty files", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    const tooLarge = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
    const res = await uploadOne(alice, workspace.id, {
      buffer: tooLarge,
      name: "huge.png",
      contentType: "image/png",
    }).expect(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");

    await uploadOne(alice, workspace.id, { buffer: Buffer.alloc(0), name: "empty.txt" }).expect(
      400,
    );
    expect(memoryObjectStore.size).toBe(0);
  });

  it("treats a batch as all-or-nothing", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    await uploadMany(alice, workspace.id, [
      { buffer: PNG, name: "ok.png" },
      { buffer: Buffer.from("not a pdf"), name: "bad.pdf" },
      { buffer: PDF, name: "ok.pdf" },
    ]).expect(415);

    expect(memoryObjectStore.size).toBe(0);
    expect(await storedCount(workspace.id)).toBe(0);
  });

  it("rejects missing files and too many files", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    await call(alice, "post", `/workspaces/${workspace.id}/files`).expect(400);

    const res = await uploadMany(
      alice,
      workspace.id,
      Array.from({ length: 4 }, (_, index) => ({ buffer: PNG, name: `image-${index}.png` })),
    ).expect(400);
    expect(res.body.message).toMatch(/up to 3 files/);
    expect(memoryObjectStore.size).toBe(0);
  });
});

describe("Media names and descriptions", () => {
  it("stores a name and description, and falls back to the file name without one", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    const named = await uploadOne(alice, workspace.id, { buffer: PNG, name: "IMG_0042.png" })
      .field("name", "  Roastery at sunrise  ")
      .field("description", "Shot for the October launch")
      .expect(201);
    expect(named.body.data.file).toMatchObject({
      name: "Roastery at sunrise",
      fileName: "IMG_0042.png",
      description: "Shot for the October launch",
    });

    // Logo uploads elsewhere send no name, and keep working as before.
    const plain = await uploadOne(alice, workspace.id, { buffer: PNG, name: "logo.png" }).expect(
      201,
    );
    expect(plain.body.data.file).toMatchObject({
      name: "logo.png",
      fileName: "logo.png",
      description: null,
    });
  });

  it("lines up names with files in a batch", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    const res = await uploadMany(alice, workspace.id, [
      { buffer: PDF, name: "a.pdf" },
      { buffer: CSV, name: "b.csv" },
    ])
      .field(
        "metadata",
        JSON.stringify([{ name: "Brand brief" }, { name: "Contacts", description: "Q3 list" }]),
      )
      .expect(201);

    expect(
      res.body.data.files.map((file: { name: string; description: string | null }) => [
        file.name,
        file.description,
      ]),
    ).toEqual([
      ["Brand brief", null],
      ["Contacts", "Q3 list"],
    ]);

    const listed = await call(alice, "get", `/workspaces/${workspace.id}/files`).expect(200);
    expect(listed.body.data.files.map((file: { name: string }) => file.name).sort()).toEqual([
      "Brand brief",
      "Contacts",
    ]);
  });

  it("rejects a name that's too long, and removes the temp file", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    await uploadOne(alice, workspace.id, { buffer: PNG, name: "a.png" })
      .field("name", "x".repeat(121))
      .expect(422);
    await uploadMany(alice, workspace.id, [{ buffer: PDF, name: "a.pdf" }])
      .field("metadata", "not json")
      .expect(422);
    // More names than files is a mistake worth catching, not silently ignoring.
    await uploadMany(alice, workspace.id, [{ buffer: PDF, name: "a.pdf" }])
      .field("metadata", JSON.stringify([{ name: "One" }, { name: "Two" }]))
      .expect(400);

    expect(await storedCount(workspace.id)).toBe(0);
    expect(readdirSync(UPLOAD_TEMP_DIR)).toHaveLength(0);
  });
});

describe("Video uploads", () => {
  it("accepts MP4 and WebM, serves them inline and filters them as videos", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    const res = await uploadMany(alice, workspace.id, [
      { buffer: MP4, name: "launch-teaser.mp4", contentType: "video/mp4" },
      { buffer: WEBM, name: "loop.webm", contentType: "video/webm" },
      { buffer: PNG, name: "still.png" },
    ]).expect(201);

    expect(
      res.body.data.files.map((f: { kind: string; mimeType: string }) => [f.kind, f.mimeType]),
    ).toEqual([
      ["video", "video/mp4"],
      ["video", "video/webm"],
      ["image", "image/png"],
    ]);
    for (const object of memoryObjectStore.values()) {
      expect(object.contentDisposition).toMatch(/^inline;/);
    }

    const videos = await call(alice, "get", `/workspaces/${workspace.id}/files?kind=video`).expect(
      200,
    );
    expect(videos.body.data.files.map((f: { name: string }) => f.name).sort()).toEqual([
      "launch-teaser.mp4",
      "loop.webm",
    ]);
  });

  it("applies a larger size limit to videos than to images and documents", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    // Test config: 1 MB for images/documents, 2 MB for videos.
    const midSizeVideo = Buffer.concat([mp4Header(), Buffer.alloc(Math.round(1.5 * MB))]);
    await uploadOne(alice, workspace.id, { buffer: midSizeVideo, name: "clip.mp4" }).expect(201);

    const midSizeImage = Buffer.concat([PNG, Buffer.alloc(Math.round(1.5 * MB))]);
    const image = await uploadOne(alice, workspace.id, {
      buffer: midSizeImage,
      name: "big.png",
    }).expect(413);
    expect(image.body.message).toMatch(/images and documents is 1 MB/);

    const oversizedVideo = Buffer.concat([mp4Header(), Buffer.alloc(Math.round(2.1 * MB))]);
    const video = await uploadOne(alice, workspace.id, {
      buffer: oversizedVideo,
      name: "long.mp4",
    }).expect(413);
    expect(video.body.error.code).toBe("PAYLOAD_TOO_LARGE");

    expect(await storedCount(workspace.id)).toBe(1);
  });

  it("rejects audio-only files and mislabeled containers", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    await uploadOne(alice, workspace.id, {
      buffer: Buffer.concat([mp4Header("M4A "), Buffer.alloc(64)]),
      name: "song.mp4",
    }).expect(415);
    await uploadOne(alice, workspace.id, { buffer: MP4, name: "movie.exe" }).expect(415);
    await uploadOne(alice, workspace.id, {
      buffer: Buffer.concat([
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
        Buffer.from("matroska"),
        Buffer.alloc(64),
      ]),
      name: "movie.webm",
    }).expect(415);

    expect(memoryObjectStore.size).toBe(0);
  });

  it("writes uploads to temporary files and always removes them", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    await uploadOne(alice, workspace.id, { buffer: MP4, name: "ok.mp4" }).expect(201);
    await uploadOne(alice, workspace.id, { buffer: Buffer.from("nope"), name: "bad.png" }).expect(
      415,
    );
    await uploadOne(alice, workspace.id, {
      buffer: Buffer.concat([mp4Header(), Buffer.alloc(Math.round(2.1 * MB))]),
      name: "huge.mp4",
    }).expect(413);

    expect(readdirSync(UPLOAD_TEMP_DIR)).toHaveLength(0);
  });
});

describe("File permissions", () => {
  it("viewers can list but not upload; uploaders or admins can delete", async () => {
    const owner = await createUser("Olivia Owner");
    const admin = await createUser("Adam Admin");
    const editor = await createUser("Eddie Editor");
    const viewer = await createUser("Vera Viewer");
    const workspace = await createWorkspace(owner);
    await addMember(owner, workspace.id, admin, "ADMIN");
    await addMember(owner, workspace.id, editor, "EDITOR");
    await addMember(owner, workspace.id, viewer, "VIEWER");
    const base = `/workspaces/${workspace.id}/files`;

    await uploadOne(viewer, workspace.id, { buffer: PNG, name: "v.png" }).expect(403);
    await call(viewer, "get", base).expect(200);

    const ownerFile = (
      await uploadOne(owner, workspace.id, { buffer: PNG, name: "o.png" }).expect(201)
    ).body.data.file;
    const editorFile = (
      await uploadOne(editor, workspace.id, { buffer: PDF, name: "e.pdf" }).expect(201)
    ).body.data.file;

    // Editors can't delete other people's files, but can delete their own.
    await call(editor, "delete", `${base}/${ownerFile.id}`).expect(403);
    await call(editor, "delete", `${base}/${editorFile.id}`).expect(200);

    // Admins can delete anyone's file; the stored object goes too.
    await call(admin, "delete", `${base}/${ownerFile.id}`).expect(200);
    expect(memoryObjectStore.size).toBe(0);
    expect(await storedCount(workspace.id)).toBe(0);
  });

  it("requires authentication", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice);

    await request(app)
      .post(`${API}/workspaces/${workspace.id}/files`)
      .attach("file", PNG, { filename: "a.png" })
      .expect(401);
  });
});

describe("File tenant isolation", () => {
  it("User B cannot list, upload to or delete from User A's workspace", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const aliceWorkspace = await createWorkspace(alice, { name: "Alice Co" });
    const bobWorkspace = await createWorkspace(bob, { name: "Bob Co" });
    const aliceFile = (
      await uploadOne(alice, aliceWorkspace.id, { buffer: PNG, name: "secret.png" }).expect(201)
    ).body.data.file;

    await call(bob, "get", `/workspaces/${aliceWorkspace.id}/files`).expect(404);
    await uploadOne(bob, aliceWorkspace.id, { buffer: PNG, name: "intruder.png" }).expect(404);
    await call(bob, "delete", `/workspaces/${aliceWorkspace.id}/files/${aliceFile.id}`).expect(404);

    // Smuggling Alice's file id through Bob's own workspace doesn't work either.
    await call(bob, "delete", `/workspaces/${bobWorkspace.id}/files/${aliceFile.id}`).expect(404);

    const bobList = await call(bob, "get", `/workspaces/${bobWorkspace.id}/files`).expect(200);
    expect(bobList.body.data.files).toHaveLength(0);
    expect(await storedCount(aliceWorkspace.id)).toBe(1);
    expect(memoryObjectStore.size).toBe(1);
  });

  it("permanently deleting a workspace removes its files and stored objects", async () => {
    const alice = await createUser("Alice");
    const workspace = await createWorkspace(alice, { name: "Doomed Co" });
    await uploadMany(alice, workspace.id, [
      { buffer: PNG, name: "a.png" },
      { buffer: PDF, name: "b.pdf" },
    ]).expect(201);
    expect(memoryObjectStore.size).toBe(2);

    await call(alice, "delete", `/workspaces/${workspace.id}`).expect(200);
    await call(alice, "delete", `/workspaces/${workspace.id}/permanent`, {
      confirmName: "Doomed Co",
    }).expect(200);

    expect(await storedCount(workspace.id)).toBe(0);
    expect(memoryObjectStore.size).toBe(0);
  });
});
