/**
 * Client-side Deepgram token cache with in-flight dedup and bounded retries.
 * Never loops deepgram-token on persistent failure — marks unavailable and stops.
 */

import { fetchEdgeJson } from "@/lib/network/fetchEdge";

export const MAX_DEEPGRAM_TOKEN_ATTEMPTS = 3;

export type DeepgramTokenResponse = {
  token: string;
  expires_in: number;
  key_id: string | null;
  type: "scoped" | "raw";
};

export type CachedDeepgramToken = DeepgramTokenResponse & {
  expires_at_ms: number;
};

let cached: CachedDeepgramToken | null = null;
let inflight: Promise<CachedDeepgramToken> | null = null;
let consecutiveFailures = 0;
let blocked = false;

export function isDeepgramTokenBlocked(): boolean {
  return blocked;
}

export function resetDeepgramTokenClient(): void {
  cached = null;
  inflight = null;
  consecutiveFailures = 0;
  blocked = false;
}

/** Refresh buffer: leave meaningful lifetime (e.g. refresh ~15s before expiry when TTL >= 60s). */
export function deepgramTokenRefreshBufferSeconds(expiresInSec: number): number {
  if (expiresInSec >= 60) return Math.min(15, Math.max(5, expiresInSec - 15));
  return Math.max(5, Math.floor(expiresInSec * 0.25));
}

function isTokenFresh(entry: CachedDeepgramToken, nowMs = Date.now()): boolean {
  const bufferMs = deepgramTokenRefreshBufferSeconds(entry.expires_in) * 1000;
  return nowMs + bufferMs < entry.expires_at_ms;
}

export async function fetchDeepgramTokenBounded(options?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<CachedDeepgramToken> {
  if (blocked && !options?.force) {
    throw new Error(
      "Live transcription is unavailable. You can still type questions in Chat.",
    );
  }

  const now = Date.now();
  if (!options?.force && cached && isTokenFresh(cached, now)) {
    return cached;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const data = await fetchEdgeJson<DeepgramTokenResponse>(
        "deepgram-token",
        {},
        { signal: options?.signal },
      );
      if (!data?.token) {
        throw new Error("Deepgram token response missing token field");
      }

      const entry: CachedDeepgramToken = {
        ...data,
        expires_at_ms: Date.now() + data.expires_in * 1000,
      };
      cached = entry;
      consecutiveFailures = 0;
      blocked = false;
      return entry;
    } catch (err) {
      consecutiveFailures += 1;
      cached = null;
      if (consecutiveFailures >= MAX_DEEPGRAM_TOKEN_ATTEMPTS) {
        blocked = true;
      }

      const msg = err instanceof Error ? err.message : String(err ?? "");
      if (/503|502|unavailable|misconfigured|SERVICE_UNAVAILABLE|MISSING_PROJECT_ID/i.test(msg)) {
        throw new Error(
          "Live transcription is unavailable. You can still type questions in Chat.",
        );
      }
      throw new Error(
        msg.trim() || "Could not start speech recognition. Please try again.",
      );
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
