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
  },
  health: {
    all: ["health"] as const,
    readiness: () => ["health", "readiness"] as const,
  },
} as const;
