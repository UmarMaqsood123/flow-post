/**
 * Page discovery and resumable video upload, shared by the Facebook and
 * Instagram providers: both start from the Pages a Facebook login granted.
 */
import { SocialProviderError } from "../errors";
import { type FetchLike, isRecord } from "../http";
import type { MediaAsset } from "../types";
import { type GraphClient, type GraphProviderRef, GRAPH_HOST, requireString } from "./graph";
import { asBody } from "../http";

/** Graph API version this integration is written against (released July 2026). */
export const DEFAULT_GRAPH_VERSION = "v26.0";

/**
 * Publishing to a Page needs all three: show_list to find it, read_engagement
 * as a dependency of the posting scope, manage_posts to publish.
 * https://developers.facebook.com/docs/permissions
 */
export const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  // Page and post insights; without it /insights returns nothing at all.
  "read_insights",
] as const;

/**
 * Instagram through Facebook Login: the professional account must be linked to
 * a Page, so the Page scopes come along with the Instagram ones.
 * https://developers.facebook.com/docs/instagram-platform/overview
 */
export const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  // Media and account insights.
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
] as const;

/** The task a user needs on a Page before they can publish to it. */
export const CREATE_CONTENT_TASK = "CREATE_CONTENT";

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
  username: string | null;
  picture: string | null;
  category: string | null;
  tasks: string[];
  /** The linked Instagram professional account, when there is one. */
  instagramAccountId: string | null;
  instagramUsername: string | null;
  instagramName: string | null;
  instagramPicture: string | null;
}

const pictureUrl = (value: unknown): string | null => {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  return typeof value.data.url === "string" ? value.data.url : null;
};

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

/**
 * Every Page the login granted, with its Page access token and any linked
 * Instagram account. Pages the user can't publish to are left out: connecting
 * one would only fail later, at publish time.
 * https://developers.facebook.com/docs/graph-api/reference/user/accounts/
 */
export const readPages = async (
  graph: GraphClient,
  userAccessToken: string,
): Promise<MetaPage[]> => {
  const rows = await graph.collect({
    path: "/me/accounts",
    query: {
      fields:
        "id,name,username,category,access_token,tasks,picture{url}," +
        "instagram_business_account{id,username,name,profile_picture_url}",
      limit: 100,
    },
    accessToken: userAccessToken,
  });

  const pages: MetaPage[] = [];
  for (const row of rows) {
    const id = str(row.id);
    const name = str(row.name);
    const accessToken = str(row.access_token);
    if (!id || !name || !accessToken) continue;

    const tasks = Array.isArray(row.tasks)
      ? row.tasks.filter((task): task is string => typeof task === "string")
      : [];
    if (!tasks.includes(CREATE_CONTENT_TASK)) continue;

    const instagram = isRecord(row.instagram_business_account)
      ? row.instagram_business_account
      : null;
    pages.push({
      id,
      name,
      accessToken,
      username: str(row.username),
      picture: pictureUrl(row.picture),
      category: str(row.category),
      tasks,
      instagramAccountId: instagram ? str(instagram.id) : null,
      instagramUsername: instagram ? str(instagram.username) : null,
      instagramName: instagram ? str(instagram.name) : null,
      instagramPicture: instagram ? str(instagram.profile_picture_url) : null,
    });
  }
  return pages;
};

interface ResumableUploadInput {
  graph: GraphClient;
  fetchImpl: FetchLike;
  provider: GraphProviderRef;
  appId: string;
  accessToken: string;
  video: MediaAsset;
  timeoutMs?: number;
}

/**
 * Meta's resumable upload, which is the only way to send a video file for a
 * standard Page video. Returns the file handle the /videos endpoint wants.
 *
 * Note the host: graph-video.facebook.com is deprecated, so every phase goes to
 * graph.facebook.com even though some of Meta's own samples still show the old one.
 * https://developers.facebook.com/docs/video-api/guides/publishing/
 */
export const uploadResumableVideo = async ({
  graph,
  fetchImpl,
  provider,
  appId,
  accessToken,
  video,
  timeoutMs = 120_000,
}: ResumableUploadInput): Promise<string> => {
  if (!video.read) {
    throw new SocialProviderError("INVALID_REQUEST", "That video can't be read for upload.", {
      platform: provider.platform,
    });
  }
  const bytes = await video.read();
  if (bytes.byteLength === 0) {
    throw new SocialProviderError("INVALID_REQUEST", "That video file is empty.", {
      platform: provider.platform,
    });
  }

  const session = await graph.request({
    path: `/${appId}/uploads`,
    method: "POST",
    query: {
      file_name: video.url.split("/").pop() ?? "video.mp4",
      file_length: bytes.byteLength,
      file_type: video.mimeType,
    },
    accessToken,
  });
  const sessionId = requireString(provider, session, "id");

  const response = await fetchImpl(`${GRAPH_HOST}/${graph.version}/${sessionId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${accessToken}`, file_offset: "0" },
    body: asBody(bytes),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    // The bytes may or may not have landed; the caller hasn't published yet, so
    // there's no risk of a duplicate post either way.
    throw new SocialProviderError(
      "PROVIDER_ERROR",
      `${provider.displayName} wouldn't accept the video upload.`,
      { platform: provider.platform, retryable: true },
    );
  }
  const body = (await response.json().catch(() => null)) as unknown;
  return requireString(provider, body, "h");
};
