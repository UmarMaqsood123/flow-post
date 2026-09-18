import { Router } from "express";
import { apiRateLimiter } from "../middlewares/rateLimiter.middleware";
import { AdminRouter } from "./admin.route";
import { AuthRouter } from "./auth.route";
import { BillingRouter } from "./billing.route";
import { ContactRouter } from "./contact.route";
import { HealthRouter } from "./health.route";
import { NotificationRouter } from "./notification.route";
import { PlansRouter } from "./plans.route";
import { SocialAccountRouter } from "./socialAccount.route";
import { WorkspaceRouter } from "./workspace.route";

/** All routes mounted under /api/v1. */
const ApiV1Router = Router();

// Health checks are exempt from rate limiting so probes never get throttled.
ApiV1Router.use("/health", HealthRouter);

ApiV1Router.use(apiRateLimiter);

ApiV1Router.use("/auth", AuthRouter);
ApiV1Router.use("/workspaces", WorkspaceRouter);
ApiV1Router.use("/billing", BillingRouter);
ApiV1Router.use("/contact", ContactRouter);
ApiV1Router.use("/plans", PlansRouter);
ApiV1Router.use("/admin", AdminRouter);
ApiV1Router.use("/notifications", NotificationRouter);
ApiV1Router.use("/social-accounts", SocialAccountRouter);
// Workspace-owned feature routers mount under /workspaces/:workspaceId with requireWorkspace(), e.g.:
// ScopedRouter.use("/posts", PostsRouter);

export { ApiV1Router };
