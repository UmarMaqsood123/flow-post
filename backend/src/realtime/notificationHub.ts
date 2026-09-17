/**
 * The live connections this API process holds, and delivery to them over
 * Server-Sent Events. One bus subscription per process fans out to every stream.
 */
import type { Response } from "express";
import { logger } from "../config/logger";
import { NOTIFICATION_LIMITS as LIMITS } from "../constants/notification.constant";
import { getNotificationBus, type NotificationEvent } from "./notificationBus";

export interface Stream {
  userId: string;
  res: Response;
  openedAt: number;
}

const streams = new Map<string, Set<Stream>>();
let unsubscribe: (() => void) | null = null;

/** Writes one SSE frame. Payloads are JSON, so they never contain raw newlines. */
export const writeEvent = (res: Response, event: string, data: unknown) => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

const deliver = ({ userId, notification }: NotificationEvent) => {
  const userStreams = streams.get(userId);
  if (!userStreams) return;
  for (const stream of userStreams) {
    try {
      writeEvent(stream.res, "notification", notification);
    } catch (error) {
      logger.warn({ err: error, userId }, "Couldn't write to a notification stream");
    }
  }
};

const ensureSubscribed = () => {
  unsubscribe ??= getNotificationBus().subscribe(deliver);
};

/** Registers a stream; the oldest of a user's streams is closed past the limit. */
export const addStream = (stream: Stream) => {
  ensureSubscribed();
  const userStreams = streams.get(stream.userId) ?? new Set<Stream>();
  if (userStreams.size >= LIMITS.streamsPerUser) {
    const oldest = [...userStreams].sort((a, b) => a.openedAt - b.openedAt)[0];
    if (oldest) {
      userStreams.delete(oldest);
      oldest.res.end();
    }
  }
  userStreams.add(stream);
  streams.set(stream.userId, userStreams);
};

export const removeStream = (stream: Stream) => {
  const userStreams = streams.get(stream.userId);
  if (!userStreams) return;
  userStreams.delete(stream);
  if (userStreams.size === 0) streams.delete(stream.userId);
};

export const streamCount = () => [...streams.values()].reduce((sum, set) => sum + set.size, 0);

/**
 * Ends every stream. Called on shutdown: open event streams would otherwise
 * keep `server.close()` waiting until the hard timeout.
 */
export const closeAllStreams = () => {
  for (const userStreams of streams.values()) {
    for (const stream of userStreams) stream.res.end();
  }
  streams.clear();
  unsubscribe?.();
  unsubscribe = null;
};
