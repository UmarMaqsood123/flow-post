import type { Request, Response } from "express";
import * as PerformanceInsightsService from "../services/performanceInsights.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type {
  DecideInsightInput,
  InsightParams,
  ReportParams,
} from "../validators/insights.validator";

/** The latest report, recent report history and what's currently steering generation. */
export const GetInsightsOverview = async (req: Request, res: Response) => {
  const context = getWorkspaceContext(req);
  const [latest, reports, approved] = await Promise.all([
    PerformanceInsightsService.getLatestReport(context),
    PerformanceInsightsService.listReports(context),
    PerformanceInsightsService.getApprovedInsights(context),
  ]);
  sendSuccess(res, { message: "Performance insights", data: { latest, reports, approved } });
};

export const GetInsightReport = async (req: Request, res: Response) => {
  const { reportId } = req.params as unknown as ReportParams;
  const report = await PerformanceInsightsService.getReport(getWorkspaceContext(req), reportId);
  sendSuccess(res, { message: "Insight report", data: report });
};

export const GenerateInsightReport = async (req: Request, res: Response) => {
  const report = await PerformanceInsightsService.generateReport(getWorkspaceContext(req));
  sendSuccess(res, { statusCode: 201, message: "Insight report generated", data: report });
};

export const DecideInsight = async (req: Request, res: Response) => {
  const { reportId, insightId } = req.params as unknown as InsightParams;
  const { status } = req.body as DecideInsightInput;
  const report = await PerformanceInsightsService.decideInsight(
    getWorkspaceContext(req),
    reportId,
    insightId,
    status,
  );
  const message =
    status === "APPROVED"
      ? "Insight approved. AI writing will take it into account."
      : status === "DISMISSED"
        ? "Insight dismissed"
        : "Insight reset to pending";
  sendSuccess(res, { message, data: report });
};
