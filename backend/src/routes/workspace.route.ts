import { Router } from "express";
import * as BrandProfileController from "../controllers/brandProfile.controller";
import * as SocialAccountController from "../controllers/socialAccount.controller";
import * as FileController from "../controllers/file.controller";
import * as InvitationController from "../controllers/workspaceInvitation.controller";
import * as WorkspaceController from "../controllers/workspace.controller";
import * as MemberController from "../controllers/workspaceMember.controller";
import { WorkspaceRole } from "../constants/workspace.constant";
import { authenticate, noStore } from "../middlewares/auth.middleware";
import { workspaceRateLimiters as limit } from "../middlewares/rateLimiter.middleware";
import {
  requireStorage,
  uploadMultipleFiles,
  uploadSingleFile,
} from "../middlewares/upload.middleware";
import { validate } from "../middlewares/validate.middleware";
import { requireWorkspace, requireWorkspaceRole } from "../middlewares/workspace.middleware";
import { AIRouter } from "./ai.route";
import { ContentStrategyRouter } from "./contentStrategy.route";
import { PostRouter } from "./post.route";
import {
  onboardingStepParamsSchema,
  saveOnboardingStepSchema,
  updateBrandProfileSchema,
} from "../validators/brandProfile.validator";
import { fileParamsSchema, listFilesQuerySchema } from "../validators/file.validator";
import {
  changeMemberRoleSchema,
  createWorkspaceSchema,
  deleteWorkspaceSchema,
  invitationParamsSchema,
  invitationTokenSchema,
  inviteMemberSchema,
  memberParamsSchema,
  updateWorkspaceSchema,
} from "../validators/workspace.validator";

const WorkspaceRouter = Router();

WorkspaceRouter.use(authenticate, noStore);

// ── The user's own workspaces ───────────────────────────────
WorkspaceRouter.get("/", WorkspaceController.ListWorkspaces);
WorkspaceRouter.post(
  "/",
  limit.createWorkspace,
  validate({ body: createWorkspaceSchema }),
  WorkspaceController.CreateWorkspace,
);

// ── Invitation links: the workspace comes from the token, not the client ──
WorkspaceRouter.get(
  "/invitations/preview",
  limit.invitationToken,
  validate({ query: invitationTokenSchema }),
  InvitationController.PreviewInvitation,
);
WorkspaceRouter.post(
  "/invitations/accept",
  limit.invitationToken,
  validate({ body: invitationTokenSchema }),
  InvitationController.AcceptInvitation,
);

// ── Archived workspaces can only be restored by an owner ────
WorkspaceRouter.post(
  "/:workspaceId/restore",
  requireWorkspace({ allowArchived: true }),
  requireWorkspaceRole(WorkspaceRole.OWNER),
  WorkspaceController.RestoreWorkspace,
);

// ── Permanent deletion: owner only, archived first, exact name confirmation ──
WorkspaceRouter.delete(
  "/:workspaceId/permanent",
  requireWorkspace({ allowArchived: true }),
  requireWorkspaceRole(WorkspaceRole.OWNER),
  validate({ body: deleteWorkspaceSchema }),
  WorkspaceController.DeleteWorkspacePermanently,
);

// ── Everything below is authorized by requireWorkspace() ────
const ScopedRouter = Router({ mergeParams: true });
ScopedRouter.use(requireWorkspace());

ScopedRouter.get("/", WorkspaceController.GetWorkspace);
ScopedRouter.patch(
  "/",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  validate({ body: updateWorkspaceSchema }),
  WorkspaceController.UpdateWorkspace,
);
ScopedRouter.delete(
  "/",
  requireWorkspaceRole(WorkspaceRole.OWNER),
  WorkspaceController.ArchiveWorkspace,
);
ScopedRouter.post("/switch", WorkspaceController.SwitchWorkspace);

// Members — any member can view the team and leave; admins manage others (rules in the service).
ScopedRouter.get("/members", MemberController.ListMembers);
ScopedRouter.patch(
  "/members/:memberId",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  validate({ params: memberParamsSchema, body: changeMemberRoleSchema }),
  MemberController.ChangeMemberRole,
);
ScopedRouter.delete(
  "/members/:memberId",
  validate({ params: memberParamsSchema }),
  MemberController.RemoveMember,
);

// Invitations — admins and owners only.
ScopedRouter.get(
  "/invitations",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  InvitationController.ListInvitations,
);
ScopedRouter.post(
  "/invitations",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  limit.inviteMember,
  validate({ body: inviteMemberSchema }),
  InvitationController.CreateInvitation,
);
ScopedRouter.delete(
  "/invitations/:invitationId",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  validate({ params: invitationParamsSchema }),
  InvitationController.RevokeInvitation,
);

// Social accounts — any member can view. Connecting, testing, publishing and disconnecting
// live in routes/socialAccount.route.ts (/api/v1/social-accounts).
ScopedRouter.get("/social-accounts/platforms", SocialAccountController.ListSocialPlatforms);
ScopedRouter.get("/social-accounts", SocialAccountController.ListSocialAccounts);

// Brand profile and onboarding — any member can view; admins and owners edit.
ScopedRouter.get("/brand-profile", BrandProfileController.GetBrandProfile);
ScopedRouter.patch(
  "/brand-profile",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  validate({ body: updateBrandProfileSchema }),
  BrandProfileController.UpdateBrandProfile,
);
ScopedRouter.post(
  "/brand-profile/onboarding/steps/:step",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  validate({ params: onboardingStepParamsSchema, body: saveOnboardingStepSchema }),
  BrandProfileController.SaveOnboardingStep,
);
ScopedRouter.post(
  "/brand-profile/onboarding/complete",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  BrandProfileController.CompleteOnboarding,
);

// Files — any member can view; editors upload; uploaders or admins delete (rules in the service).
// Auth, workspace and role checks run before multer, so nothing is buffered for unauthorized users.
ScopedRouter.get("/files", validate({ query: listFilesQuerySchema }), FileController.ListFiles);
ScopedRouter.post(
  "/files",
  requireWorkspaceRole(WorkspaceRole.EDITOR),
  requireStorage,
  limit.uploadFile,
  uploadSingleFile,
  FileController.UploadFile,
);
ScopedRouter.post(
  "/files/batch",
  requireWorkspaceRole(WorkspaceRole.EDITOR),
  requireStorage,
  limit.uploadFile,
  uploadMultipleFiles,
  FileController.UploadFiles,
);
ScopedRouter.delete(
  "/files/:fileId",
  requireWorkspaceRole(WorkspaceRole.EDITOR),
  validate({ params: fileParamsSchema }),
  FileController.DeleteFile,
);

// AI generation — editors generate; admins view usage. Prompts live in integrations/ai/prompts.
ScopedRouter.use("/ai", AIRouter);

// Content strategy versions — members view; editors generate and edit drafts; admins activate.
ScopedRouter.use("/content-strategies", ContentStrategyRouter);

// AI Create: posts and their version history.
ScopedRouter.use("/posts", PostRouter);

WorkspaceRouter.use("/:workspaceId", ScopedRouter);

export { WorkspaceRouter };
