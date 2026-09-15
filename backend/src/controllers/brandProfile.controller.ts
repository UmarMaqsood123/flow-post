import type { Request, Response } from "express";
import * as BrandProfileService from "../services/brandProfile.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type {
  OnboardingStepParams,
  SaveOnboardingStepInput,
  UpdateBrandProfileInput,
} from "../validators/brandProfile.validator";

export const GetBrandProfile = async (req: Request, res: Response) => {
  const brandProfile = await BrandProfileService.getBrandProfile(getWorkspaceContext(req));
  sendSuccess(res, { message: "Brand profile", data: { brandProfile } });
};

export const UpdateBrandProfile = async (req: Request, res: Response) => {
  const brandProfile = await BrandProfileService.updateBrandProfile(
    getWorkspaceContext(req),
    req.body as UpdateBrandProfileInput,
  );
  sendSuccess(res, { message: "Brand profile saved", data: { brandProfile } });
};

export const SaveOnboardingStep = async (req: Request, res: Response) => {
  const { step } = req.params as OnboardingStepParams;
  const input = req.body as SaveOnboardingStepInput;
  const brandProfile = await BrandProfileService.saveOnboardingStep(
    getWorkspaceContext(req),
    step,
    input,
  );
  sendSuccess(res, {
    message: input.skipped ? "Step skipped" : "Step saved",
    data: { brandProfile },
  });
};

export const CompleteOnboarding = async (req: Request, res: Response) => {
  const brandProfile = await BrandProfileService.completeOnboarding(getWorkspaceContext(req));
  sendSuccess(res, { message: "Onboarding complete", data: { brandProfile } });
};
