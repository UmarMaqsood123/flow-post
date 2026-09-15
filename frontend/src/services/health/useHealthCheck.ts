import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export interface HealthReadiness {
  status: "ok";
  checks: Record<string, "up" | "down">;
  timestamp: string;
}

function useHealthCheck() {
  return useQuery({
    queryKey: queryKeys.health.readiness(),
    queryFn: async () => (await api.get<HealthReadiness>("/health/ready")).data,
    refetchInterval: 30_000,
  });
}

export default useHealthCheck;
