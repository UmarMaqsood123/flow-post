import type { Request } from "express";
import type { Types } from "mongoose";
import { logger } from "../config/logger";
import { ContactMessage, type IContactMessage } from "../models/contactMessage.model";
import { User, type UserDocument } from "../models/user.model";
import { AppError } from "../utils/appError.util";
import { getRequestMeta } from "../utils/request.util";
import type {
  CreateContactMessageInput,
  ListContactMessagesQuery,
  UpdateContactMessageInput,
} from "../validators/contact.validator";

type StoredMessage = IContactMessage & { _id: Types.ObjectId };

const toAdminContactMessage = (message: StoredMessage) => ({
  id: message._id.toString(),
  name: message.name,
  email: message.email,
  topic: message.topic,
  message: message.message,
  userId: message.user?.toString() ?? null,
  status: message.status,
  adminNote: message.adminNote,
  handledByEmail: message.handledByEmail,
  handledAt: message.handledAt,
  createdAt: message.createdAt,
  updatedAt: message.updatedAt,
});

/** Saves a Contact page message. Honeypot hits are dropped but look successful to the bot. */
export const createContactMessage = async (input: CreateContactMessageInput, req: Request) => {
  if (input.website) {
    logger.info({ ip: req.ip }, "Contact form honeypot triggered, message dropped");
    return;
  }
  const account = await User.findOne({ email: input.email }).select("_id").lean();
  const { ip, userAgent } = getRequestMeta(req);
  await ContactMessage.create({
    name: input.name,
    email: input.email,
    topic: input.topic,
    message: input.message,
    user: account?._id ?? null,
    ip,
    userAgent,
  });
};

const searchPattern = (q: string | undefined) =>
  q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

export const listContactMessages = async ({
  page,
  limit,
  q,
  status,
  topic,
}: ListContactMessagesQuery) => {
  const filter: Record<string, unknown> = {};
  const pattern = searchPattern(q);
  if (pattern) filter.$or = [{ email: pattern }, { name: pattern }, { message: pattern }];
  if (status) filter.status = status;
  if (topic) filter.topic = topic;

  const [items, total, unread] = await Promise.all([
    ContactMessage.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<StoredMessage[]>(),
    ContactMessage.countDocuments(filter),
    ContactMessage.countDocuments({ status: "NEW" }),
  ]);
  return {
    items: items.map(toAdminContactMessage),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    unread,
  };
};

export const updateContactMessage = async (
  admin: UserDocument,
  id: string,
  { status, adminNote }: UpdateContactMessageInput,
) => {
  const message = await ContactMessage.findById(id);
  if (!message) throw AppError.notFound("Message not found");

  if (adminNote !== undefined) message.adminNote = adminNote || null;
  if (status && status !== message.status) {
    message.status = status;
    if (status === "NEW") {
      message.handledBy = null;
      message.handledByEmail = null;
      message.handledAt = null;
    } else {
      message.handledBy = admin._id;
      message.handledByEmail = admin.email;
      message.handledAt = new Date();
    }
  }
  await message.save();
  return toAdminContactMessage(message.toObject() as StoredMessage);
};
