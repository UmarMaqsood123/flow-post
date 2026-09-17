/* eslint-disable no-console -- a command-line script reports to the terminal. */
/**
 * Grants or removes the SUPER_ADMIN role. Deliberately not an API: only someone
 * with access to the server and its database can create an admin.
 *
 *   npm run admin:grant -- person@example.com
 *   npm run admin:revoke -- person@example.com
 *   (built: node dist/scripts/superAdmin.js grant person@example.com)
 *
 * Every change writes an AuditLog record with source CLI.
 */
import { hostname, userInfo } from "node:os";
import { connectDatabase, disconnectDatabase } from "../config/database";
import { UserRole } from "../constants/auth.constant";
import { User } from "../models/user.model";
import * as AuditService from "../services/audit.service";

const [command, rawEmail] = process.argv.slice(2);

const main = async () => {
  if ((command !== "grant" && command !== "revoke") || !rawEmail) {
    console.error("Usage: superAdmin <grant|revoke> <email>");
    process.exitCode = 1;
    return;
  }
  const email = rawEmail.trim().toLowerCase();
  await connectDatabase();
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`No user with the email ${email}`);
      process.exitCode = 1;
      return;
    }
    const role = command === "grant" ? UserRole.SUPER_ADMIN : UserRole.USER;
    if (user.role === role) {
      console.log(`${email} already has the ${role} role. Nothing changed.`);
      return;
    }
    const previousRole = user.role;
    await User.updateOne({ _id: user._id }, { $set: { role } });
    await AuditService.record({
      action: command === "grant" ? "SUPER_ADMIN_GRANTED" : "SUPER_ADMIN_REVOKED",
      actor: null,
      targetType: "USER",
      targetId: user._id,
      targetLabel: email,
      metadata: { previousRole, role, host: hostname(), osUser: userInfo().username },
      source: "CLI",
    });
    console.log(`${email} is now ${role}.`);
  } finally {
    await disconnectDatabase();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
