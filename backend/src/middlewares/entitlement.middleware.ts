import type { NextFunction, Request, Response } from "express";
import type { FeatureKey } from "../constants/billing.constant";
import * as EntitlementService from "../services/entitlement.service";
import { getWorkspaceContext } from "../utils/workspaceContext.util";

/** Blocks a workspace route unless the plan covering the workspace includes the feature. */
export const requireFeature =
  (feature: FeatureKey) => async (req: Request, _res: Response, next: NextFunction) => {
    await EntitlementService.assertFeature(getWorkspaceContext(req).workspace, feature);
    next();
  };
