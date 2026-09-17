import type { Request, Response } from "express";
import * as AdminMetrics from "../services/adminMetrics.service";
import * as AdminService from "../services/admin.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getAuthenticatedUser } from "../utils/request.util";
import type {
  AIUsageQuery,
  InspectUsageQuery,
  ListAuditLogsQuery,
  ListPublishingFailuresQuery,
  ListSocialConnectionsQuery,
  ListSubscriptionsQuery,
  ListUsersQuery,
  ListWorkspacesQuery,
  ReactivateUserInput,
  SuspendUserInput,
} from "../validators/admin.validator";

type IdParams = { id: string };
const actor = (req: Request): AdminService.AdminActor => ({
  user: getAuthenticatedUser(req),
  request: req,
});
const query = <T>(req: Request) => req.query as unknown as T;

export const GetDashboard = async (_req: Request, res: Response) => {
  sendSuccess(res, { message: "Admin dashboard", data: await AdminMetrics.getDashboard() });
};

export const ListUsers = async (req: Request, res: Response) => {
  sendSuccess(res, {
    message: "Users",
    data: await AdminService.listUsers(query<ListUsersQuery>(req)),
  });
};

export const GetUser = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  sendSuccess(res, { message: "User", data: await AdminService.getUserDetails(actor(req), id) });
};

export const SuspendUser = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const { reason } = req.body as SuspendUserInput;
  const user = await AdminService.suspendUser(actor(req), id, reason);
  sendSuccess(res, { message: "User suspended", data: user });
};

export const ReactivateUser = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const { reason } = req.body as ReactivateUserInput;
  const user = await AdminService.reactivateUser(actor(req), id, reason);
  sendSuccess(res, { message: "User reactivated", data: user });
};

export const ListWorkspaces = async (req: Request, res: Response) => {
  sendSuccess(res, {
    message: "Workspaces",
    data: await AdminService.listWorkspaces(query<ListWorkspacesQuery>(req)),
  });
};

export const GetWorkspace = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  sendSuccess(res, {
    message: "Workspace",
    data: await AdminService.getWorkspaceDetails(actor(req), id),
  });
};

export const ListSubscriptions = async (req: Request, res: Response) => {
  sendSuccess(res, {
    message: "Subscriptions",
    data: await AdminService.listSubscriptions(query<ListSubscriptionsQuery>(req)),
  });
};

export const GetSubscription = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  sendSuccess(res, {
    message: "Subscription",
    data: await AdminService.getSubscriptionDetails(actor(req), id),
  });
};

export const ListPlans = async (_req: Request, res: Response) => {
  sendSuccess(res, { message: "Plans", data: await AdminService.listPlans() });
};

export const GetAIUsage = async (req: Request, res: Response) => {
  sendSuccess(res, {
    message: "AI usage",
    data: await AdminMetrics.getAIUsageReport(query<AIUsageQuery>(req)),
  });
};

export const ListSocialConnections = async (req: Request, res: Response) => {
  sendSuccess(res, {
    message: "Social connections",
    data: await AdminService.listSocialConnections(query<ListSocialConnectionsQuery>(req)),
  });
};

export const ListPublishingFailures = async (req: Request, res: Response) => {
  sendSuccess(res, {
    message: "Publishing failures",
    data: await AdminService.listPublishingFailures(query<ListPublishingFailuresQuery>(req)),
  });
};

export const InspectUsage = async (req: Request, res: Response) => {
  sendSuccess(res, {
    message: "Usage",
    data: await AdminService.inspectUsage(actor(req), query<InspectUsageQuery>(req)),
  });
};

export const ListAuditLogs = async (req: Request, res: Response) => {
  sendSuccess(res, {
    message: "Audit log",
    data: await AdminService.listAuditLogs(query<ListAuditLogsQuery>(req)),
  });
};
