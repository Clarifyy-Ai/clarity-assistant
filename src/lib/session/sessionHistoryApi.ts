import { supabase } from "@/lib/supabase/client";
import type {
  SessionHistoryQuery,
  SessionHistoryResponse,
} from "@/lib/session/sessionHistoryTypes";

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
export async function fetchSessionHistory(
  query: SessionHistoryQuery = {},
): Promise<Extract<SessionHistoryResponse, { ok: true }>> {
  const { data, error } = await supabase.rpc("get_session_history", {
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
  });

  if (error) {
    throw new SessionHistoryApiError(
      "RPC_ERROR",
      error.message || "We couldn’t load your session history.",
      error.code,
    );
  }

  const payload = data as SessionHistoryResponse | null;
  if (!payload || typeof payload !== "object") {
    throw new SessionHistoryApiError("INVALID_PAYLOAD", "We couldn’t load your session history.");
  }
  if (!payload.ok) {
    throw new SessionHistoryApiError(
      payload.code || "QUERY_FAILED",
      payload.message || "We couldn’t load your session history.",
      "detail" in payload ? payload.detail : undefined,
    );
  }
  return {
    ok: true,
    items: Array.isArray(payload.items) ? payload.items : [],
    nextCursor: payload.nextCursor ?? null,
    hasMore: Boolean(payload.hasMore),
  };
}
