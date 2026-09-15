import { logger } from "../config/logger";

type CleanupFn = () => Promise<void>;

const SHUTDOWN_TIMEOUT_MS = 15_000;

/**
 * Runs `cleanup` once on SIGINT/SIGTERM or a fatal process error, then exits.
 * A hard timeout guarantees the process exits even if cleanup hangs.
 */
export const registerGracefulShutdown = (processName: string, cleanup: CleanupFn): void => {
  let shuttingDown = false;

  const shutdown = async (reason: string, exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ reason }, `${processName} shutting down`);

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await cleanup();
      logger.info(`${processName} shut down cleanly`);
    } catch (error) {
      logger.error({ err: error }, "Error during shutdown");
      exitCode = 1;
    } finally {
      clearTimeout(forceExit);
      process.exit(exitCode);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT", 0));
  process.once("SIGTERM", () => void shutdown("SIGTERM", 0));

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "Unhandled promise rejection");
    void shutdown("unhandledRejection", 1);
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    void shutdown("uncaughtException", 1);
  });
};
