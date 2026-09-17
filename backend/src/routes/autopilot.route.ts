import { Router } from "express";
import { WorkspaceRole } from "../constants/workspace.constant";
import * as AutopilotController from "../controllers/autopilot.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireWorkspaceRole } from "../middlewares/workspace.middleware";
import {
  approveAutopilotPostSchema,
  autopilotPostParamsSchema,
  autopilotSlotParamsSchema,
  listAutopilotEventsQuerySchema,
  pauseAutopilotSchema,
  rejectAutopilotPostSchema,
  updateAutopilotSettingsSchema,
} from "../validators/autopilot.validator";

/**
 * /api/v1/workspaces/:workspaceId/autopilot
 *
 * Any member can see Autopilot and its activity. Editors can pause it (stopping
 * is always safe, so it shouldn't wait for an admin) and approve or reject what
 * it wrote. Only admins change settings, start or resume it.
 */
const AutopilotRouter = Router({ mergeParams: true });

const editor = requireWorkspaceRole(WorkspaceRole.EDITOR);
const admin = requireWorkspaceRole(WorkspaceRole.ADMIN);

AutopilotRouter.get("/", AutopilotController.GetAutopilot);
AutopilotRouter.put(
  "/settings",
  admin,
  validate({ body: updateAutopilotSettingsSchema }),
  AutopilotController.UpdateAutopilotSettings,
);
AutopilotRouter.post("/start", admin, AutopilotController.StartAutopilot);
AutopilotRouter.post(
  "/pause",
  editor,
  validate({ body: pauseAutopilotSchema }),
  AutopilotController.PauseAutopilot,
);
AutopilotRouter.get(
  "/events",
  validate({ query: listAutopilotEventsQuerySchema }),
  AutopilotController.ListAutopilotEvents,
);
AutopilotRouter.post(
  "/posts/:postId/approve",
  editor,
  validate({ params: autopilotPostParamsSchema, body: approveAutopilotPostSchema }),
  AutopilotController.ApproveAutopilotPost,
);
AutopilotRouter.post(
  "/posts/:postId/reject",
  editor,
  validate({ params: autopilotPostParamsSchema, body: rejectAutopilotPostSchema }),
  AutopilotController.RejectAutopilotPost,
);
AutopilotRouter.post(
  "/slots/:slotId/retry",
  admin,
  validate({ params: autopilotSlotParamsSchema }),
  AutopilotController.RetryAutopilotSlot,
);

export { AutopilotRouter };
