import { type Types, isValidObjectId } from "mongoose";
import { logger } from "../config/logger";
import {
  NOTIFICATION_LIMITS as LIMITS,
  type NotificationTypeValue,
} from "../constants/notification.constant";
import { WorkspaceRole } from "../constants/workspace.constant";
import { Notification, type NotificationDocument } from "../models/notification.model";
import { WorkspaceMember } from "../models/workspaceMember.model";
import { getNotificationBus, type NotificationEvent } from "../realtime/notificationBus";

type Id = Types.ObjectId | string;

export interface NotifyInput {
  recipients: Array<Id | null | undefined>;
  workspace?: Id | null;
  type: NotificationTypeValue;
  title: string;
  body: string;
  /** In-app path. Anything that isn't a plain relative path falls back to "/". */
  href: string;
  /** Unique per recipient; a repeat of the same key is silently skipped. */
  dedupeKey?: string;
}

export const toView = (doc: NotificationDocument): NotificationEvent["notification"] => ({
  id: doc.id as string,
  workspaceId: doc.workspace ? doc.workspace.toString() : null,
  type: doc.type,
  title: doc.title,
  body: doc.body,
  href: doc.href,
  read: doc.readAt !== null,
  createdAt: doc.createdAt.toISOString(),
});

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** Only same-origin app paths: no protocol-relative (`//`) or absolute URLs. */
const safeHref = (href: string) =>
  href.startsWith("/") && !href.startsWith("//") && !href.includes("\\")
    ? clip(href, LIMITS.href)
    : "/";

const isDuplicateKey = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

/**
 * Stores a notification for each recipient and pushes it to their open
 * sessions. Never throws: a notification is a side effect, and a failure here
 * must not undo or fail the action that triggered it.
 */
export const notify = async (input: NotifyInput): Promise<void> => {
  try {
    const recipients = [
      ...new Set(
        input.recipients
          .filter((id): id is Id => id !== null && id !== undefined && isValidObjectId(id))
          .map(String),
      ),
    ];
    if (recipients.length === 0) return;

    const created: NotificationDocument[] = [];
    for (const user of recipients) {
      try {
        created.push(
          await Notification.create({
            user,
            workspace: input.workspace ?? null,
            type: input.type,
            title: clip(input.title, LIMITS.title),
            body: clip(input.body, LIMITS.body),
            href: safeHref(input.href),
            dedupeKey: input.dedupeKey ? clip(input.dedupeKey, 200) : null,
          }),
        );
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
    }
    if (created.length === 0) return;

    await getNotificationBus()
      .publish(created.map((doc) => ({ userId: doc.user.toString(), notification: toView(doc) })))
      // Stored already; clients catch up on their next fetch.
      .catch((error: unknown) =>
        logger.warn({ err: error, type: input.type }, "Couldn't push notifications live"),
      );
  } catch (error) {
    logger.error({ err: error, type: input.type }, "Couldn't create notifications");
  }
};

/** Owners and admins of a workspace: the people responsible for failures. */
export const workspaceAdmins = async (workspace: Id): Promise<Types.ObjectId[]> => {
  const members = await WorkspaceMember.find({
    workspace,
    role: { $in: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] },
  })
    .select("user")
    .lean();
  return members.map((member) => member.user);
};

/** The user's notifications for one workspace, plus account-level ones. */
const visibleTo = (user: Id, workspace: string | null) => ({
  user,
  workspace: workspace ? { $in: [workspace, null] } : null,
});

export const listNotifications = async (
  user: Id,
  { workspace, before }: { workspace: string | null; before?: Date },
) => {
  const docs = await Notification.find({
    ...visibleTo(user, workspace),
    ...(before ? { createdAt: { $lt: before } } : {}),
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(LIMITS.pageSize + 1);
  const hasMore = docs.length > LIMITS.pageSize;
  const page = docs.slice(0, LIMITS.pageSize);
  const unread = await countUnread(user, workspace);
  return { notifications: page.map(toView), unread, hasMore };
};

export const countUnread = (user: Id, workspace: string | null) =>
  Notification.countDocuments({ ...visibleTo(user, workspace), readAt: null });

/** Marks the given ids, or everything visible in the workspace, as read. */
export const markRead = async (
  user: Id,
  { workspace, ids }: { workspace: string | null; ids?: string[] },
) => {
  await Notification.updateMany(
    {
      ...visibleTo(user, workspace),
      readAt: null,
      ...(ids ? { _id: { $in: ids } } : {}),
    },
    { $set: { readAt: new Date() } },
  );
  return { unread: await countUnread(user, workspace) };
};

export const deleteWorkspaceNotifications = (workspace: Id) =>
  Notification.deleteMany({ workspace });
