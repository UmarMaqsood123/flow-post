import { describe, expect, it } from "vitest";
import { WorkspaceInvitation } from "../src/models/workspaceInvitation.model";
import { WorkspaceMember } from "../src/models/workspaceMember.model";
import { Workspace } from "../src/models/workspace.model";
import { useTestDatabase } from "./helpers/database";
import {
  addMember,
  call,
  createUser,
  createWorkspace,
  getMemberId,
  inviteAndGetToken,
  latestEmail,
  type TestUser,
} from "./helpers/workspace";

useTestDatabase();

const expectNotFound = (res: { status: number; body: { error: { code: string } } }) => {
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe("NOT_FOUND");
};

/** Two independent tenants: Alice owns workspace A, Bob owns workspace B. */
const setupTwoTenants = async () => {
  const alice = await createUser("Alice");
  const bob = await createUser("Bob");
  const aliceWorkspace = await createWorkspace(alice, { name: "Alice Co" });
  const bobWorkspace = await createWorkspace(bob, { name: "Bob Co" });
  return { alice, bob, aliceWorkspace, bobWorkspace };
};

describe("Workspace CRUD", () => {
  it("creates a workspace with the creator as OWNER and makes it active", async () => {
    const alice = await createUser("Alice");
    const res = await call(alice, "post", "/workspaces", {
      name: "  Acme Marketing  ",
      logo: "https://cdn.example.com/logo.png",
      website: "https://acme.example.com",
      industry: "Retail",
      description: "Social for Acme",
      timezone: "America/New_York",
    }).expect(201);

    expect(res.body.data.role).toBe("OWNER");
    expect(res.body.data.workspace).toMatchObject({
      name: "Acme Marketing",
      industry: "Retail",
      timezone: "America/New_York",
      status: "active",
      createdBy: alice.id,
    });

    const list = await call(alice, "get", "/workspaces").expect(200);
    expect(list.body.data.workspaces).toHaveLength(1);
    expect(list.body.data.activeWorkspaceId).toBe(res.body.data.workspace.id);
  });

  it("validates input", async () => {
    const alice = await createUser("Alice");
    const res = await call(alice, "post", "/workspaces", {
      name: "A",
      logo: "javascript:alert(1)",
      website: "not a url",
      industry: "Space piracy",
      timezone: "Mars/Olympus_Mons",
    }).expect(422);

    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(
      expect.arrayContaining(["name", "logo", "website", "industry", "timezone"]),
    );
  });

  it("ignores server-controlled fields (no mass assignment)", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const created = await call(alice, "post", "/workspaces", {
      name: "Alice Co",
      createdBy: bob.id,
      status: "archived",
    }).expect(201);
    expect(created.body.data.workspace.createdBy).toBe(alice.id);
    expect(created.body.data.workspace.status).toBe("active");

    const workspaceId = created.body.data.workspace.id;
    await call(alice, "patch", `/workspaces/${workspaceId}`, {
      description: "Updated",
      createdBy: bob.id,
      status: "archived",
    }).expect(200);

    const stored = await Workspace.findById(workspaceId);
    expect(stored?.createdBy.toString()).toBe(alice.id);
    expect(stored?.status).toBe("active");
    expect(stored?.description).toBe("Updated");
  });

  it("switches the active workspace", async () => {
    const alice = await createUser("Alice");
    const first = await createWorkspace(alice, { name: "First" });
    await createWorkspace(alice, { name: "Second" });

    await call(alice, "post", `/workspaces/${first.id}/switch`).expect(200);
    const list = await call(alice, "get", "/workspaces").expect(200);
    expect(list.body.data.activeWorkspaceId).toBe(first.id);
  });
});

