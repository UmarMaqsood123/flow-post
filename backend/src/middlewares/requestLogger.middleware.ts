import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../config/logger";
import { API_V1_PREFIX } from "../constants/http.constant";

const MAX_REQUEST_ID_LENGTH = 128;
const QUIET_PATHS = new Set([`${API_V1_PREFIX}/health/live`, `${API_V1_PREFIX}/health/ready`]);

/**
 * Structured request logging. Assigns `req.id` (reusing an incoming
 * `X-Request-Id` when valid) and exposes a request-scoped `req.log`.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"];
    const id =
      typeof incoming === "string" &&
      incoming.length > 0 &&
      incoming.length <= MAX_REQUEST_ID_LENGTH
        ? incoming
        : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${req.url} ${res.statusCode} ${Math.round(responseTime)}ms`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  autoLogging: {
    ignore: (req) => QUIET_PATHS.has(req.url ?? ""),
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
