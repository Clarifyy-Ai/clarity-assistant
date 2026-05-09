// supabase/functions/start-session/index.ts
// Initialize a mock session: validate config, create DB row, return session_id. [file:1][file:3]

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

function toDbModel(model: unknown): string {
  const value = String(model ?? "gemini-1-5-flash");
  const map: Record<string, string> = {
    "gemini-flash": "gemini-1-5-flash",
    "gemini-pro": "gemini-1-5-pro",
    "gpt_4o": "gpt-4o",
  };
  return map[value] ?? value;
}

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
    if (!body) {
      return json(headers, 400, { error: "Invalid JSON body" });
    }

    const rawType = String(body.session_type ?? body.type ?? "mock");
    const sessionType = rawType === "live" ? "live" : "mock";
    const interviewType: string = body.interview_type ?? "behavioural";
    const company: string | null = body.company ?? null;
    const role: string | null = body.role ?? null;
    const resumeId: string | null = body.resume_id ?? null;
    const jdId: string | null = body.jd_id ?? null;

    const durationMinutes: number = clampNumber(
      body.duration_minutes ?? 30,
      15,
      45,
    );
    const questionCount: number = clampNumber(
      body.question_count ?? 10,
      5,
      20,
    );

    const personalityType: string =
      body.personality_type ?? "neutral"; // strict | friendly | neutral | panel [file:1]

    if (
      !["strict", "friendly", "neutral", "panel"].includes(personalityType)
    ) {
      return json(headers, 400, { error: "Invalid personality_type" });
    }

    const enableRecording: boolean = !!body.enable_recording;
    const enableTranscription: boolean = body.enable_transcription ?? true;
    const enableMetrics: boolean = body.enable_metrics ?? true;

    // ── INSERT SESSION ROW ───────────────────────────────────────
    const nowIso = new Date().toISOString();

    const config = {
      company,
      role,
      interview_type: interviewType,
      question_count: questionCount,
      time_per_question_seconds: Math.round(
        (durationMinutes * 60) / questionCount,
      ),
      model: body.model ?? "gemini-1-5-flash",
      hint_style: body.hint_style ?? "balanced",
      include_warmup: false,
      resume_id: resumeId,
      jd_id: jdId,
      focus_areas: body.focus_areas ?? [],
      duration_minutes: durationMinutes,
      personality_type: personalityType,
      enable_recording: enableRecording,
      enable_transcription: enableTranscription,
      enable_metrics: enableMetrics,
    };

    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await db
      .from("sessions")
      .update({ status: "abandoned", ended_at: nowIso })
      .eq("user_id", user.id)
      .eq("type", sessionType)
      .in("status", ["pending", "active"])
      .lt("created_at", sinceIso);

    const { data: existing, error: lookupError } = await db
      .from("sessions")
      .select("id, created_at, status")
      .eq("user_id", user.id)
      .eq("type", sessionType)
      .in("status", ["pending", "active"])
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error("[start-session] Lookup error:", lookupError.message);
      return json(headers, 500, { error: "Could not start session" });
    }

    if (existing?.id) {
      const activePatch = existing.status === "active"
        ? { status: "active" }
        : { status: "active", started_at: nowIso };
      const { error: activeError } = await db
        .from("sessions")
        .update(activePatch)
        .eq("id", existing.id);
      if (activeError) {
        console.error("[start-session] Reuse activation error:", activeError.message);
        return json(headers, 500, { error: "Could not start session" });
      }
      return json(headers, 200, { session_id: existing.id, config, started_at: nowIso, reused: true });
    }

    const { data, error } = await db
      .from("sessions")
      .insert({
        user_id: user.id,
        type: sessionType,
        status: "active",
        model_used: toDbModel(config.model),
        title: company ? `${sessionType === "live" ? "Live" : "Mock"} — ${company}` : `${sessionType === "live" ? "Live co-pilot" : "Mock interview"}`,
        document_id: resumeId,
        jd_id: jdId,
        duration_seconds: durationMinutes * 60,
        started_at: nowIso,
        ended_at: null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[start-session] Insert error:", error?.message);
      return json(headers, 500, { error: "Could not create session" });
    }

    return json(headers, 200, {
      session_id: data.id,
      config,
      started_at: nowIso,
    });
  } catch (err) {
    console.error("[start-session] Unhandled error:", err);
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

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
