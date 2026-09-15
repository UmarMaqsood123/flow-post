import cors from "cors";
import { env } from "../config/env";
import { CSRF_HEADER } from "../constants/auth.constant";
import { AppError } from "../utils/appError.util";

const allowedOrigins = new Set(env.CORS_ORIGINS);

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Non-browser clients (curl, server-to-server, webhooks) send no Origin header.
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(AppError.forbidden(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", CSRF_HEADER],
  exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
  maxAge: 600,
});
