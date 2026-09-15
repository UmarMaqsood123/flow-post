import { Router } from "express";
import * as HealthController from "../controllers/health.controller";

const HealthRouter = Router();

HealthRouter.get("/live", HealthController.GetLiveness);
HealthRouter.get("/ready", HealthController.GetReadiness);

export { HealthRouter };
