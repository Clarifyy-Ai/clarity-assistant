// supabase/functions/end-session/index.ts
// Finalize a mock session: mark as completed, update credits & timing. [file:1][file:3]

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);
  const db = createServiceClient();

  try {
    // ── AUTH ─────────────────────────────────────────────────────
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";

    if (!/^bearer\s+/i.test(authHeader)) {
      return json(headers, 401, { error: "Unauthorized" });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const {
      data: { user },
      error: authErr,
    } = await db.auth.getUser(token);

    if (authErr || !user) {
      return json(headers, 401, { error: "Unauthorized" });
    }

    // ── BODY PARSE & VALIDATION ──────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body?.session_id) {
      return json(headers, 400, { error: "Missing session_id" });
    }

    const sessionId: string = body.session_id;
    const creditsUsed: number = body.credits_used ?? 0;
    const durationSeconds: number | null = body.duration_seconds ?? null;

    // ── UPDATE SESSION ROW ───────────────────────────────────────
    // Guard by user_id to prevent cross-user updates. [file:1][file:3]
    const { data: existing, error: fetchErr } = await db
      .from("sessions")
      .select("id, user_id, started_at, duration_seconds")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !existing) {
      return json(headers, 404, { error: "Session not found" });
    }

    const nowIso = new Date().toISOString();

    const patch: Record<string, unknown> = {
      status: "completed",
      ended_at: nowIso,
      credits_consumed: creditsUsed,
    };

    if (durationSeconds != null && Number.isFinite(durationSeconds)) {
      patch.duration_seconds = Math.floor(durationSeconds);
    }

    const { error: updateErr } = await db
      .from("sessions")
      .update(patch)
      .eq("id", sessionId)
      .eq("user_id", user.id);

    if (updateErr) {
      console.error("[end-session] Update error:", updateErr.message);
      return json(headers, 500, { error: "Could not finalize session" });
    }

    return json(headers, 200, {
      session_id: sessionId,
      status: "completed",
      ended_at: nowIso,
    });
  } catch (err) {
    console.error("[end-session] Unhandled error:", err);
    return json(headers, 500, { error: "Internal server error" });
  }
});

/* ──────────────────────────────────────────────────────────────── */

function json(headers: HeadersInit, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