describe("Tenant isolation: User A cannot access User B's workspace", () => {
  it("returns 404 for every workspace-scoped endpoint and changes nothing", async () => {
    const { alice, bob, aliceWorkspace } = await setupTwoTenants();
    const base = `/workspaces/${aliceWorkspace.id}`;

    expectNotFound(await call(bob, "get", base));
    expectNotFound(await call(bob, "patch", base, { name: "Hijacked by Bob" }));
    expectNotFound(await call(bob, "delete", base));
    expectNotFound(await call(bob, "post", `${base}/restore`));
    expectNotFound(await call(bob, "post", `${base}/switch`));
    expectNotFound(await call(bob, "get", `${base}/members`));
    expectNotFound(await call(bob, "get", `${base}/invitations`));
    expectNotFound(
      await call(bob, "post", `${base}/invitations`, { email: bob.email, role: "ADMIN" }),
    );

    const aliceMemberId = await getMemberId(alice, aliceWorkspace.id, alice);
    expectNotFound(
      await call(bob, "patch", `${base}/members/${aliceMemberId}`, { role: "VIEWER" }),
    );
    expectNotFound(await call(bob, "delete", `${base}/members/${aliceMemberId}`));

    // Nothing changed for Alice.
    const aliceView = await call(alice, "get", base).expect(200);
    expect(aliceView.body.data.workspace).toMatchObject({ name: "Alice Co", status: "active" });
    expect(aliceView.body.data.role).toBe("OWNER");
    expect(await WorkspaceMember.countDocuments({ workspace: aliceWorkspace.id })).toBe(1);
    expect(await WorkspaceInvitation.countDocuments({ workspace: aliceWorkspace.id })).toBe(0);
  });

  it("does not list or switch to another tenant's workspace", async () => {
    const { bob, aliceWorkspace, bobWorkspace } = await setupTwoTenants();

    const list = await call(bob, "get", "/workspaces").expect(200);
    const ids = (list.body.data.workspaces as { workspace: { id: string } }[]).map(
      (w) => w.workspace.id,
    );
    expect(ids).toEqual([bobWorkspace.id]);

    expectNotFound(await call(bob, "post", `/workspaces/${aliceWorkspace.id}/switch`));
    const after = await call(bob, "get", "/workspaces").expect(200);
    expect(after.body.data.activeWorkspaceId).toBe(bobWorkspace.id);
  });

  it("rejects A's member and invitation ids smuggled through B's own workspace", async () => {
    const { alice, bob, aliceWorkspace, bobWorkspace } = await setupTwoTenants();
    const carol = await createUser("Carol");
    const aliceMemberId = await getMemberId(alice, aliceWorkspace.id, alice);
    const { invitationId } = await inviteAndGetToken(
      alice,
      aliceWorkspace.id,
      carol.email,
      "EDITOR",
    );

    // Bob is OWNER of his own workspace — but these ids belong to Alice's workspace.
    const bobBase = `/workspaces/${bobWorkspace.id}`;
    expectNotFound(
      await call(bob, "patch", `${bobBase}/members/${aliceMemberId}`, { role: "VIEWER" }),
    );
    expectNotFound(await call(bob, "delete", `${bobBase}/members/${aliceMemberId}`));
    expectNotFound(await call(bob, "delete", `${bobBase}/invitations/${invitationId}`));

    const aliceMembership = await WorkspaceMember.findOne({
      _id: aliceMemberId,
      workspace: aliceWorkspace.id,
    });
    expect(aliceMembership?.role).toBe("OWNER");
    const invitation = await WorkspaceInvitation.findOne({
      _id: invitationId,
      workspace: aliceWorkspace.id,
    });
    expect(invitation?.status).toBe("pending");
  });

  it("returns 404 for malformed and non-existent workspace ids", async () => {
    const alice = await createUser("Alice");
    expectNotFound(await call(alice, "get", "/workspaces/not-an-id"));
    expectNotFound(await call(alice, "get", "/workspaces/507f1f77bcf86cd799439011"));
    expectNotFound(await call(alice, "get", "/workspaces/%24where"));
  });

  it("cannot accept an invitation addressed to someone else", async () => {
    const { alice, bob, aliceWorkspace } = await setupTwoTenants();
    const carol = await createUser("Carol");
    const { token } = await inviteAndGetToken(alice, aliceWorkspace.id, carol.email, "ADMIN");

    const hijack = await call(bob, "post", "/workspaces/invitations/accept", { token }).expect(403);
    expect(hijack.body.message).toMatch(/different email/);
    expectNotFound(await call(bob, "get", `/workspaces/${aliceWorkspace.id}`));

    // The invitation still works for Carol.
    await call(carol, "post", "/workspaces/invitations/accept", { token }).expect(200);
    await call(carol, "get", `/workspaces/${aliceWorkspace.id}`).expect(200);
  });

  it("revokes access immediately when a member is removed", async () => {
    const { alice, bob, aliceWorkspace } = await setupTwoTenants();
    const bobMemberId = await addMember(alice, aliceWorkspace.id, bob, "EDITOR");

    await call(bob, "get", `/workspaces/${aliceWorkspace.id}`).expect(200);
    await call(alice, "delete", `/workspaces/${aliceWorkspace.id}/members/${bobMemberId}`).expect(
      200,
    );

    // Same (still valid) access token — access is re-checked on every request.
    expectNotFound(await call(bob, "get", `/workspaces/${aliceWorkspace.id}`));
    expectNotFound(await call(bob, "get", `/workspaces/${aliceWorkspace.id}/members`));
  });
});

