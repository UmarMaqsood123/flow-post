import { Router } from "express";
import * as AdminController from "../controllers/admin.controller";
import { authenticate, noStore, requireSuperAdmin } from "../middlewares/auth.middleware";
import { adminRateLimiter } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  adminIdParamsSchema as params,
  aiUsageQuerySchema,
  inspectUsageQuerySchema,
  listAuditLogsQuerySchema,
  listPublishingFailuresQuerySchema,
  listSocialConnectionsQuerySchema,
  listSubscriptionsQuerySchema,
  listUsersQuerySchema,
  listWorkspacesQuerySchema,
  reactivateUserSchema,
  suspendUserSchema,
} from "../validators/admin.validator";
import {
  listContactMessagesQuerySchema,
  updateContactMessageSchema,
} from "../validators/contact.validator";

/**
 * /api/v1/admin: the super admin panel. The role is re-read from the database on
 * every request (authenticate loads the user), so revoking it takes effect at once.
 * Anyone else gets a 404, so the API doesn't reveal that it exists.
 */
const AdminRouter = Router();

AdminRouter.use(authenticate, requireSuperAdmin, noStore, adminRateLimiter);

AdminRouter.get("/dashboard", AdminController.GetDashboard);

AdminRouter.get("/users", validate({ query: listUsersQuerySchema }), AdminController.ListUsers);
AdminRouter.get("/users/:id", validate({ params }), AdminController.GetUser);
AdminRouter.post(
  "/users/:id/suspend",
  validate({ params, body: suspendUserSchema }),
  AdminController.SuspendUser,
);
AdminRouter.post(
  "/users/:id/reactivate",
  validate({ params, body: reactivateUserSchema }),
  AdminController.ReactivateUser,
);

AdminRouter.get(
  "/workspaces",
  validate({ query: listWorkspacesQuerySchema }),
  AdminController.ListWorkspaces,
);
AdminRouter.get("/workspaces/:id", validate({ params }), AdminController.GetWorkspace);

AdminRouter.get(
  "/subscriptions",
  validate({ query: listSubscriptionsQuerySchema }),
  AdminController.ListSubscriptions,
);
AdminRouter.get("/subscriptions/:id", validate({ params }), AdminController.GetSubscription);
AdminRouter.get("/plans", AdminController.ListPlans);

AdminRouter.get("/ai-usage", validate({ query: aiUsageQuerySchema }), AdminController.GetAIUsage);
AdminRouter.get(
  "/social-connections",
  validate({ query: listSocialConnectionsQuerySchema }),
  AdminController.ListSocialConnections,
);
AdminRouter.get(
  "/publishing-failures",
  validate({ query: listPublishingFailuresQuerySchema }),
  AdminController.ListPublishingFailures,
);
AdminRouter.get(
  "/usage",
  validate({ query: inspectUsageQuerySchema }),
  AdminController.InspectUsage,
);
AdminRouter.get(
  "/audit-logs",
  validate({ query: listAuditLogsQuerySchema }),
  AdminController.ListAuditLogs,
);

AdminRouter.get(
  "/contact-messages",
  validate({ query: listContactMessagesQuerySchema }),
  AdminController.ListContactMessages,
);
AdminRouter.patch(
  "/contact-messages/:id",
  validate({ params, body: updateContactMessageSchema }),
  AdminController.UpdateContactMessage,
);

export { AdminRouter };
