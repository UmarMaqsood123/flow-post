import { type Job, UnrecoverableError, type Worker } from "bullmq";
import { env } from "../config/env";
import { PUBLISH_QUEUE_NAME } from "../constants/publishing.constant";
import type { PublishJobData } from "../queues/publish.queue";
import { type PublishOutcome, runPublishJob } from "../services/publishing.service";
import { createWorker } from "./index";

/**
 * Turns a publish outcome into what BullMQ should do:
 * - retryable failures rethrow, so the queue retries with exponential backoff;
 * - final failures throw UnrecoverableError, which stops further attempts;
 * - anything else (published, skipped) completes the job.
 */
export const publishProcessor = async (job: Job<PublishJobData>): Promise<PublishOutcome> => {
  const outcome = await runPublishJob({
    publishJobId: job.data.publishJobId,
    queueAttempt: job.attemptsMade + 1,
  });

  if (outcome.outcome === "retry") throw outcome.error;
  if (outcome.outcome === "failed") throw new UnrecoverableError(outcome.message);
  return outcome;
};

export const createPublishWorker = (): Worker<PublishJobData, PublishOutcome> =>
  createWorker<PublishJobData, PublishOutcome>(PUBLISH_QUEUE_NAME, publishProcessor, {
    concurrency: env.PUBLISH_CONCURRENCY,
  });
