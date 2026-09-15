import type { Request, Response } from "express";
import { isDatabaseHealthy } from "../config/database";
import { isRedisHealthy } from "../config/redis";
import { sendSuccess } from "../utils/apiResponse.util";
import { AppError } from "../utils/appError.util";

type DependencyStatus = "up" | "down";

/** Liveness: the process is running. Used by orchestrators to restart hung pods. */
export const GetLiveness = (_req: Request, res: Response) => {
  sendSuccess(res, {
    message: "Service is alive",
    data: {
      status: "ok",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
};

/** Readiness: dependencies are reachable. Used by load balancers to route traffic. */
export const GetReadiness = (_req: Request, res: Response) => {
  const checks: Record<string, DependencyStatus> = {
    database: isDatabaseHealthy() ? "up" : "down",
    redis: isRedisHealthy() ? "up" : "down",
  };

  if (Object.values(checks).some((status) => status === "down")) {
    throw AppError.serviceUnavailable("Service is not ready", checks);
  }

  sendSuccess(res, {
    message: "Service is ready",
    data: { status: "ok", checks, timestamp: new Date().toISOString() },
  });
};
