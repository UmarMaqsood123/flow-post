import { Router } from "express";
import * as NotificationController from "../controllers/notification.controller";
import { authenticate, noStore } from "../middlewares/auth.middleware";
import { notificationRateLimiters as limit } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import { listNotificationsQuerySchema, markReadSchema } from "../validators/notification.validator";

/**
 * /api/v1/notifications — always the signed-in user's own notifications. They
 * belong to the user rather than the workspace, so no workspace role is needed;
 * `workspaceId` only narrows which ones are shown.
 */
const NotificationRouter = Router();

NotificationRouter.use(noStore, authenticate);

NotificationRouter.get(
  "/",
  validate({ query: listNotificationsQuerySchema }),
  NotificationController.ListNotifications,
);
NotificationRouter.get(
  "/unread-count",
  validate({ query: listNotificationsQuerySchema }),
  NotificationController.GetUnreadCount,
);
NotificationRouter.post(
  "/read",
  validate({ body: markReadSchema }),
  NotificationController.MarkNotificationsRead,
);
NotificationRouter.get("/stream", limit.stream, NotificationController.StreamNotifications);

export { NotificationRouter };
