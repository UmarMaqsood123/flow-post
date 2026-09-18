import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_STATUSES,
  CONTACT_TOPICS,
  type ContactStatusValue,
  type ContactTopicValue,
} from "../constants/contact.constant";

/** A message sent through the public Contact page, read and handled in the admin panel. */
export interface IContactMessage {
  name: string;
  email: string;
  topic: ContactTopicValue;
  message: string;
  /** The account with this email, if there is one, so admins can jump to it. */
  user: Types.ObjectId | null;
  status: ContactStatusValue;
  /** Private admin note, never shown to the sender. */
  adminNote: string | null;
  handledBy: Types.ObjectId | null;
  handledByEmail: string | null;
  handledAt: Date | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ContactMessageDocument = HydratedDocument<IContactMessage>;

const ContactMessageSchema = new Schema<IContactMessage>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    topic: { type: String, enum: CONTACT_TOPICS, required: true },
    message: { type: String, required: true, maxlength: CONTACT_MESSAGE_MAX_LENGTH },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: CONTACT_STATUSES, default: "NEW" },
    adminNote: { type: String, default: null, maxlength: 2000 },
    handledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    handledByEmail: { type: String, default: null, maxlength: 254 },
    handledAt: { type: Date, default: null },
    ip: { type: String, default: null, maxlength: 100 },
    userAgent: { type: String, default: null, maxlength: 512 },
  },
  { timestamps: true },
);

ContactMessageSchema.index({ createdAt: -1 });
ContactMessageSchema.index({ status: 1, createdAt: -1 });
ContactMessageSchema.index({ topic: 1, createdAt: -1 });

export const ContactMessage: Model<IContactMessage> = mongoose.model<IContactMessage>(
  "ContactMessage",
  ContactMessageSchema,
);
