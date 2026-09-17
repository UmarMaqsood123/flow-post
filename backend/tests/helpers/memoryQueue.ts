import type {
  EnqueueOptions,
  PublishJobData,
  PublishQueuePort,
} from "../../src/queues/publish.queue";

export interface QueuedJob {
  data: PublishJobData;
  options: EnqueueOptions;
}

/** Stands in for BullMQ so tests never need Redis, while keeping the same contract. */
export class MemoryPublishQueue implements PublishQueuePort {
  readonly jobs = new Map<string, QueuedJob>();
  /** Every add and remove, in order. */
  readonly events: { type: "add" | "remove"; jobId: string }[] = [];

  add(data: PublishJobData, options: EnqueueOptions): Promise<void> {
    this.events.push({ type: "add", jobId: options.jobId });
    // Like BullMQ, adding an id that already exists is ignored.
    if (!this.jobs.has(options.jobId)) this.jobs.set(options.jobId, { data, options });
    return Promise.resolve();
  }

  remove(jobId: string): Promise<boolean> {
    this.events.push({ type: "remove", jobId });
    return Promise.resolve(this.jobs.delete(jobId));
  }

  has(jobId: string): Promise<boolean> {
    return Promise.resolve(this.jobs.has(jobId));
  }

  get added(): QueuedJob[] {
    return [...this.jobs.values()];
  }

  countAdds(): number {
    return this.events.filter((event) => event.type === "add").length;
  }
}
