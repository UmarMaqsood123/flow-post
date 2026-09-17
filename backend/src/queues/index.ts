import { Queue, type QueueOptions } from "bullmq";
import { logger } from "../config/logger";
import { redis } from "../config/redis";
import { PUBLISH_QUEUE_NAME } from "../constants/publishing.constant";

/** Central registry of queue names. Add entries as features are built. */
export const QueueName = {
  PUBLISH_POST: PUBLISH_QUEUE_NAME,
} as const;

const defaultJobOptions: QueueOptions["defaultJobOptions"] = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { count: 1_000, age: 24 * 60 * 60 },
  removeOnFail: { count: 5_000, age: 7 * 24 * 60 * 60 },
};

const queues = new Map<string, Queue>();

/**
 * Returns a singleton queue (producer side). Producers can share the main
 * Redis connection; workers must not — see src/workers.
 */
export const getQueue = <DataType = unknown, ResultType = unknown>(
  name: string,
  options: Partial<QueueOptions> = {},
): Queue<DataType, ResultType> => {
  const existing = queues.get(name);
  if (existing) return existing as unknown as Queue<DataType, ResultType>;

  const queue = new Queue<DataType, ResultType>(name, {
    connection: redis,
    defaultJobOptions,
    ...options,
  });
  queue.on("error", (error) => logger.error({ err: error, queue: name }, "Queue error"));

  queues.set(name, queue as unknown as Queue);
  return queue;
};

export const closeQueues = async (): Promise<void> => {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
};
