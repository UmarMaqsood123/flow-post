import { type Processor, Worker, type WorkerOptions } from "bullmq";
import { logger } from "../config/logger";
import { createRedisConnection } from "../config/redis";
import { createPublishWorker } from "./publish.worker";

const workers: Worker[] = [];

/**
 * Creates a BullMQ worker with its own Redis connection and standard logging.
 * Call from `registerWorkers` below.
 */
export const createWorker = <DataType = unknown, ResultType = unknown>(
  queueName: string,
  processor: Processor<DataType, ResultType>,
  options: Partial<WorkerOptions> = {},
): Worker<DataType, ResultType> => {
  const worker = new Worker<DataType, ResultType>(queueName, processor, {
    connection: createRedisConnection(`flowpost:worker:${queueName}`),
    concurrency: 5,
    ...options,
  });

  worker.on("completed", (job) =>
    logger.info({ queue: queueName, jobId: job.id, jobName: job.name }, "Job completed"),
  );
  worker.on("failed", (job, error) =>
    logger.error(
      {
        queue: queueName,
        jobId: job?.id,
        jobName: job?.name,
        attempts: job?.attemptsMade,
        err: error,
      },
      "Job failed",
    ),
  );
  worker.on("error", (error) => logger.error({ err: error, queue: queueName }, "Worker error"));

  workers.push(worker as unknown as Worker);
  return worker;
};

/** Register all queue processors here as features are built. */
export const registerWorkers = (): void => {
  createPublishWorker();
};

export const getWorkerCount = (): number => workers.length;
export const getWorkers = (): readonly Worker[] => workers;

export const closeWorkers = async (): Promise<void> => {
  await Promise.all(workers.map((worker) => worker.close()));
  workers.length = 0;
};
