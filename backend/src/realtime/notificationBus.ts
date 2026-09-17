/**
 * Carries new notifications from whichever process created them (API or worker)
 * to every API process holding live connections. In-process by default, which is
 * enough for tests and a single instance; production switches to Redis pub/sub.
 */
import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import { logger } from "../config/logger";
import { createRedisConnection, redis } from "../config/redis";
import { NOTIFICATION_CHANNEL } from "../constants/notification.constant";

export interface NotificationEvent {
  userId: string;
  notification: {
    id: string;
    workspaceId: string | null;
    type: string;
    title: string;
    body: string;
    href: string;
    read: boolean;
    createdAt: string;
  };
}

export interface NotificationBus {
  publish(events: NotificationEvent[]): Promise<void>;
  subscribe(handler: (event: NotificationEvent) => void): () => void;
  close(): Promise<void>;
}

export const createLocalBus = (): NotificationBus => {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    publish: (events) => {
      for (const event of events) emitter.emit("event", event);
      return Promise.resolve();
    },
    subscribe: (handler) => {
      emitter.on("event", handler);
      return () => emitter.off("event", handler);
    },
    close: () => {
      emitter.removeAllListeners();
      return Promise.resolve();
    },
  };
};

const isEvent = (value: unknown): value is NotificationEvent =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as NotificationEvent).userId === "string" &&
  typeof (value as NotificationEvent).notification?.id === "string";

/**
 * Redis pub/sub. Publishing uses the shared client; subscribing needs its own
 * connection (a subscribed connection can't run other commands). ioredis
 * re-subscribes automatically after a reconnect. Messages published while a
 * subscriber is disconnected are lost, which is fine: notifications are stored,
 * and clients refetch the list whenever their stream reconnects.
 */
export const createRedisBus = (): NotificationBus => {
  const local = createLocalBus();
  let subscriber: Redis | null = null;

  const ensureSubscriber = () => {
    if (subscriber) return;
    subscriber = createRedisConnection("flowpost:notifications-subscriber");
    subscriber.on("message", (_channel, message) => {
      try {
        const parsed: unknown = JSON.parse(message);
        if (isEvent(parsed)) void local.publish([parsed]);
      } catch (error) {
        logger.warn({ err: error }, "Ignored a malformed notification message");
      }
    });
    subscriber
      .subscribe(NOTIFICATION_CHANNEL)
      .catch((error: unknown) =>
        logger.error({ err: error }, "Couldn't subscribe to notifications"),
      );
  };

  return {
    publish: async (events) => {
      for (const event of events) {
        await redis.publish(NOTIFICATION_CHANNEL, JSON.stringify(event));
      }
    },
    subscribe: (handler) => {
      ensureSubscriber();
      return local.subscribe(handler);
    },
    close: async () => {
      await local.close();
      if (subscriber) await subscriber.quit();
      subscriber = null;
    },
  };
};

let bus: NotificationBus = createLocalBus();

export const getNotificationBus = () => bus;

/** Swaps the bus (startup, tests). Returns a function restoring the previous one. */
export const setNotificationBus = (next: NotificationBus) => {
  const previous = bus;
  bus = next;
  return () => {
    bus = previous;
  };
};
