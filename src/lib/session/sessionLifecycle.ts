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
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase";

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

  if (existing && !isSessionExpired(existing)) {
    return { session: existing as SessionRow, reused: true };
  }

  const { data: limitCheck, error: limitErr } = await withDbTimeout(
    (supabase.rpc as (
      name: string,
      args: Record<string, unknown>,
    ) => ReturnType<typeof supabase.rpc>)(
      "check_free_tier_limits",
      { p_user_id: input.user_id, p_action: "start_session" },
    ),
    "Session limit check",
  );
  const limitResult = limitCheck as { allowed?: boolean; message?: string } | null;
  if (!limitErr && limitResult && limitResult.allowed === false) {
    const msg = limitResult.message ?? "Free plan limit reached. Upgrade to Pro.";
    throw new Error(msg);
  }

  const tags =
    input.tags ??
    buildSessionTags(input.type, input.is_practice ?? false);

  // resume_id / jd_id live on resumes + job_descriptions; sessions.document_id
  // and sessions.jd_id FK to public.documents — drop IDs that would 500.
  const document_id = await resolveDocumentsTableId(input.document_id);
  const jd_id = await resolveDocumentsTableId(input.jd_id);

  const insert: TablesInsert<"sessions"> & { lifecycle_status?: string } = {
    user_id: input.user_id,
    type: input.type,
    status: "pending",
    lifecycle_status: "CREATED",
    title: input.title ?? null,
    company_id: input.company_id ?? null,
    document_id,
    jd_id,
    model_used: input.model_used ?? null,
    tags: tags.length > 0 ? tags : null,
  };

  const { data: created, error: insertErr } = await withDbTimeout(
    supabase.from("sessions").insert(insert).select().single(),
    "Session create",
  );

  if (insertErr?.message?.includes("sessions_document_id_fkey") ||
      insertErr?.message?.includes("sessions_jd_id_fkey")) {
    const retryInsert: TablesInsert<"sessions"> = {
      ...insert,
      document_id: null,
      jd_id: null,
    };
    const { data: retried, error: retryErr } = await withDbTimeout(
      supabase.from("sessions").insert(retryInsert).select().single(),
      "Session create",
    );
    if (retryErr || !retried) {
      console.error("[sessionLifecycle] insert retry failed:", retryErr);
      throw new Error(retryErr?.message || "Failed to create session");
    }
    return { session: retried as SessionRow, reused: false };
  }

  if (insertErr || !created) {
    console.error("[sessionLifecycle] insert failed:", insertErr);
    throw new Error(insertErr?.message || "Failed to create session");
  }

  return { session: created as SessionRow, reused: false };
}

/**
 * Transition a session from pending → active.
 * Sets started_at if not already set.
 */
export async function activateSession(sessionId: string): Promise<void> {
  const { data: existing, error: lookupError } = await withDbTimeout(
    supabase
      .from("sessions")
      .select("id, created_at, status")
      .eq("id", sessionId)
      .maybeSingle(),
    "Session activate",
  );

  if (lookupError || !existing) {
    throw new Error(lookupError?.message || "Session not found");
  }

  if (isSessionExpired(existing)) {
    await supabase
      .from("sessions")
      .update({ status: "abandoned", lifecycle_status: "CANCELLED", ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    throw new Error("This session expired after 24 hours; please start a new one.");
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
  if (isSessionExpired(data)) {
    await supabase
      .from("sessions")
      .update({ status: "abandoned", lifecycle_status: "CANCELLED", ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    return null;
  }

  return data as SessionRow;
}
