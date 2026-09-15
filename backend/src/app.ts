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

export const createApp = (): Express => {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  // Order matters: logging first so every request (including rejected ones) gets a request id.
  app.use(requestLogger);
  app.use(helmet());
  app.use(corsMiddleware);
  app.use(compression());

  // NOTE: Stripe webhooks need the raw body — mount that route before these parsers.
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use(API_V1_PREFIX, ApiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
