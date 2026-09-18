/** Typed, defaulted access to client env vars. Import this instead of `import.meta.env`. */
export const env = {
  appName: import.meta.env.VITE_APP_NAME || "FlowPost",
  /** Where the Contact page and legal pages send people. */
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || "support@flowpost.app",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;
