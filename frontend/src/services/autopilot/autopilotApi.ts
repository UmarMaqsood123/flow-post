import { api } from "@/lib/api";
import type {
  AutopilotEventPage,
  AutopilotEventType,
  AutopilotOverview,
  AutopilotSettings,
  AutopilotSettingsPayload,
  AutopilotSlot,
} from "@/types/autopilot";
import type { Post } from "@/types/post";

const autopilotPath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/autopilot`;

export const autopilotApi = {
  overview: async (workspaceId: string) =>
    (await api.get<AutopilotOverview>(autopilotPath(workspaceId))).data,

  updateSettings: async (workspaceId: string, payload: AutopilotSettingsPayload) =>
    (await api.put<AutopilotSettings>(`${autopilotPath(workspaceId)}/settings`, payload)).data,

  start: async (workspaceId: string) =>
    (await api.post<AutopilotSettings>(`${autopilotPath(workspaceId)}/start`)).data,

  pause: async (workspaceId: string, reason?: string) =>
    (await api.post<AutopilotSettings>(`${autopilotPath(workspaceId)}/pause`, { reason })).data,

  approve: async (workspaceId: string, postId: string, scheduledAt?: string) =>
    (
      await api.post<Post>(
        `${autopilotPath(workspaceId)}/posts/${encodeURIComponent(postId)}/approve`,
        scheduledAt ? { scheduledAt } : {},
      )
    ).data,

  reject: async (workspaceId: string, postId: string, reason?: string) =>
    (
      await api.post<Post>(
        `${autopilotPath(workspaceId)}/posts/${encodeURIComponent(postId)}/reject`,
        { reason },
      )
    ).data,

  retrySlot: async (workspaceId: string, slotId: string) =>
    (
      await api.post<AutopilotSlot>(
        `${autopilotPath(workspaceId)}/slots/${encodeURIComponent(slotId)}/retry`,
      )
    ).data,

  events: async (
    workspaceId: string,
    query: { type?: AutopilotEventType; before?: string; limit?: number },
  ) => {
    const params = new URLSearchParams({ limit: String(query.limit ?? 30) });
    if (query.type) params.set("type", query.type);
    if (query.before) params.set("before", query.before);
    return (
      await api.get<AutopilotEventPage>(`${autopilotPath(workspaceId)}/events?${params.toString()}`)
    ).data;
  },
};
