import mongoose from "mongoose";
import { logger } from "./logger";
import "../models/aiUsage.model";
import "../models/analyticsSnapshot.model";
import "../models/auditLog.model";
import "../models/autopilotEvent.model";
import "../models/autopilotSettings.model";
import "../models/autopilotSlot.model";
import "../models/billingAccount.model";
import "../models/brandProfile.model";
import "../models/contentStrategy.model";
import "../models/file.model";
import "../models/performanceInsightReport.model";
import "../models/post.model";
import "../models/postVersion.model";
import "../models/publishAttempt.model";
import "../models/publishJob.model";
import "../models/refreshToken.model";
import "../models/schedule.model";
import "../models/socialAccount.model";
import "../models/socialConnectionDraft.model";
import "../models/socialOAuthState.model";
import "../models/stripeWebhookEvent.model";
import "../models/user.model";
import "../models/workspace.model";
import "../models/workspaceInvitation.model";
import "../models/workspaceMember.model";

/**
 * Imported for their side effect of registering every model, so index checks
 * see all of them no matter which process runs this.
 */
export const loadAllModels = () => mongoose.modelNames();

/** Indexes each model declares but the database doesn't have yet. */
export const findMissingIndexes = async () => {
  const missing: { model: string; indexes: unknown[] }[] = [];
  for (const model of Object.values(mongoose.models)) {
    const { toCreate } = await model.diffIndexes();
    if (toCreate.length > 0) missing.push({ model: model.modelName, indexes: toCreate });
  }
  return missing;
};

/**
 * Creates declared indexes that don't exist. Never drops anything, so it's
 * safe to run on every deploy.
 */
export const createMissingIndexes = async () => {
  for (const model of Object.values(mongoose.models)) {
    await model.createIndexes();
  }
};

/**
 * Production doesn't build indexes automatically (a build on a large collection
 * shouldn't start by surprise on boot), but correctness depends on several of
 * them: unique webhook event ids, one live schedule per post, one billing
 * account per user, TTLs that expire tokens. Refuse to run without them.
 */
export const assertIndexesPresent = async () => {
  const missing = await findMissingIndexes();
  if (missing.length === 0) return;
  logger.fatal(
    { missing: missing.map((item) => ({ model: item.model, count: item.indexes.length })) },
    "Database indexes are missing. Run `npm run db:indexes` (or `node dist/scripts/syncIndexes.js`) before starting.",
  );
  throw new Error("Database indexes are missing");
};
