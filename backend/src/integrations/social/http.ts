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
    // A timeout may have been cut off after the platform received the request,
    // so the caller can't assume nothing happened.
    const timedOut =
      cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
    throw new SocialProviderError(
      "PROVIDER_ERROR",
      timedOut
        ? `${provider.displayName} took too long to respond.`
        : `Couldn't reach ${provider.displayName}. Please try again.`,
      { platform: provider.platform, retryable: true, outcomeUnknown: timedOut, cause },
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

/**
 * A view over bytes for a request body, without copying. Video uploads can be
 * hundreds of megabytes; `new Uint8Array(buffer)` would duplicate them in memory.
 */
export const asBody = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