describe("Workspace roles", () => {
  const setupTeam = async () => {
    const owner = await createUser("Olivia Owner");
    const admin = await createUser("Adam Admin");
    const editor = await createUser("Eddie Editor");
    const viewer = await createUser("Vera Viewer");
    const workspace = await createWorkspace(owner, { name: "Team Co" });
    const ids = {
      owner: await getMemberId(owner, workspace.id, owner),
      admin: await addMember(owner, workspace.id, admin, "ADMIN"),
      editor: await addMember(owner, workspace.id, editor, "EDITOR"),
      viewer: await addMember(owner, workspace.id, viewer, "VIEWER"),
    };
    return { owner, admin, editor, viewer, workspace, ids, base: `/workspaces/${workspace.id}` };
  };

  it("VIEWER and EDITOR can read but cannot manage the workspace", async () => {
    const { editor, viewer, base, ids } = await setupTeam();

    for (const user of [viewer, editor]) {
      await call(user, "get", base).expect(200);
      await call(user, "get", `${base}/members`).expect(200);
      await call(user, "patch", base, { name: "Nope" }).expect(403);
      await call(user, "get", `${base}/invitations`).expect(403);
      await call(user, "post", `${base}/invitations`, {
        email: "x@example.com",
        role: "VIEWER",
      }).expect(403);
      await call(user, "patch", `${base}/members/${ids.viewer}`, { role: "EDITOR" }).expect(403);
    }
    // An editor can't remove other members even if they rank lower.
    await call(editor, "delete", `${base}/members/${ids.viewer}`).expect(403);
  });

  it("ADMIN can manage settings and lower roles, but not admins, owners or the workspace itself", async () => {
    const { admin, base, ids } = await setupTeam();

    await call(admin, "patch", base, { description: "Admin was here" }).expect(200);
    await call(admin, "post", `${base}/invitations`, {
      email: "new@example.com",
      role: "EDITOR",
    }).expect(201);
    await call(admin, "patch", `${base}/members/${ids.viewer}`, { role: "EDITOR" }).expect(200);

    await call(admin, "post", `${base}/invitations`, {
      email: "boss@example.com",
      role: "ADMIN",
    }).expect(403);
    await call(admin, "patch", `${base}/members/${ids.editor}`, { role: "ADMIN" }).expect(403);
    await call(admin, "patch", `${base}/members/${ids.owner}`, { role: "VIEWER" }).expect(403);
    await call(admin, "delete", `${base}/members/${ids.owner}`).expect(403);
    await call(admin, "patch", `${base}/members/${ids.admin}`, { role: "OWNER" }).expect(403);
    await call(admin, "delete", base).expect(403);
  });

  it("OWNER can promote to owner; the last owner can't leave or be demoted", async () => {
    const { owner, admin, base, ids } = await setupTeam();

    const soleOwnerLeave = await call(owner, "delete", `${base}/members/${ids.owner}`).expect(409);
    expect(soleOwnerLeave.body.message).toMatch(/only owner/);
    await call(owner, "patch", `${base}/members/${ids.owner}`, { role: "ADMIN" }).expect(409);

    await call(owner, "patch", `${base}/members/${ids.admin}`, { role: "OWNER" }).expect(200);
    // With two owners, the original owner can step down and the new owner can manage them.
    await call(owner, "patch", `${base}/members/${ids.owner}`, { role: "ADMIN" }).expect(200);
    await call(admin, "delete", `${base}/members/${ids.owner}`).expect(200);
  });

  it("any member can leave the workspace", async () => {
    const { viewer, base, ids } = await setupTeam();
    await call(viewer, "delete", `${base}/members/${ids.viewer}`).expect(200);
    expectNotFound(await call(viewer, "get", base));
  });
});

describe("Workspace invitations", () => {
  it("accepting joins with the invited role and the link is single-use", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const workspace = await createWorkspace(alice);

    const { token } = await inviteAndGetToken(alice, workspace.id, bob.email, "EDITOR");
    const email = await latestEmail(bob.email, "invited you");
    expect(email.text).toContain("http://localhost:5173/invitations/accept?token=");

    const preview = await call(bob, "get", `/workspaces/invitations/preview?token=${token}`).expect(
      200,
    );
    expect(preview.body.data.invitation).toMatchObject({ role: "EDITOR", emailMatches: true });

    const accepted = await call(bob, "post", "/workspaces/invitations/accept", { token }).expect(
      200,
    );
    expect(accepted.body.data.role).toBe("EDITOR");
    const list = await call(bob, "get", "/workspaces").expect(200);
    expect(list.body.data.activeWorkspaceId).toBe(workspace.id);

    await call(bob, "post", "/workspaces/invitations/accept", { token }).expect(400);
  });

  it("lists pending invitations, replaces re-invites and honours revocation", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const workspace = await createWorkspace(alice);
    const base = `/workspaces/${workspace.id}`;

    const first = await inviteAndGetToken(alice, workspace.id, bob.email, "VIEWER");
    const second = await inviteAndGetToken(alice, workspace.id, bob.email, "EDITOR");
    expect(second.token).not.toBe(first.token);

    const pending = await call(alice, "get", `${base}/invitations`).expect(200);
    expect(pending.body.data.invitations).toHaveLength(1);
    expect(pending.body.data.invitations[0]).toMatchObject({ email: bob.email, role: "EDITOR" });

    await call(bob, "post", "/workspaces/invitations/accept", { token: first.token }).expect(400);
    await call(alice, "delete", `${base}/invitations/${second.invitationId}`).expect(200);
    await call(bob, "post", "/workspaces/invitations/accept", { token: second.token }).expect(400);
  });

  it("rejects expired invitations, unverified accounts and existing members", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const unverified = await createUser("Uma", { verified: false });
    const workspace = await createWorkspace(alice);

    const expired = await inviteAndGetToken(alice, workspace.id, bob.email, "VIEWER");
    await WorkspaceInvitation.updateOne(
      { _id: expired.invitationId, workspace: workspace.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await call(bob, "post", "/workspaces/invitations/accept", { token: expired.token }).expect(400);

    const forUnverified = await inviteAndGetToken(alice, workspace.id, unverified.email, "VIEWER");
    const res = await call(unverified, "post", "/workspaces/invitations/accept", {
      token: forUnverified.token,
    }).expect(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");

    await addMember(alice, workspace.id, bob, "VIEWER");
    await call(alice, "post", `/workspaces/${workspace.id}/invitations`, {
      email: bob.email,
      role: "EDITOR",
    }).expect(409);
  });
});

