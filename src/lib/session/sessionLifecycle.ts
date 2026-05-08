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
import type { Tables, TablesInsert } from "@/integrations/supabase";

export type SessionRow = Tables<"sessions">;
export type SessionType = SessionRow["type"];

const EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface GetOrCreateSessionInput {
  user_id: string;
  type: SessionType; // "live" | "mock" | "warmup" | "rehearsal" | "room"
  title?: string | null;
  company_id?: string | null;
  document_id?: string | null;
  jd_id?: string | null;
  model_used?: SessionRow["model_used"];
}

export interface GetOrCreateSessionResult {
  session: SessionRow;
  reused: boolean;
}

export function isSessionExpired(row: Pick<SessionRow, "created_at">): boolean {
  const created = new Date(row.created_at).getTime();
  return Date.now() - created > EXPIRY_MS;
}

async function abandonExpiredSessions(userId: string, type?: SessionType): Promise<void> {
  const beforeIso = new Date(Date.now() - EXPIRY_MS).toISOString();
  let query = supabase
    .from("sessions")
    .update({ status: "abandoned", ended_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("status", ["pending", "active"])
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

  await abandonExpiredSessions(input.user_id, input.type);

  const { data: existing, error: findErr } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", input.user_id)
    .eq("type", input.type)
    .in("status", ["pending", "active"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.error("[sessionLifecycle] lookup failed:", findErr);
    throw new Error(findErr.message || "Failed to look up existing session");
  }

  if (existing && !isSessionExpired(existing)) {
    return { session: existing as SessionRow, reused: true };
  }

  const insert: TablesInsert<"sessions"> = {
    user_id: input.user_id,
    type: input.type,
    status: "pending",
    title: input.title ?? null,
    company_id: input.company_id ?? null,
    document_id: input.document_id ?? null,
    jd_id: input.jd_id ?? null,
    model_used: input.model_used ?? null,
  };

  const { data: created, error: insertErr } = await supabase
    .from("sessions")
    .insert(insert)
    .select()
    .single();

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
  const { data: existing, error: lookupError } = await supabase
    .from("sessions")
    .select("id, created_at, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (lookupError || !existing) {
    throw new Error(lookupError?.message || "Session not found");
  }

  if (isSessionExpired(existing)) {
    await supabase
      .from("sessions")
      .update({ status: "abandoned", ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    throw new Error("This session expired after 24 hours; please start a new one.");
  }

  const { error } = await supabase
    .from("sessions")
    .update({
      status: "active",
      started_at: existing.status === "active" ? undefined : new Date().toISOString(),
    })
    .eq("id", sessionId)
    .in("status", ["pending", "active"]);

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
      .update({ status: "abandoned", ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    return null;
  }

  return data as SessionRow;
}
