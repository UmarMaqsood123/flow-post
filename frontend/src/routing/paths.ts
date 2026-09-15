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

  // App (sidebar layout)
  dashboard: "/dashboard",
  calendar: "/calendar",
  posts: "/posts",
  analytics: "/analytics",
  workspaces: "/workspaces",
  createWorkspace: "/workspaces/new",
  workspaceSettings: "/workspace/settings",
  workspaceMembers: "/workspace/members",
  workspaceFiles: "/workspace/files",
  accountSettings: "/settings/account",
  /** Legacy path — redirects to account settings. */
  changePassword: "/settings/password",
} as const;
