import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../config/logger";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/** Messages captured by the `memory` provider (used by tests). */
export const mailOutbox: MailMessage[] = [];

const createTransport = (): MailTransport => {
  switch (env.EMAIL_PROVIDER) {
    case "smtp": {
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
      });
      return {
        send: async (message) => {
          await transporter.sendMail({ from: env.EMAIL_FROM, ...message });
        },
      };
    }
    case "memory":
      return {
        send: async (message) => {
          mailOutbox.push(message);
        },
      };
    case "console":
      return {
        send: async (message) => {
          logger.info(
            { to: message.to, subject: message.subject, body: message.text },
            "Email (console provider — not delivered)",
          );
        },
      };
  }
};

const transport = createTransport();

export const sendMail = (message: MailMessage): Promise<void> => transport.send(message);
