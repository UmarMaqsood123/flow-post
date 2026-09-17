/**
 * Background worker process entrypoint. Runs separately from the API
 * (`npm run dev:worker`) so heavy jobs (AI generation, publishing) never
 * block HTTP requests and can be scaled independently.
 */
import { connectDatabase, disconnectDatabase } from "./config/database";
import { env, isProduction } from "./config/env";
import { assertIndexesPresent, loadAllModels } from "./config/indexes";
import { logger } from "./config/logger";
import { connectRedis, disconnectRedis } from "./config/redis";
import { closeQueues } from "./queues";
import { createRedisBus, setNotificationBus } from "./realtime/notificationBus";
import { collectDueAnalytics } from "./services/analytics.service";
import { runAutopilotSweep } from "./services/autopilot.service";
import { reconcileSubscriptions } from "./services/billing.service";
import { generateDueReports } from "./services/performanceInsights.service";
import { recoverPublishing } from "./services/publishing.service";
import { registerGracefulShutdown } from "./utils/gracefulShutdown.util";
import { closeWorkers, getWorkerCount, getWorkers, registerWorkers } from "./workers";

const bootstrap = async () => {
  await Promise.all([connectDatabase(), connectRedis()]);
  if (isProduction) {
    loadAllModels();
    await assertIndexesPresent();
  }

  // Publish-only: notifications created here are delivered by the API instances.
  setNotificationBus(createRedisBus());

  registerWorkers();
  for (const worker of getWorkers()) {
    worker.on("stalled", (jobId) =>
      logger.warn({ jobId }, "Publish job stalled; BullMQ will retry it"),
    );
  }
  logger.info({ workers: getWorkerCount() }, "Worker process started");

  // Picks up anything a crash or a lost Redis left behind, then keeps watching.
  const sweep = () => {
    void recoverPublishing()
      .then(({ requeued, failed }) => {
        if (requeued > 0 || failed > 0) {
          logger.warn({ requeued, failed }, "Publishing recovery finished");
        }
      })
      .catch((error: unknown) => logger.error({ err: error }, "Publishing recovery failed"));
  };
  sweep();
  const recoveryTimer = setInterval(sweep, env.PUBLISH_RECOVERY_INTERVAL_MS);
  recoveryTimer.unref();

  // Metrics are read on a slow loop: platforms update their numbers roughly
  // daily, so polling harder only spends rate limit.
  // Collection walks every workspace and can outlast its interval; never run two at once.
  let collecting = false;
  const collect = () => {
    if (collecting) return;
    collecting = true;
    void collectDueAnalytics()
      .then(({ workspaces, collected, failed }) => {
        if (workspaces > 0) {
          logger.info({ workspaces, collected, failed }, "Analytics collection finished");
        }
      })
      .catch((error: unknown) => logger.error({ err: error }, "Analytics collection failed"))
      // Weekly insights read the metrics just collected. Each workspace gets one
      // automatic report per week, so later ticks in the same week do nothing.
      .then(() => generateDueReports())
      .then(({ generated }) => {
        if (generated > 0) logger.info({ generated }, "Weekly insight reports generated");
      })
      .catch((error: unknown) => logger.error({ err: error }, "Weekly insight reports failed"))
      .finally(() => {
        collecting = false;
      });
  };
  collect();
  const analyticsTimer = setInterval(collect, env.ANALYTICS_COLLECTION_INTERVAL_MS);
  analyticsTimer.unref();

  // Autopilot plans and writes posts on its own loop. Overlapping runs are
  // skipped: a long AI call shouldn't stack a second sweep on top of it.
  let autopilotRunning = false;
  const autopilot = () => {
    if (autopilotRunning) return;
    autopilotRunning = true;
    void runAutopilotSweep()
      .then(({ processed }) => {
        if (processed > 0) logger.info({ processed }, "Autopilot sweep finished");
      })
      .catch((error: unknown) => logger.error({ err: error }, "Autopilot sweep failed"))
      .finally(() => {
        autopilotRunning = false;
      });
  };
  autopilot();
  const autopilotTimer = setInterval(autopilot, env.AUTOPILOT_SWEEP_INTERVAL_MS);
  autopilotTimer.unref();

  // Webhooks keep subscriptions current; this catches any that were missed.
  const reconcile = () => {
    void reconcileSubscriptions()
      .then(({ synced, failed }) => {
        if (synced > 0 || failed > 0) logger.info({ synced, failed }, "Subscriptions reconciled");
      })
      .catch((error: unknown) => logger.error({ err: error }, "Subscription reconcile failed"));
  };
  const billingTimer = setInterval(reconcile, env.BILLING_SYNC_INTERVAL_MS);
  billingTimer.unref();

  registerGracefulShutdown(
    "Worker",
    async () => {
      clearInterval(billingTimer);
      clearInterval(autopilotTimer);
      clearInterval(analyticsTimer);
      clearInterval(recoveryTimer);
      await closeWorkers();
      await closeQueues();
      await Promise.all([disconnectRedis(), disconnectDatabase()]);
    },
    { timeoutMs: env.WORKER_SHUTDOWN_TIMEOUT_MS },
  );
};

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, "Failed to start worker process");
  process.exit(1);
});
