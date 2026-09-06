import { supabase } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/auth/accountBootstrap";
import {
  classifyRequestError,
  isAbortLikeError,
} from "@/lib/focusRecovery/retryClassification";
import type {
  SessionHistoryQuery,
  SessionHistoryResponse,
} from "@/lib/session/sessionHistoryTypes";

const SESSION_HISTORY_TIMEOUT_MS = 45_000;
const SESSION_HISTORY_RETRY_TIMEOUT_MS = 60_000;

const BACKEND_LEAK =
  /\b(pgrst|postgrest|postgres|sqlstate|permission denied for|column .* does not exist|relation .* does not exist|rpc_error|aborterror|stack trace|at\s+\S+\s+\()/i;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "";
}

function isTransientSessionHistoryFailure(error: unknown): boolean {
  if (error instanceof SessionHistoryApiError) {
    if (error.code === "INVALID_PAYLOAD" || error.code === "QUERY_FAILED") return false;
    const msg = `${error.message} ${error.detail ?? ""}`.toLowerCase();
    if (
      msg.includes("permission") ||
      msg.includes("not authenticated") ||
      msg.includes("jwt expired")
    ) {
      return false;
    }
    return true;
  }
  const classified = classifyRequestError(error);
  if (classified.kind === "network" || classified.kind === "infrastructure") return true;
  if (isAbortLikeError(error)) return true;
  const msg = messageOf(error).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("abort")
  );
}

export function sessionHistoryErrorMessage(
  error: unknown,
  fallback = "We couldn’t load your session history.",
): string {
  const classified = classifyRequestError(error);
  if (classified.kind === "authentication") {
    return "Your session expired. Please sign in again.";
  }
  if (classified.kind === "authorization") {
    return "You don’t have permission to view session history yet.";
  }
  if (
    classified.kind === "network" ||
    isAbortLikeError(error) ||
    /timeout|timed out|failed to fetch|offline|abort/i.test(messageOf(error))
  ) {
    return "Your connection is slow or unstable. Tap Retry — loading can take up to a minute on weak networks.";
  }
  if (classified.kind === "infrastructure") {
    return "Session history is temporarily unavailable. Please retry in a moment.";
  }
  const raw = messageOf(error).trim();
  if (!raw || BACKEND_LEAK.test(raw)) return fallback;
  return raw;
}

export function sessionHistoryUserMessage(error: unknown): string {
  if (error instanceof SessionHistoryApiError) return error.message;
  return sessionHistoryErrorMessage(error);
}

export class SessionHistoryApiError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = "SessionHistoryApiError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Owner-scoped session history. Throws on transport/RPC failure or ok:false envelope.
 * Never returns an empty list for backend errors.
 */
function sessionHistoryRpcParams(query: SessionHistoryQuery) {
  return {
    p_types: query.types?.length ? query.types : null,
    p_statuses: query.statuses?.length ? query.statuses : null,
    p_search: query.search?.trim() ? query.search.trim() : null,
    p_date_from: query.dateFrom ?? null,
    p_date_to: query.dateTo ?? null,
    p_score_state: query.scoreState && query.scoreState !== "all" ? query.scoreState : null,
    p_debrief_state:
      query.debriefState && query.debriefState !== "all" ? query.debriefState : null,
    p_sort: query.sort ?? "newest",
    p_cursor: query.cursor ?? null,
    p_page_size: query.pageSize ?? 20,
  };
}

async function fetchSessionHistoryOnce(
  query: SessionHistoryQuery,
  timeoutMs: number,
): Promise<Extract<SessionHistoryResponse, { ok: true }>> {
  let data: SessionHistoryResponse | null = null;
  let error: { message?: string; code?: string } | null = null;

  try {
    const result = await withTimeout(
      supabase.rpc("get_session_history", sessionHistoryRpcParams(query)),
      timeoutMs,
      "Session history load",
    );
    data = result.data as SessionHistoryResponse | null;
    error = result.error;
  } catch (err) {
    throw new SessionHistoryApiError(
      "RPC_ERROR",
      sessionHistoryErrorMessage(err),
      err instanceof Error ? err.message : undefined,
    );
  }

  if (error) {
    throw new SessionHistoryApiError(
      "RPC_ERROR",
      sessionHistoryErrorMessage(error),
      error.code ?? error.message,
    );
  }

  const payload = data;
  if (!payload || typeof payload !== "object") {
    throw new SessionHistoryApiError("INVALID_PAYLOAD", "We couldn’t load your session history.");
  }
  if (!payload.ok) {
    throw new SessionHistoryApiError(
      (payload as { code?: string }).code || "QUERY_FAILED",
      sessionHistoryErrorMessage(
        (payload as { message?: string }).message || "We couldn’t load your session history.",
      ),
      "detail" in payload ? String(payload.detail ?? "") : undefined,
    );
  }
  return {
    ok: true,
    items: Array.isArray(payload.items) ? payload.items : [],
    nextCursor: payload.nextCursor ?? null,
    hasMore: Boolean(payload.hasMore),
  };
}

export async function fetchSessionHistory(
  query: SessionHistoryQuery = {},
): Promise<Extract<SessionHistoryResponse, { ok: true }>> {
  try {
    return await fetchSessionHistoryOnce(query, SESSION_HISTORY_TIMEOUT_MS);
  } catch (err) {
    if (!isTransientSessionHistoryFailure(err)) throw err;
    return await fetchSessionHistoryOnce(query, SESSION_HISTORY_RETRY_TIMEOUT_MS);
  }
}
