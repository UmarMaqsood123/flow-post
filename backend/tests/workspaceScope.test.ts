import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { WorkspaceMember } from "../src/models/workspaceMember.model";
import { canAssignRole, canManageMember, hasMinimumRole } from "../src/utils/workspaceRoles.util";
import { useTestDatabase } from "./helpers/database";

useTestDatabase();

describe("workspaceScopedPlugin", () => {
  it("throws on queries that don't filter by workspace", async () => {
    const userId = new Types.ObjectId();

    await expect(WorkspaceMember.find({ user: userId }).exec()).rejects.toThrow(/Unscoped find/);
    await expect(WorkspaceMember.findOne({ _id: userId }).exec()).rejects.toThrow(/Unscoped/);
    await expect(WorkspaceMember.countDocuments({ role: "OWNER" }).exec()).rejects.toThrow(
      /Unscoped/,
    );
    await expect(
      WorkspaceMember.updateMany({ user: userId }, { $set: { role: "VIEWER" } }).exec(),
    ).rejects.toThrow(/Unscoped/);
    await expect(WorkspaceMember.deleteMany({}).exec()).rejects.toThrow(/Unscoped/);
  });

  it("allows scoped queries and explicit opt-outs", async () => {
    const workspace = new Types.ObjectId();
    const user = new Types.ObjectId();
    await WorkspaceMember.create({ workspace, user, role: "EDITOR" });

    await expect(WorkspaceMember.find({ workspace }).exec()).resolves.toHaveLength(1);
    await expect(
      WorkspaceMember.find({ user }).setOptions({ skipWorkspaceScope: true }).exec(),
    ).resolves.toHaveLength(1);
  });
});

describe("workspace role policy", () => {
  it("orders roles OWNER > ADMIN > EDITOR > VIEWER", () => {
    expect(hasMinimumRole("OWNER", "ADMIN")).toBe(true);
    expect(hasMinimumRole("ADMIN", "ADMIN")).toBe(true);
    expect(hasMinimumRole("EDITOR", "ADMIN")).toBe(false);
    expect(hasMinimumRole("VIEWER", "EDITOR")).toBe(false);
  });

  it("only lets members manage strictly lower roles (owners manage everyone)", () => {
    expect(canManageMember("OWNER", "OWNER")).toBe(true);
    expect(canManageMember("ADMIN", "EDITOR")).toBe(true);
    expect(canManageMember("ADMIN", "ADMIN")).toBe(false);
    expect(canManageMember("ADMIN", "OWNER")).toBe(false);
  });

  it("only lets members assign roles below their own (owners assign any)", () => {
    expect(canAssignRole("OWNER", "OWNER")).toBe(true);
    expect(canAssignRole("ADMIN", "EDITOR")).toBe(true);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("EDITOR", "VIEWER")).toBe(true);
  });
});
