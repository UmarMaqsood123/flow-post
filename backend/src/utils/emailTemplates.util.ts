const APP_NAME = "FlowPost";

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

const layout = (heading: string, bodyHtml: string) => `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
      <tr><td style="padding:32px">
        <p style="margin:0 0 24px;font-weight:600;font-size:18px">${APP_NAME}</p>
        <h1 style="margin:0 0 16px;font-size:20px">${heading}</h1>
        ${bodyHtml}
      </td></tr>
    </table>
  </body>
</html>`;

const button = (url: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500">${label}</a></p>
   <p style="margin:0;font-size:13px;color:#64748b">Or paste this link into your browser:<br>${escapeHtml(url)}</p>`;

export const verificationEmailTemplate = ({
  name,
  url,
  expiresInHours,
}: {
  name: string;
  url: string;
  expiresInHours: number;
}): EmailContent => ({
  subject: `Verify your ${APP_NAME} email address`,
  text: `Hi ${name},\n\nConfirm your email address by opening this link:\n${url}\n\nThis link expires in ${expiresInHours} hours. If you didn't create an account, you can ignore this email.`,
  html: layout(
    "Confirm your email address",
    `<p>Hi ${escapeHtml(name)},</p>
     <p>Please confirm this is your email address.</p>
     ${button(url, "Verify email")}
     <p style="font-size:13px;color:#64748b">This link expires in ${expiresInHours} hours. If you didn't create an account, you can ignore this email.</p>`,
  ),
});

export const passwordResetEmailTemplate = ({
  name,
  url,
  expiresInMinutes,
}: {
  name: string;
  url: string;
  expiresInMinutes: number;
}): EmailContent => ({
  subject: `Reset your ${APP_NAME} password`,
  text: `Hi ${name},\n\nWe received a request to reset your password. Open this link to choose a new one:\n${url}\n\nThis link expires in ${expiresInMinutes} minutes. If you didn't request this, you can ignore this email. Your password won't change.`,
  html: layout(
    "Reset your password",
    `<p>Hi ${escapeHtml(name)},</p>
     <p>We received a request to reset your password.</p>
     ${button(url, "Choose a new password")}
     <p style="font-size:13px;color:#64748b">This link expires in ${expiresInMinutes} minutes. If you didn't request this, you can ignore this email. Your password won't change.</p>`,
  ),
});

export const passwordChangedEmailTemplate = ({ name }: { name: string }): EmailContent => ({
  subject: `Your ${APP_NAME} password was changed`,
  text: `Hi ${name},\n\nThe password for your ${APP_NAME} account was just changed and all other sessions were signed out.\n\nIf this wasn't you, reset your password immediately and contact support.`,
  html: layout(
    "Your password was changed",
    `<p>Hi ${escapeHtml(name)},</p>
     <p>The password for your ${APP_NAME} account was just changed and all other sessions were signed out.</p>
     <p>If this wasn't you, reset your password immediately and contact support.</p>`,
  ),
});

export const workspaceInvitationEmailTemplate = ({
  inviterName,
  workspaceName,
  roleLabel,
  url,
  expiresInDays,
}: {
  inviterName: string;
  workspaceName: string;
  roleLabel: string;
  url: string;
  expiresInDays: number;
}): EmailContent => ({
  subject: `${inviterName} invited you to ${workspaceName} on ${APP_NAME}`,
  text: `Hi,\n\n${inviterName} invited you to join the "${workspaceName}" workspace on ${APP_NAME} as ${roleLabel}.\n\nAccept the invitation:\n${url}\n\nThis invitation expires in ${expiresInDays} days. If you weren't expecting it, you can ignore this email.`,
  html: layout(
    `Join ${escapeHtml(workspaceName)}`,
    `<p>${escapeHtml(inviterName)} invited you to join the <strong>${escapeHtml(workspaceName)}</strong> workspace on ${APP_NAME} as ${roleLabel}.</p>
     ${button(url, "Accept invitation")}
     <p style="font-size:13px;color:#64748b">This invitation expires in ${expiresInDays} days. If you weren't expecting it, you can ignore this email.</p>`,
  ),
});

export const paymentFailedEmailTemplate = ({
  name,
  planLabel,
  graceUntil,
  url,
}: {
  name: string;
  planLabel: string;
  graceUntil: Date;
  url: string;
}): EmailContent => {
  const until = graceUntil.toDateString();
  return {
    subject: `Your ${APP_NAME} payment didn't go through`,
    text: `Hi ${name},\n\nWe couldn't take the payment for your ${planLabel} plan. Your plan stays active until ${until} while we try again.\n\nUpdate your payment method:\n${url}\n\nIf it isn't fixed by then, your account moves to the Free plan. Nothing is deleted.`,
    html: layout(
      "Your payment didn't go through",
      `<p>Hi ${escapeHtml(name)},</p>
       <p>We couldn't take the payment for your ${escapeHtml(planLabel)} plan. Your plan stays active until <strong>${escapeHtml(until)}</strong> while we try again.</p>
       ${button(url, "Update payment method")}
       <p style="font-size:13px;color:#64748b">If it isn't fixed by then, your account moves to the Free plan. Nothing is deleted.</p>`,
    ),
  };
};
