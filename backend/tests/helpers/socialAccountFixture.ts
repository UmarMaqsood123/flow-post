import { Types } from "mongoose";
import { SocialAccountStatus } from "../../src/constants/social.constant";
import { SocialAccount, type SocialAccountDocument } from "../../src/models/socialAccount.model";
import { getTokenSecretBox } from "../../src/utils/encryption.util";
import type { MockSocialProvider } from "./mockSocialProvider";

const tokenContext = (
  workspaceId: string,
  platform: string,
  providerAccountId: string,
  field: "access" | "refresh",
) => `social-account:${workspaceId}:${platform}:${providerAccountId}:${field}`;

interface ConnectedAccountOptions {
  workspaceId: string;
  /** The user who "connected" it. */
  connectedBy: string;
  provider: MockSocialProvider;
  accountName?: string;
  /** Null means the stored token never expires. */
  tokenExpiresAt?: Date | null;
  status?: (typeof SocialAccountStatus)[keyof typeof SocialAccountStatus];
}

/**
 * A connected account holding tokens the mock provider recognises, created the
 * short way: the provider issues real (mock) tokens through its OAuth methods.
 */
export const createConnectedAccount = async ({
  workspaceId,
  connectedBy,
  provider,
  accountName = "Mock Company",
  tokenExpiresAt,
  status = SocialAccountStatus.CONNECTED,
}: ConnectedAccountOptions): Promise<SocialAccountDocument> => {
  const redirectUri = "https://app.test/callback";
  const authorization = await provider.getAuthorizationUrl({ state: "fixture-state", redirectUri });
  const { code } = provider.approve(authorization.url);
  const connection = await provider.handleOAuthCallback({ code, redirectUri });

  const box = getTokenSecretBox();
  if (!box) throw new Error("TOKEN_ENCRYPTION_KEY is required for social account fixtures");
  const providerAccountId = connection.profile.providerAccountId;

  return SocialAccount.create({
    workspace: new Types.ObjectId(workspaceId),
    platform: provider.platform,
    providerAccountId,
    accountName,
    username: connection.profile.username,
    profileImage: connection.profile.profileImage,
    encryptedAccessToken: box.encrypt(
      connection.tokens.accessToken,
      tokenContext(workspaceId, provider.platform, providerAccountId, "access"),
    ),
    encryptedRefreshToken: connection.tokens.refreshToken
      ? box.encrypt(
          connection.tokens.refreshToken,
          tokenContext(workspaceId, provider.platform, providerAccountId, "refresh"),
        )
      : null,
    tokenExpiresAt: tokenExpiresAt === undefined ? connection.tokens.expiresAt : tokenExpiresAt,
    scopes: connection.tokens.scopes,
    status,
    connectedBy: new Types.ObjectId(connectedBy),
    lastConnectedAt: new Date(),
    metadata: connection.profile.metadata ?? {},
  });
};
