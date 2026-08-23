// export-user-data/index.ts — GDPR data export (JWT ownership, RL, idempotency)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  createServiceClient,
  getIdempotentResponse,
  storeIdempotentResponse,
} from "../_shared/supabase.ts";
import { enforceDataExportRateLimitAsync } from "../_shared/rateLimit.ts";
import { logDataExportAudit } from "../_shared/audit.ts";

const ALLOWED_TYPES = new Set([
  "full",
  "sessions",
  "transcripts",
  "answers",
  "interviews",
]);

function jsonError(
  req: Request,
  status: number,
  code: string,
  error: string,
): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function exportAttachment(req: Request, type: string, exportData: Record<string, unknown>): Response {
  let jsonBlob: string;
  try {
    jsonBlob = JSON.stringify(exportData, null, 2);
    JSON.parse(jsonBlob);
  } catch {
    throw new Error("EXPORT_SERIALIZE_FAILED");
  }
  const encoded = new TextEncoder().encode(jsonBlob);
  return new Response(encoded, {
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="clarify-ai-export-${type}.json"`,
    },
  });
}

async function safeSelect(
  label: string,
  run: () => Promise<{ data: unknown; error: { message?: string } | null }>,
  sectionErrors: Array<{ section: string; code: string }>,
): Promise<unknown> {
  try {
    const { data, error } = await run();
    if (error) {
      console.warn(`[export-user-data] ${label}:`, error.message);
      sectionErrors.push({ section: label, code: "SECTION_SKIPPED" });
      return null;
    }
    return data;
  } catch (err) {
    console.warn(`[export-user-data] ${label} threw:`, err);
    sectionErrors.push({ section: label, code: "SECTION_SKIPPED" });
    return null;
  }
}

function readIdempotencyKey(req: Request, body: Record<string, unknown> | null): string | null {
  const header =
    req.headers.get("idempotency-key") ??
    req.headers.get("x-idempotency-key");
  const fromBody =
    body && typeof body.idempotencyKey === "string"
      ? body.idempotencyKey
      : null;
  const raw = (header ?? fromBody ?? "").trim();
  if (!raw || !/^[A-Za-z0-9._:-]{16,150}$/.test(raw)) return null;
  return raw.slice(0, 150);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;
    const user_id = user.id;
    const db = createServiceClient();

    /* ---------------------------------------------------
       VALIDATE BODY (before rate limit — invalid type must not burn quota)
    --------------------------------------------------- */
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const requestedType =
      body && typeof body === "object" ? body.type : undefined;
    const type =
      typeof requestedType === "string"
        ? requestedType.trim().toLowerCase()
        : "full";

    if (!ALLOWED_TYPES.has(type)) {
      return jsonError(
        req,
        400,
        "INVALID_EXPORT_TYPE",
        "Unsupported export type.",
      );
    }

    const idempotencyKey = readIdempotencyKey(req, body);
    const idempotencyAction = `export_user_data_${type}`;

    if (idempotencyKey) {
      const prior = await getIdempotentResponse(db, idempotencyKey, {
        userId: user_id,
        action: idempotencyAction,
      });
      if (
        prior?.success &&
        prior.payload &&
        typeof prior.payload === "object" &&
        prior.payload.exportData &&
        typeof prior.payload.exportData === "object"
      ) {
        return exportAttachment(
          req,
          type,
          prior.payload.exportData as Record<string, unknown>,
        );
      }
    }

    /* ---------------------------------------------------
       RATE LIMIT (after validate; CORS on 429/503)
    --------------------------------------------------- */
    const rateLimited = await enforceDataExportRateLimitAsync(db, user_id, req);
    if (rateLimited) return rateLimited;

    /* ---------------------------------------------------
       BUILD EXPORT (server-authoritative, user-scoped)
    --------------------------------------------------- */
    const exportData: Record<string, unknown> = {};
    const sectionErrors: Array<{ section: string; code: string }> = [];
    let sessionIds: string[] = [];

    if (type === "full" || type === "sessions" || type === "transcripts") {
      const sessions = await safeSelect(
        "sessions",
        async () =>
          await db
            .from("sessions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", { ascending: false }),
        sectionErrors,
      );

      const sessionRows = Array.isArray(sessions) ? sessions : [];
      sessionIds = sessionRows.map((s: { id: string }) => s.id);

      if (type === "sessions" && sessionIds.length > 0) {
        const answerScores = await safeSelect(
          "session_answers",
          async () =>
            await db
              .from("session_answers")
              .select("session_id, question, answer, score, ai_feedback, created_at")
              .in("session_id", sessionIds),
          sectionErrors,
        );
        const scoresBySession = new Map<string, unknown[]>();
        for (const row of (Array.isArray(answerScores) ? answerScores : [])) {
          const sid = String((row as { session_id?: string }).session_id ?? "");
          if (!sid) continue;
          const list = scoresBySession.get(sid) ?? [];
          list.push(row);
          scoresBySession.set(sid, list);
        }
        exportData.sessions = sessionRows.map((s: Record<string, unknown>) => ({
          ...s,
          answer_scores: scoresBySession.get(String(s.id ?? "")) ?? [],
        }));
      } else {
        exportData.sessions = sessionRows;
      }
    }

    if (type === "full" || type === "transcripts") {
      const ids = sessionIds.length ? sessionIds : ["-no-sessions-"];
      const answers = await safeSelect(
        "transcripts",
        async () =>
          await db
            .from("session_answers")
            .select("question, answer, score, ai_feedback, created_at")
            .in("session_id", ids),
        sectionErrors,
      );
      exportData.transcripts = Array.isArray(answers) ? answers : [];
    }

    if (type === "full" || type === "answers") {
      const bank = await safeSelect(
        "answer_bank",
        async () =>
          await db.from("answer_bank").select("*").eq("user_id", user_id),
        sectionErrors,
      );
      exportData.answer_bank = Array.isArray(bank) ? bank : [];
    }

    if (type === "full" || type === "interviews") {
      const interviews = await safeSelect(
        "interviews",
        async () =>
          await db.from("interviews").select("*").eq("user_id", user_id),
        sectionErrors,
      );
      exportData.interviews = Array.isArray(interviews) ? interviews : [];
    }

    if (type === "full") {
      const profile = await safeSelect(
        "profile",
        async () =>
          await db
            .from("profiles")
            .select(
              "full_name, email, plan_id, created_at, experience_years, target_role",
            )
            .eq("id", user_id)
            .maybeSingle(),
        sectionErrors,
      );
      exportData.profile = profile ?? null;

      const debriefs = await safeSelect(
        "debriefs",
        async () =>
          await db.from("session_debriefs").select("*").eq("user_id", user_id),
        sectionErrors,
      );
      exportData.debriefs = Array.isArray(debriefs) ? debriefs : [];
    }

    exportData.exported_at = new Date().toISOString();
    exportData.user_id = user_id;
    if (sectionErrors.length > 0) {
      exportData.section_errors = sectionErrors;
    }

    await logDataExportAudit({
      req,
      userId: user_id,
      status: "success",
      metadata: { type, section_errors: sectionErrors.length },
    });

    if (idempotencyKey) {
      await storeIdempotentResponse(
        db,
        idempotencyKey,
        {
          success: true,
          payload: { exportData, type },
        },
        { userId: user_id, action: idempotencyAction },
      );
    }

    try {
      return exportAttachment(req, type, exportData);
    } catch {
      return jsonError(
        req,
        500,
        "EXPORT_FAILED",
        "We couldn't prepare your export. Please try again in a moment.",
      );
    }
  } catch (err) {
    console.error("[export-user-data] error:", err);
    return jsonError(
      req,
      500,
      "EXPORT_FAILED",
      "We couldn't prepare your export. Please try again in a moment.",
    );
  }
});
