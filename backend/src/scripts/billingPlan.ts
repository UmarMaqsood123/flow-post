/* eslint-disable no-console -- a command-line script reports to the terminal. */
/**
 * Grants a paid plan to an account without Stripe (complimentary access,
 * partners, local testing), or removes it. Deliberately not an API.
 *
 *   npm run billing:plan -- show  person@example.com
 *   npm run billing:plan -- grant person@example.com PRO [--days 30] [--reason "Beta partner"]
 *   npm run billing:plan -- revoke person@example.com
 *
 * The plan applies to every workspace the person pays for, only while it's
 * higher than their Stripe plan. Every change writes an AuditLog record with source CLI.
 */
import { hostname, userInfo } from "node:os";
import { parseArgs } from "node:util";
import { connectDatabase, disconnectDatabase } from "../config/database";
import { PAID_PLANS, type PaidPlanValue } from "../constants/billing.constant";
import { BillingAccount } from "../models/billingAccount.model";
import { User } from "../models/user.model";
import * as AuditService from "../services/audit.service";
import { resolvePlan } from "../services/entitlement.service";

const USAGE =
  "Usage: billing:plan <show|grant|revoke> <email> [PLAN] [--days N] [--reason text]\n" +
  `Plans: ${PAID_PLANS.join(", ")}`;

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: { days: { type: "string" }, reason: { type: "string" } },
});
const [command, rawEmail, rawPlan] = positionals;

const describe = (account: Parameters<typeof resolvePlan>[0]) => {
  const { plan, reason } = resolvePlan(account);
  const override = account?.planOverride;
  const granted = override
    ? `${override.plan}${override.expiresAt ? ` until ${override.expiresAt.toISOString()}` : " (no expiry)"}`
    : "none";
  return `Effective plan: ${plan} (${reason.replaceAll("_", " ")}). Stripe: ${
    account?.subscription
      ? `${account.subscription.plan ?? "unknown"} ${account.subscription.status}`
      : "none"
  }. Granted plan: ${granted}.`;
};

const main = async () => {
  if (!command || !["show", "grant", "revoke"].includes(command) || !rawEmail) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const plan = rawPlan?.toUpperCase() as PaidPlanValue | undefined;
  if (command === "grant" && (!plan || !PAID_PLANS.includes(plan))) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const days = values.days === undefined ? null : Number(values.days);
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
    console.error("--days must be a whole number from 1 to 3650");
    process.exitCode = 1;
    return;
  }
  const reason = values.reason?.trim().slice(0, 300) || null;

  const email = rawEmail.trim().toLowerCase();
  await connectDatabase();
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`No user with the email ${email}`);
      process.exitCode = 1;
      return;
    }
    const existing = await BillingAccount.findOne({ user: user._id });

    if (command === "show") {
      console.log(`${email}: ${describe(existing)}`);
      return;
    }

    if (command === "revoke") {
      if (!existing?.planOverride) {
        console.log(`${email} has no granted plan. Nothing changed.`);
        return;
      }
      const previous = existing.planOverride;
      const updated = await BillingAccount.findOneAndUpdate(
        { _id: existing._id },
        { $set: { planOverride: null } },
        { returnDocument: "after" },
      );
      await AuditService.record({
        action: "PLAN_OVERRIDE_REVOKED",
        actor: null,
        targetType: "USER",
        targetId: user._id,
        targetLabel: email,
        reason,
        metadata: { previousPlan: previous.plan, host: hostname(), osUser: userInfo().username },
        source: "CLI",
      });
      console.log(`Removed the granted ${previous.plan} plan from ${email}. ${describe(updated)}`);
      return;
    }

    const now = new Date();
    const planOverride = {
      plan: plan as PaidPlanValue,
      expiresAt: days === null ? null : new Date(now.getTime() + days * 86_400_000),
      reason,
      grantedAt: now,
    };
    // Atomic upsert: the account may not exist yet (never opened Checkout), and
    // Stripe syncs change other fields concurrently.
    const updated = await BillingAccount.findOneAndUpdate(
      { user: user._id },
      { $set: { planOverride }, $setOnInsert: { user: user._id } },
      { upsert: true, returnDocument: "after" },
    );
    await AuditService.record({
      action: "PLAN_OVERRIDE_GRANTED",
      actor: null,
      targetType: "USER",
      targetId: user._id,
      targetLabel: email,
      reason,
      metadata: {
        plan: planOverride.plan,
        expiresAt: planOverride.expiresAt?.toISOString() ?? null,
        previousPlan: existing?.planOverride?.plan ?? null,
        host: hostname(),
        osUser: userInfo().username,
      },
      source: "CLI",
    });
    console.log(`Granted ${planOverride.plan} to ${email}. ${describe(updated)}`);
    if (updated && resolvePlan(updated).reason !== "override") {
      console.log("Note: their Stripe plan is the same or higher, so it still applies.");
    }
  } finally {
    await disconnectDatabase();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
