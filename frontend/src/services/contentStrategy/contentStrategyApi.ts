import { api } from "@/lib/api";
import type {
  ContentStrategy,
  ContentStrategySummary,
  GeneratedStrategy,
  GenerateStrategyPayload,
  RegenerateStrategyPayload,
  UpdateStrategyPayload,
} from "@/types/contentStrategy";

const strategiesPath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/content-strategies`;
const strategyPath = (workspaceId: string, strategyId: string) =>
  `${strategiesPath(workspaceId)}/${encodeURIComponent(strategyId)}`;

/** Generating a full strategy can take a couple of minutes. */
const GENERATION_TIMEOUT_MS = 5 * 60_000;

type StrategyResponse = { strategy: ContentStrategy };

export const contentStrategyApi = {
  list: async (workspaceId: string) =>
    (await api.get<{ strategies: ContentStrategySummary[] }>(strategiesPath(workspaceId))).data
      .strategies,

  get: async (workspaceId: string, strategyId: string) =>
    (await api.get<StrategyResponse>(strategyPath(workspaceId, strategyId))).data.strategy,

  generate: async (workspaceId: string, payload: GenerateStrategyPayload) =>
    (
      await api.post<GeneratedStrategy, GenerateStrategyPayload>(
        `${strategiesPath(workspaceId)}/generate`,
        payload,
        { timeout: GENERATION_TIMEOUT_MS },
      )
    ).data,

  regenerate: async (workspaceId: string, strategyId: string, payload: RegenerateStrategyPayload) =>
    (
      await api.post<GeneratedStrategy, RegenerateStrategyPayload>(
        `${strategyPath(workspaceId, strategyId)}/regenerate`,
        payload,
        { timeout: GENERATION_TIMEOUT_MS },
      )
    ).data,

  update: async (workspaceId: string, strategyId: string, payload: UpdateStrategyPayload) =>
    (
      await api.patch<StrategyResponse, UpdateStrategyPayload>(
        strategyPath(workspaceId, strategyId),
        payload,
      )
    ).data.strategy,

  remove: async (workspaceId: string, strategyId: string) => {
    await api.delete<null>(strategyPath(workspaceId, strategyId));
  },

  activate: async (workspaceId: string, strategyId: string) =>
    (await api.post<StrategyResponse>(`${strategyPath(workspaceId, strategyId)}/activate`)).data
      .strategy,
};
