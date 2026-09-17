/** Every action that writes an AuditLog record. */
export const AUDIT_ACTIONS = [
  // Changes
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "SUPER_ADMIN_GRANTED",
  "SUPER_ADMIN_REVOKED",
  "PLAN_OVERRIDE_GRANTED",
  "PLAN_OVERRIDE_REVOKED",
  // Access to personal or billing data
  "USER_VIEWED",
  "WORKSPACE_VIEWED",
  "USAGE_INSPECTED",
  "SUBSCRIPTION_VIEWED",
] as const;
export type AuditActionValue = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = ["USER", "WORKSPACE", "SUBSCRIPTION"] as const;
export type AuditTargetTypeValue = (typeof AUDIT_TARGET_TYPES)[number];

/** Where the action came from: the admin panel or the command-line script. */
export const AUDIT_SOURCES = ["ADMIN_PANEL", "CLI"] as const;
export type AuditSourceValue = (typeof AUDIT_SOURCES)[number];
