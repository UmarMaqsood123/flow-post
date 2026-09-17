import { logger } from "../config/logger";
import { PUBLISH_QUEUE_NAME } from "../constants/publishing.constant";
import { getQueue } from "./index";

export interface PublishJobData {
  publishJobId: string;
  scheduleId: string;
  postId: string;
  workspaceId: string;
}

export interface EnqueueOptions {
  /** Deterministic, so adding the same job twice is ignored by the queue. */
  jobId: string;
  delayMs: number;
  attempts: number;
  /** First retry waits this long, then doubles. */
  backoffMs: number;
}

/**
 * The queue as the scheduling service sees it. Tests swap in an in-memory
 * double, so nothing here needs Redis.
 */
export interface PublishQueuePort {
  add(data: PublishJobData, options: EnqueueOptions): Promise<void>;
  /** Removes a job that hasn't started. Returns false if it was already gone or running. */
  remove(jobId: string): Promise<boolean>;
  has(jobId: string): Promise<boolean>;
}

const createBullPublishQueue = (): PublishQueuePort => {
  const queue = () => getQueue<PublishJobData>(PUBLISH_QUEUE_NAME);
  return {
    add: async (data, { jobId, delayMs, attempts, backoffMs }) => {
      await queue().add(PUBLISH_QUEUE_NAME, data, {
        jobId,
        delay: Math.max(0, delayMs),
        attempts,
        backoff: { type: "exponential", delay: backoffMs },
        removeOnComplete: { count: 1_000, age: 7 * 24 * 60 * 60 },
        removeOnFail: { count: 5_000, age: 30 * 24 * 60 * 60 },
      });
    },
    remove: async (jobId) => {
      const job = await queue().getJob(jobId);
      if (!job) return false;
      try {
        await job.remove();
        return true;
      } catch (error) {
        // A job that has already started can't be removed; cancellation is checked again in the worker.
        logger.warn({ err: error, jobId }, "Could not remove queued publish job");
        return false;
      }
    },
    // Only a job that will still run counts. A completed or failed job kept for
    // its retention window would otherwise hide a job that needs re-adding.
    has: async (jobId) => {
      const job = await queue().getJob(jobId);
      if (!job) return false;
      const state = await job.getState();
      return ["waiting", "delayed", "active", "prioritized", "waiting-children"].includes(state);
    },
  };
};

let publishQueue: PublishQueuePort | null = null;

export const getPublishQueue = (): PublishQueuePort => {
  publishQueue ??= createBullPublishQueue();
  return publishQueue;
};

/** Replaces the queue (tests). Returns a function that restores the previous one. */
export const setPublishQueue = (queue: PublishQueuePort): (() => void) => {
  const previous = publishQueue;
  publishQueue = queue;
  return () => {
    publishQueue = previous;
  };
};
