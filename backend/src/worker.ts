/**
 * Background worker process entrypoint. Runs separately from the API
 * (`npm run dev:worker`) so heavy jobs (AI generation, publishing) never
 * block HTTP requests and can be scaled independently.
 */
import { connectDatabase, disconnectDatabase } from "./config/database";
import { logger } from "./config/logger";
import { connectRedis, disconnectRedis } from "./config/redis";
import { closeQueues } from "./queues";
import { registerGracefulShutdown } from "./utils/gracefulShutdown.util";
import { closeWorkers, getWorkerCount, registerWorkers } from "./workers";

const bootstrap = async () => {
  await Promise.all([connectDatabase(), connectRedis()]);

  registerWorkers();
  logger.info({ workers: getWorkerCount() }, "Worker process started");

  registerGracefulShutdown("Worker", async () => {
    await closeWorkers();
    await closeQueues();
    await Promise.all([disconnectRedis(), disconnectDatabase()]);
  });
};

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, "Failed to start worker process");
  process.exit(1);
});
