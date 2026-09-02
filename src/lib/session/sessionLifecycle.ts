// src/lib/session/sessionLifecycle.ts
// ─────────────────────────────────────────────────────────────────
// Shared session creation / reuse / expiry helper for live + mock.
//
// Rules:
//   • Reuse an existing 'pending' or 'active' session of the same type
//     created within the last 24h (prevents duplicate rows on retries).
//   • Insert otherwise.
//   • Sessions older than 24h are considered expired → marked 'abandoned'
//     and a fresh row is created.
// ─────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase";
import { startSession } from "@/lib/api/sessions";
import { createIdempotencyKey } from "@/lib/api/functions";
import { sessionDurationSeconds } from "@/lib/session/sessionStartEligibility";
import { ApiClientError } from "@/lib/api/apiClient";

export type SessionRow = Tables<"sessions">;
export type SessionType = SessionRow["type"];

const EXPIRY_MS = 24 * 60 * 60 * 1000;
const DB_TIMEOUT_MS = 15_000;

async function withDbTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
  ms = DB_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timed out. Check your connection and retry.`)),
      ms,
    );
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** Session types permitted for sessionless AI calls (matches edge sessionEnforcement). */
export type AiPracticeMode = "mock" | "warmup" | "rehearsal" | "practice";

export interface GetOrCreateSessionInput {
  user_id: string;
  type: SessionType; // "live" | "mock" | "warmup" | "rehearsal" | "room"
  title?: string | null;
  company_id?: string | null;
  document_id?: string | null;
  jd_id?: string | null;
  model_used?: SessionRow["model_used"];
  /** When true on type=live, adds practice tag so AI generation is permitted. */
  is_practice?: boolean;
  tags?: string[] | null;
}

/** Mirrors start-session edge `buildSessionTags` for direct DB inserts. */
export function buildSessionTags(
  sessionType: SessionType,
  isPractice = false,
): string[] {
  const tags: string[] = [];
  const alwaysPractice: SessionType[] = ["mock", "warmup", "rehearsal", "room"];

  if (isPractice || alwaysPractice.includes(sessionType)) {
    tags.push("practice");
  }
  if (sessionType === "rehearsal") {
    tags.push("rehearsal");
  }
  return tags;
}

/** Maps DB session type to sessionless AI `mode` param for generate-* endpoints. */
export function aiModeForSessionType(type: SessionType): AiPracticeMode {
  if (type === "mock") return "mock";
  if (type === "warmup") return "warmup";
  return "rehearsal";
}

export interface GetOrCreateSessionResult {
  session: SessionRow;
  reused: boolean;
}

export function isSessionExpired(row: Pick<SessionRow, "created_at">): boolean {
  const created = new Date(row.created_at).getTime();
  return Date.now() - created > EXPIRY_MS;
}

export function isServerExpired(row: Pick<SessionRow, "expires_at" | "lifecycle_status" | "terminal_reason" | "status">): boolean {
  if (row.lifecycle_status === "EXPIRED" || row.terminal_reason === "SESSION_TIMEOUT") {
    return true;
  }
  if (row.expires_at) {
    const expires = new Date(row.expires_at).getTime();
    if (Number.isFinite(expires) && Date.now() >= expires) return true;
  }
  return false;
}

export { sessionDurationSeconds };

/** Normalize lifecycle/DB errors so session-start UX handlers can classify them. */
export function normalizeSessionLifecycleError(error: unknown): Error {
  if (error instanceof ApiClientError) return error;
  const message =
    error instanceof Error ? error.message : String(error ?? "Could not start session.");
  const lower = message.toLowerCase();

  if (lower.includes("expired")) {
    return new ApiClientError({
      message,
      status: 409,
      code: "SESSION_EXPIRED",
    });
  }
  if (lower.includes("no longer active") || lower.includes("not found")) {
    return new ApiClientError({
      message,
      status: 409,
      code: "SESSION_NOT_AVAILABLE",
    });
  }
  if (
    lower.includes("timed out") ||
    lower.includes("connection") ||
    lower.includes("network")
  ) {
    return new ApiClientError({
      message,
      status: 503,
      code: "DEPENDENCY_UNAVAILABLE",
    });
  }
  return error instanceof Error ? error : new Error(message);
}

/** Only keep IDs that exist in public.documents (resume IDs live in resumes). */
async function resolveDocumentsTableId(
  id: string | null | undefined,
): Promise<string | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("[sessionLifecycle] documents FK lookup failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

async function abandonExpiredSessions(userId: string, type?: SessionType): Promise<void> {
  const beforeIso = new Date(Date.now() - EXPIRY_MS).toISOString();
  let query = supabase
    .from("sessions")
    .update({ status: "abandoned", lifecycle_status: "CANCELLED", ended_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("status", ["pending", "active", "paused"])
    .lt("created_at", beforeIso);

  if (type) query = query.eq("type", type);
  await query;
}

/**
 * Find an existing reusable session, or create a new one.
 * Throws on DB failure so callers can show a toast.
 */
export async function getOrCreateSession(
  input: GetOrCreateSessionInput,
): Promise<GetOrCreateSessionResult> {
  const sinceIso = new Date(Date.now() - EXPIRY_MS).toISOString();

  await withDbTimeout(abandonExpiredSessions(input.user_id, input.type), "Session lookup");

  const { data: existing, error: findErr } = await withDbTimeout(
    supabase
      .from("sessions")
      .select("*")
      .eq("user_id", input.user_id)
      .eq("type", input.type)
      .in("status", ["pending", "active", "paused"])
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Session lookup",
  );

  if (findErr) {
    console.error("[sessionLifecycle] lookup failed:", findErr);
    throw new Error(findErr.message || "Failed to look up existing session");
  }

  if (existing && !isSessionExpired(existing) && !isServerExpired(existing)) {
    return { session: existing as SessionRow, reused: true };
  }

  const started = await startSession(
    {
      session_type: input.type === "live" ? "rehearsal" : input.type,
      type: input.type === "live" ? "rehearsal" : input.type,
      is_practice: input.is_practice ?? input.type !== "live",
      resume_id: input.document_id ?? null,
      jd_id: input.jd_id ?? null,
      model: input.model_used ?? undefined,
    },
    { idempotencyKey: createIdempotencyKey("start-session") },
  );

  const { data: created, error: reloadErr } = await withDbTimeout(
    supabase.from("sessions").select("*").eq("id", started.session_id).maybeSingle(),
    "Session reload",
  );
  if (reloadErr || !created) {
    throw new Error(reloadErr?.message || "Failed to load started session");
  }
  return { session: created as SessionRow, reused: Boolean(started.reused) };
}

/**
 * Transition a session from pending → active.
 * Sets started_at if not already set.
 */
export async function activateSession(sessionId: string): Promise<void> {
  const { data: existing, error: lookupError } = await withDbTimeout(
    supabase
      .from("sessions")
      .select("id, created_at, status, expires_at, lifecycle_status, terminal_reason")
      .eq("id", sessionId)
      .maybeSingle(),
    "Session activate",
  );

  if (lookupError || !existing) {
    throw new Error(lookupError?.message || "Session not found");
  }

  if (isSessionExpired(existing) || isServerExpired(existing as SessionRow)) {
    await supabase
      .from("sessions")
      .update({ status: "abandoned", lifecycle_status: "CANCELLED", ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    throw new Error("This session expired after 24 hours; please start a new one.");
  }

  const status = String((existing as { status?: string }).status ?? "").toLowerCase();
  if (status === "completed" || status === "abandoned" || status === "cancelled") {
    throw new Error("This practice session is no longer active.");
  }

  const update: TablesUpdate<"sessions"> & { lifecycle_status?: string } = {
    status: "active",
    lifecycle_status: "IN_PROGRESS",
    ...(existing.status === "active" ? {} : { started_at: new Date().toISOString() }),
  };

  const { error } = await withDbTimeout(
    supabase
      .from("sessions")
      .update(update)
      .eq("id", sessionId)
      .in("status", ["pending", "active", "paused"]),
    "Session activate",
  );

  if (error) {
    console.error("[sessionLifecycle] activate failed:", error);
    throw new Error(error.message);
  }
}

export async function persistSessionLifecycle(
  sessionId: string,
  userId: string,
  next: {
    status?: SessionRow["status"];
    lifecycle_status: string;
  },
): Promise<void> {
  const update: TablesUpdate<"sessions"> & { lifecycle_status?: string } = {
    lifecycle_status: next.lifecycle_status,
    ...(next.status ? { status: next.status } : {}),
    updated_at: new Date().toISOString(),
  };
  const { error } = await withDbTimeout(
    supabase
      .from("sessions")
      .update(update)
      .eq("id", sessionId)
      .eq("user_id", userId),
    "Session lifecycle",
  );
  if (error) throw new Error(error.message);
}

export async function pauseOwnedSession(sessionId: string, userId: string): Promise<void> {
  await persistSessionLifecycle(sessionId, userId, {
    status: "paused",
    lifecycle_status: "PAUSED",
  });
}

export async function resumeOwnedSession(sessionId: string, userId: string): Promise<void> {
  await persistSessionLifecycle(sessionId, userId, {
    status: "active",
    lifecycle_status: "IN_PROGRESS",
  });
}

/**
 * Validate a session is still resumable (not expired, not completed).
 * Returns the row if usable, null otherwise.
 */
export async function getResumableSession(
  sessionId: string,
): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) return null;

  if (data.status === "completed" || data.status === "abandoned") return null;
  if (isSessionExpired(data) || isServerExpired(data)) {
    await supabase
      .from("sessions")
      .update({
        status: "abandoned",
        lifecycle_status: "EXPIRED",
        terminal_reason: "SESSION_TIMEOUT",
        ended_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    return null;
  }

  return data as SessionRow;
}
