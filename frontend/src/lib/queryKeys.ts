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
    dashboard: (workspaceId: string) => [...workspaceDetail(workspaceId), "dashboard"] as const,
    notifications: (workspaceId: string) =>
      [...workspaceDetail(workspaceId), "notifications"] as const,
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
    contentStrategy: (workspaceId: string, strategyId: string) =>
      [...workspaceDetail(workspaceId), "content-strategies", "detail", strategyId] as const,
  },
  health: {
    all: ["health"] as const,
    readiness: () => ["health", "readiness"] as const,
  },
} as const;
