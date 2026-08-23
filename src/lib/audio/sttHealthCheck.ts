/**
 * Remote transcription (Deepgram) health — independent of microphone hardware.
 */

import { ApiClientError } from "@/lib/api/apiClient";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { SttState } from "@/lib/audio/precheckStates";

export const STT_HEALTH_TIMEOUT_MS = 4_000;

export type SttHealthResult = {
  state: SttState;
  status?: number;
  message: string;
};

type TokenResponse = {
  token?: string;
};

export function classifySttFailure(err: unknown): SttHealthResult {
  const status = err instanceof ApiClientError ? err.status : undefined;
  const code = err instanceof ApiClientError ? err.code : "";
  const message = err instanceof Error ? err.message : String(err ?? "");

  if (
    status === 503 ||
    status === 502 ||
    status === 429 ||
    /503|502|unavailable|misconfigured|SERVICE_UNAVAILABLE|MISSING_PROJECT_ID|timed out/i.test(
      `${code} ${message}`,
    )
  ) {
    return {
      state: SttState.STT_UNAVAILABLE,
      status,
      message: "Transcription service is temporarily unavailable.",
    };
  }

  return {
    state: SttState.STT_ERROR,
    status,
    message: "Transcription service check failed.",
  };
}

export async function checkSttHealth(options?: {
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchToken?: () => Promise<TokenResponse>;
}): Promise<SttHealthResult> {
  const timeoutMs = options?.timeoutMs ?? STT_HEALTH_TIMEOUT_MS;
  try {
    const data = options?.fetchToken
      ? await options.fetchToken()
      : await fetchEdgeJson<TokenResponse>("deepgram-token", {}, { timeoutMs, signal: options?.signal });

    if (data?.token) {
      return {
        state: SttState.STT_READY,
        status: 200,
        message: "Transcription service ready",
      };
    }

    return {
      state: SttState.STT_UNAVAILABLE,
      status: 200,
      message: "Transcription service is temporarily unavailable.",
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    if (err instanceof Error && /cancelled/i.test(err.message)) {
      throw err;
    }
    return classifySttFailure(err);
  }
}
