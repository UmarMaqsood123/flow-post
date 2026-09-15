/** Single source of truth for route paths. */
export const paths = {
  home: "/",
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  // Email links point here — keep in sync with backend/src/services/email.service.ts.
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email",
  acceptInvitation: "/invitations/accept",

  // App (sidebar layout), in sidebar order
  dashboard: "/dashboard",
  aiCreate: "/create",
  content: "/content",
  calendar: "/calendar",
  socialAccounts: "/social-accounts",
  analytics: "/analytics",
  autopilot: "/autopilot",
  /** Media library (images, videos, documents). */
  workspaceFiles: "/media",
  /** Team members and invitations. */
  workspaceMembers: "/team",
  billing: "/billing",
  settings: "/settings",
  workspaceSettings: "/settings/workspace",
  /** Brand onboarding wizard; `?step=` selects the step. */
  brandProfile: "/settings/brand-profile",
  accountSettings: "/settings/account",
  workspaces: "/workspaces",
  createWorkspace: "/workspaces/new",
  /** Legacy path — redirects to account settings. */
  changePassword: "/settings/password",
} as const;

/** Old URLs that still work (bookmarks, earlier links) and where they now point. */
export const legacyRedirects: { from: string; to: string }[] = [
  { from: "/posts", to: paths.content },
  { from: "/workspace/files", to: paths.workspaceFiles },
  { from: "/workspace/members", to: paths.workspaceMembers },
  { from: "/workspace/settings", to: paths.workspaceSettings },
  { from: "/workspace/brand-profile", to: paths.brandProfile },
  { from: paths.changePassword, to: paths.accountSettings },
];
