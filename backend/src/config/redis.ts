import { Redis, type RedisOptions } from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

const baseOptions: RedisOptions = {
  // Required by BullMQ: blocking commands must not fail after N retries.
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
};

/**
 * Creates a new Redis connection. BullMQ workers need their own dedicated
 * connections, so use this factory instead of sharing `redis` for them.
 */
export const createRedisConnection = (name: string, options: RedisOptions = {}): Redis => {
  const client = new Redis(env.REDIS_URL, { ...baseOptions, connectionName: name, ...options });

  client.on("ready", () => logger.info({ connection: name }, "Redis ready"));
  client.on("reconnecting", () => logger.warn({ connection: name }, "Redis reconnecting"));
  client.on("error", (error) => logger.error({ err: error, connection: name }, "Redis error"));

  return client;
};

/** Shared general-purpose client (cache, rate limiting, queue producers). */
export const redis = createRedisConnection("flowpost:main", { lazyConnect: true });

export const connectRedis = async (): Promise<void> => {
  if (redis.status === "wait") {
    await redis.connect();
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (redis.status !== "end") {
    await redis.quit();
    logger.info("Redis connection closed");
  }
};

export const isRedisHealthy = (): boolean => redis.status === "ready";
