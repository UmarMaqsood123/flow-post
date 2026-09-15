import pino from "pino";
import { env, isDevelopment } from "./env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "flowpost-api", env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[REDACTED]",
  },
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname,service,env",
          },
        },
      }
    : {}),
});

export type Logger = typeof logger;
