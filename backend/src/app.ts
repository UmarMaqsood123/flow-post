import compression from "compression";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { API_V1_PREFIX } from "./constants/http.constant";
import { corsMiddleware } from "./middlewares/cors.middleware";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import { notFoundHandler } from "./middlewares/notFound.middleware";
import { requestLogger } from "./middlewares/requestLogger.middleware";
import { ApiV1Router } from "./routes";
import * as BillingController from "./controllers/billing.controller";

export const createApp = (): Express => {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  // Order matters: logging first so every request (including rejected ones) gets a request id.
  app.use(requestLogger);
  app.use(helmet());
  app.use(corsMiddleware);
  // Event streams must reach the client frame by frame; compression buffers them.
  app.use(
    compression({
      filter: (req, res) =>
        !String(res.getHeader("Content-Type") ?? "").startsWith("text/event-stream") &&
        compression.filter(req, res),
    }),
  );

  // Stripe signs the exact bytes it sends, so the webhook reads the raw body and
  // is mounted before the JSON parser. It has no auth: the signature is the auth.
  app.post(
    `${API_V1_PREFIX}/billing/webhook`,
    express.raw({ type: "application/json", limit: "1mb" }),
    BillingController.StripeWebhook,
  );

  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: env.JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use(API_V1_PREFIX, ApiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
