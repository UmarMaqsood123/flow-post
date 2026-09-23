import { z } from "zod";
import { SOCIAL_PLATFORMS } from "../constants/social.constant";
import { objectIdField } from "./common.validator";

/** URL slug ("linkedin") → platform ("LINKEDIN"). */
const platformSlugField = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.enum(SOCIAL_PLATFORMS, { error: "Unsupported platform" }));

export const socialPlatformParamsSchema = z.object({
  platform: platformSlugField,
});

export const connectSocialAccountQuerySchema = z.object({
  workspaceId: objectIdField,
});

/** Starting a connection can also say how to sign in, for platforms that offer a choice. */
export const startConnectionQuerySchema = connectSocialAccountQuerySchema.extend({
  method: z
    .string()
    .trim()
    .regex(/^[a-z_]{1,32}$/, "Unknown sign-in method")
    .optional(),
});

/** What the platform appends to the redirect: a code on success, an error when declined. */
export const oauthCallbackQuerySchema = z.object({
  code: z.string().max(4096).optional(),
  state: z.string().max(512).optional(),
  error: z.string().max(200).optional(),
  // Meta sends error=access_denied&error_reason=user_denied when the user declines.
  error_reason: z.string().max(200).optional(),
  error_description: z.string().max(1000).optional(),
});

export const socialAccountIdParamsSchema = z.object({
  accountId: objectIdField,
});

export const connectionDraftParamsSchema = z.object({
  draftId: objectIdField,
});

/** Which of the accounts a pending authorization covers the user wants to connect. */
export const chooseConnectionTargetSchema = z.object({
  targetId: z.string().trim().min(1, "Choose an account").max(256),
});

/** Platform-specific limits (e.g. LinkedIn's 3,000 characters) are enforced by the provider. */
export const publishSocialPostSchema = z
  .object({
    text: z.string({ error: "Text must be a string" }).trim().max(10_000).default(""),
    fileId: objectIdField.optional(),
  })
  .refine((input) => input.text.length > 0 || input.fileId, {
    message: "Write something or attach an image",
    path: ["text"],
  });

export type SocialPlatformParams = z.infer<typeof socialPlatformParamsSchema>;
export type ConnectSocialAccountQuery = z.infer<typeof connectSocialAccountQuerySchema>;
export type StartConnectionQuery = z.infer<typeof startConnectionQuerySchema>;
export type OAuthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;
export type SocialAccountIdParams = z.infer<typeof socialAccountIdParamsSchema>;
export type PublishSocialPostInput = z.infer<typeof publishSocialPostSchema>;
export type ConnectionDraftParams = z.infer<typeof connectionDraftParamsSchema>;
export type ChooseConnectionTargetInput = z.infer<typeof chooseConnectionTargetSchema>;
