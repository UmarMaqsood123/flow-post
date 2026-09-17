import type { Request, Response } from "express";
import { UserStatus } from "../constants/auth.constant";
import { logger } from "../config/logger";
import { User } from "../models/user.model";
import { addStream, removeStream, type Stream, writeEvent } from "../realtime/notificationHub";
import * as NotificationService from "../services/notification.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { AppError } from "../utils/appError.util";
import type { ListNotificationsQuery, MarkReadInput } from "../validators/notification.validator";

/**
 * Heartbeat comment frames keep proxies from closing an idle connection.
 * Streams outlive the 15-minute access token they were opened with, so every
 * heartbeat re-checks the account, and each stream is closed after an hour so
 * the client reconnects with a current token.
 */
const streamTimings = { heartbeatMs: 25_000, maxStreamMs: 60 * 60_000 };

/** Tests shorten these. Returns a function restoring the defaults. */
export const setStreamTimings = (next: Partial<typeof streamTimings>) => {
  const previous = { ...streamTimings };
  Object.assign(streamTimings, next);
  return () => Object.assign(streamTimings, previous);
};

const currentUser = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

export const ListNotifications = async (req: Request, res: Response) => {
  const { workspaceId, before } = req.query as unknown as ListNotificationsQuery;
  const data = await NotificationService.listNotifications(currentUser(req)._id, {
    workspace: workspaceId ?? null,
    before: before ? new Date(before) : undefined,
  });
  sendSuccess(res, { message: "Notifications", data });
};

export const GetUnreadCount = async (req: Request, res: Response) => {
  const { workspaceId } = req.query as unknown as ListNotificationsQuery;
  const unread = await NotificationService.countUnread(currentUser(req)._id, workspaceId ?? null);
  sendSuccess(res, { message: "Unread notifications", data: { unread } });
};

export const MarkNotificationsRead = async (req: Request, res: Response) => {
  const { workspaceId, ids } = req.body as MarkReadInput;
  const data = await NotificationService.markRead(currentUser(req)._id, {
    workspace: workspaceId ?? null,
    ids,
  });
  sendSuccess(res, { message: "Notifications marked as read", data });
};

/** Server-Sent Events: pushes each new notification to this session as it happens. */
export const StreamNotifications = (req: Request, res: Response) => {
  const user = currentUser(req);
  const userId = user.id as string;
  const tokenVersion = user.tokenVersion;

  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store, no-transform",
    Connection: "keep-alive",
    // Nginx would otherwise buffer the response and deliver events in bursts.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  req.socket.setKeepAlive(true);
  req.socket.setNoDelay(true);

  res.write("retry: 5000\n\n");
  writeEvent(res, "ready", { at: new Date().toISOString() });

  const stream: Stream = { userId, res, openedAt: Date.now() };
  addStream(stream);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    removeStream(stream);
    if (!res.writableEnded) res.end();
  };

  const heartbeat = setInterval(() => {
    void User.findById(userId)
      .select("status tokenVersion")
      .lean()
      .then((fresh) => {
        if (closed) return;
        if (
          !fresh ||
          fresh.tokenVersion !== tokenVersion ||
          fresh.status === UserStatus.SUSPENDED
        ) {
          writeEvent(res, "revoked", {});
          close();
          return;
        }
        res.write(": ping\n\n");
      })
      .catch((error: unknown) => {
        // A database blip shouldn't drop everyone's stream; the next beat retries.
        logger.warn({ err: error }, "Couldn't re-check a notification stream");
        if (!closed) res.write(": ping\n\n");
      });
  }, streamTimings.heartbeatMs);
  const lifetime = setTimeout(close, streamTimings.maxStreamMs);

  req.on("close", close);
  res.on("error", close);
};
