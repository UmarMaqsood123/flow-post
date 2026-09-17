const WORKSPACES = ["workspaces"] as const;
const workspaceDetail = (workspaceId: string) => [...WORKSPACES, "detail", workspaceId] as const;

/** Central query-key factory — keeps cache keys consistent for invalidation. */
export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    /** The signed-in user, or `null` when signed out. */
    session: () => ["auth", "session"] as const,
  },
  workspaces: {
    all: WORKSPACES,
    list: () => [...WORKSPACES, "list"] as const,
    /** Prefix for every query that belongs to one workspace. */
    detail: workspaceDetail,
    members: (workspaceId: string) => [...workspaceDetail(workspaceId), "members"] as const,
    invitations: (workspaceId: string) => [...workspaceDetail(workspaceId), "invitations"] as const,
    invitationPreview: (token: string) => [...WORKSPACES, "invitation-preview", token] as const,
    /** Prefix for every file list in a workspace (all kinds). */
    files: (workspaceId: string) => [...workspaceDetail(workspaceId), "files"] as const,
    socialAccounts: (workspaceId: string) =>
      [...workspaceDetail(workspaceId), "social-accounts"] as const,
    socialPlatforms: (workspaceId: string) =>
      [...workspaceDetail(workspaceId), "social-platforms"] as const,
    connectionChoices: (workspaceId: string, draftId: string) =>
      [...workspaceDetail(workspaceId), "social-connection", draftId] as const,
    dashboard: (workspaceId: string) => [...workspaceDetail(workspaceId), "dashboard"] as const,
    analytics: (workspaceId: string, query: unknown) =>
      [...workspaceDetail(workspaceId), "analytics", query] as const,
    /** Prefix for Autopilot's overview and its activity pages. */
    autopilot: (workspaceId: string) => [...workspaceDetail(workspaceId), "autopilot"] as const,
    autopilotEvents: (workspaceId: string) =>
      [...workspaceDetail(workspaceId), "autopilot", "events"] as const,
    entitlements: (workspaceId: string) =>
      [...workspaceDetail(workspaceId), "entitlements"] as const,
    insights: (workspaceId: string) => [...workspaceDetail(workspaceId), "insights"] as const,
    insightReport: (workspaceId: string, reportId: string) =>
      [...workspaceDetail(workspaceId), "insights", reportId] as const,
    brandProfile: (workspaceId: string) =>
      [...workspaceDetail(workspaceId), "brand-profile"] as const,
    /** Prefix for the strategy version list and every strategy. */
    contentStrategies: (workspaceId: string) =>
      [...workspaceDetail(workspaceId), "content-strategies"] as const,
    contentStrategyList: (workspaceId: string) =>
      [...workspaceDetail(workspaceId), "content-strategies", "list"] as const,
    /** Prefix for every post list (all filters). */
    postLists: (workspaceId: string) => [...workspaceDetail(workspaceId), "posts", "list"] as const,
    postList: (workspaceId: string, query: object) =>
      [...workspaceDetail(workspaceId), "posts", "list", query] as const,
    post: (workspaceId: string, postId: string) =>
      [...workspaceDetail(workspaceId), "posts", "detail", postId] as const,
    postSchedule: (workspaceId: string, postId: string) =>
      [...workspaceDetail(workspaceId), "posts", "detail", postId, "schedule"] as const,
    /** Prefix for every calendar range and filter combination. */
    calendars: (workspaceId: string) =>
      [...workspaceDetail(workspaceId), "posts", "calendar"] as const,
    calendar: (workspaceId: string, query: object) =>
      [...workspaceDetail(workspaceId), "posts", "calendar", query] as const,
    contentStrategy: (workspaceId: string, strategyId: string) =>
      [...workspaceDetail(workspaceId), "content-strategies", "detail", strategyId] as const,
  },
  admin: {
    all: ["admin"] as const,
    dashboard: () => ["admin", "dashboard"] as const,
    lists: () => ["admin", "list"] as const,
    list: (name: string, params: object) => ["admin", "list", name, params] as const,
    user: (id: string) => ["admin", "user", id] as const,
    workspace: (id: string) => ["admin", "workspace", id] as const,
    subscription: (id: string) => ["admin", "subscription", id] as const,
    plans: () => ["admin", "plans"] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    /** The bell's list for one workspace, or account-level only when there's none. */
    list: (workspaceId: string | null) => ["notifications", workspaceId ?? "account"] as const,
  },
  billing: {
    overview: () => ["billing", "overview"] as const,
  },
  health: {
    all: ["health"] as const,
    readiness: () => ["health", "readiness"] as const,
  },
} as const;
