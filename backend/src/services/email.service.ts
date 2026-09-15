import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  passwordChangedEmailTemplate,
  passwordResetEmailTemplate,
  verificationEmailTemplate,
  workspaceInvitationEmailTemplate,
} from "../utils/emailTemplates.util";
import type { WorkspaceRoleValue } from "../constants/workspace.constant";
import { sendMail } from "../utils/mailer.util";

interface Recipient {
  name: string;
  email: string;
}

const buildFrontendUrl = (path: string, token: string): string => {
  const url = new URL(path, env.FRONTEND_URL);
  url.searchParams.set("token", token);
  return url.toString();
};

export const sendVerificationEmail = (recipient: Recipient, token: string) =>
  sendMail({
    to: recipient.email,
    ...verificationEmailTemplate({
      name: recipient.name,
      url: buildFrontendUrl("/verify-email", token),
      expiresInHours: env.EMAIL_VERIFICATION_TTL_HOURS,
    }),
  });

export const sendPasswordResetEmail = (recipient: Recipient, token: string) =>
  sendMail({
    to: recipient.email,
    ...passwordResetEmailTemplate({
      name: recipient.name,
      url: buildFrontendUrl("/reset-password", token),
      expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    }),
  });

export const sendPasswordChangedEmail = (recipient: Recipient) =>
  sendMail({ to: recipient.email, ...passwordChangedEmailTemplate({ name: recipient.name }) });

const ROLE_LABELS: Record<WorkspaceRoleValue, string> = {
  OWNER: "an owner",
  ADMIN: "an admin",
  EDITOR: "an editor",
  VIEWER: "a viewer",
};

export const sendWorkspaceInvitationEmail = ({
  email,
  inviterName,
  workspaceName,
  role,
  token,
}: {
  email: string;
  inviterName: string;
  workspaceName: string;
  role: WorkspaceRoleValue;
  token: string;
}) =>
  sendMail({
    to: email,
    ...workspaceInvitationEmailTemplate({
      inviterName,
      workspaceName,
      roleLabel: ROLE_LABELS[role],
      url: buildFrontendUrl("/invitations/accept", token),
      expiresInDays: env.WORKSPACE_INVITATION_TTL_DAYS,
    }),
  });

/**
 * Sends without blocking the HTTP response. A mail outage must not fail signup,
 * and not awaiting keeps forgot-password timing identical for unknown emails.
 * TODO: move to a BullMQ queue for retries once the email volume justifies it.
 */
export const dispatchEmail = (send: () => Promise<void>, context: string): void => {
  send().catch((error: unknown) => {
    logger.error({ err: error, context }, "Failed to send email");
  });
};
