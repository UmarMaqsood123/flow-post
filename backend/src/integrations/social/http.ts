import type { SocialPlatformValue } from "../../constants/social.constant";
import { SocialProviderError } from "./errors";

/** The subset of `fetch` providers use; injectable so tests never hit the network. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * `fetch` with a timeout. Network failures and timeouts become retryable
 * PROVIDER_ERRORs whose message never includes the URL or request details.
 */
export const providerFetch = async (
  fetchImpl: FetchLike,
  provider: { platform: SocialPlatformValue; displayName: string },
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> => {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (cause) {
    throw new SocialProviderError(
      "PROVIDER_ERROR",
      `Couldn't reach ${provider.displayName}. Please try again.`,
      { platform: provider.platform, retryable: true, cause },
    );
  }
};

export const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const retryAfterSeconds = (response: Response): number | undefined => {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
