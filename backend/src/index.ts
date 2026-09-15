import { createServer } from "node:http";
import { createApp } from "./app";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectRedis, disconnectRedis } from "./config/redis";
import { API_V1_PREFIX } from "./constants/http.constant";
import { closeQueues } from "./queues";
import { registerGracefulShutdown } from "./utils/gracefulShutdown.util";

const bootstrap = async () => {
  await Promise.all([connectDatabase(), connectRedis()]);

  const app = createApp();
  const server = createServer(app);

  server.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}${API_V1_PREFIX} (${env.NODE_ENV})`);
  });

  registerGracefulShutdown("API", async () => {
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
