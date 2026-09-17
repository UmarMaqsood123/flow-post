import type { Request, Response } from "express";
import * as AnalyticsService from "../services/analytics.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type { AnalyticsQueryInput } from "../validators/analytics.validator";

export const GetAnalytics = async (req: Request, res: Response) => {
  const { from, to, platform } = req.query as unknown as AnalyticsQueryInput;
  const report = await AnalyticsService.getReport(getWorkspaceContext(req), { from, to, platform });
  sendSuccess(res, { message: "Analytics", data: report });
};

export const GetDashboard = async (req: Request, res: Response) => {
  const summary = await AnalyticsService.getDashboardSummary(getWorkspaceContext(req));
  sendSuccess(res, { message: "Dashboard", data: summary });
};

/** Collects now instead of waiting for the worker's next sweep. */
export const RefreshAnalytics = async (req: Request, res: Response) => {
  const { workspace } = getWorkspaceContext(req);
  const result = await AnalyticsService.collectWorkspaceAnalytics(workspace._id);
  sendSuccess(res, { message: "Analytics updated", data: result });
};
