import { createServer } from "node:http";
import { createApp } from "./app";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { env, isProduction } from "./config/env";
import { assertIndexesPresent, loadAllModels } from "./config/indexes";
import { logger } from "./config/logger";
import { connectRedis, disconnectRedis } from "./config/redis";
import { API_V1_PREFIX } from "./constants/http.constant";
import { closeQueues } from "./queues";
import { createRedisBus, getNotificationBus, setNotificationBus } from "./realtime/notificationBus";
import { closeAllStreams } from "./realtime/notificationHub";
import { registerGracefulShutdown } from "./utils/gracefulShutdown.util";

const bootstrap = async () => {
  await Promise.all([connectDatabase(), connectRedis()]);
  if (isProduction) {
    loadAllModels();
    await assertIndexesPresent();
  }

  // Notifications created by the worker or another API instance reach this one's streams.
  setNotificationBus(createRedisBus());

  const app = createApp();
  const server = createServer(app);

  server.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}${API_V1_PREFIX} (${env.NODE_ENV})`);
  });

  registerGracefulShutdown("API", async () => {
    // Open event streams would otherwise hold server.close() until the timeout.
    closeAllStreams();
    await getNotificationBus().close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await closeQueues();
    await Promise.all([disconnectRedis(), disconnectDatabase()]);
  });
};

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, "Failed to start API");
  process.exit(1);
});