describe("Archive and restore", () => {
  it("archived workspaces are inaccessible until an owner restores them", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const workspace = await createWorkspace(alice);
    const base = `/workspaces/${workspace.id}`;
    await addMember(alice, workspace.id, bob, "ADMIN");
    const { token } = await inviteAndGetToken(alice, workspace.id, "later@example.com", "VIEWER");

    await call(alice, "delete", base).expect(200);

    expectNotFound(await call(alice, "get", base));
    expectNotFound(await call(bob, "get", `${base}/members`));
    const bobList = await call(bob, "get", "/workspaces").expect(200);
    expect(bobList.body.data.workspaces).toHaveLength(0);
    expect(bobList.body.data.activeWorkspaceId).toBeNull();

    // Pending invitations were revoked.
    const revoked = await WorkspaceInvitation.findOne({
      workspace: workspace.id,
      email: "later@example.com",
    });
    expect(revoked?.status).toBe("revoked");
    expect(token).toBeTruthy();

    // Owners still see it and can restore; admins can't.
    const aliceList = await call(alice, "get", "/workspaces").expect(200);
    expect(aliceList.body.data.workspaces[0].workspace.status).toBe("archived");
    await call(bob, "post", `${base}/restore`).expect(403);
    await call(alice, "post", `${base}/restore`).expect(200);
    await call(bob, "get", base).expect(200);
  });
});

describe("Permanent deletion", () => {
  it("owner can delete an archived workspace after confirming its name; all data is removed", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const workspace = await createWorkspace(alice, { name: "Doomed Co" });
    const base = `/workspaces/${workspace.id}`;
    await addMember(alice, workspace.id, bob, "ADMIN");
    await inviteAndGetToken(alice, workspace.id, "pending@example.com", "VIEWER");

    // Must be archived first.
    await call(alice, "delete", `${base}/permanent`, { confirmName: "Doomed Co" }).expect(409);
    await call(alice, "delete", base).expect(200);

    // Admins can't, and the name must match exactly.
    await call(bob, "delete", `${base}/permanent`, { confirmName: "Doomed Co" }).expect(403);
    const mismatch = await call(alice, "delete", `${base}/permanent`, {
      confirmName: "doomed co",
    }).expect(400);
    expect(mismatch.body.error.details[0].path).toBe("confirmName");

    await call(alice, "delete", `${base}/permanent`, { confirmName: "Doomed Co" }).expect(200);

    expect(await Workspace.countDocuments({ _id: workspace.id })).toBe(0);
    expect(await WorkspaceMember.countDocuments({ workspace: workspace.id })).toBe(0);
    expect(await WorkspaceInvitation.countDocuments({ workspace: workspace.id })).toBe(0);
    expectNotFound(await call(alice, "post", `${base}/restore`));
    const list = await call(alice, "get", "/workspaces").expect(200);
    expect(list.body.data.workspaces).toHaveLength(0);
  });

  it("another tenant cannot delete someone else's workspace", async () => {
    const { alice, bob, aliceWorkspace } = await setupTwoTenants();
    const base = `/workspaces/${aliceWorkspace.id}`;
    await call(alice, "delete", base).expect(200);

    expectNotFound(await call(bob, "delete", `${base}/permanent`, { confirmName: "Alice Co" }));
    expect(await Workspace.countDocuments({ _id: aliceWorkspace.id })).toBe(1);
  });
});

export type { TestUser };
