// export-user-data/index.ts — GDPR data export (JWT ownership, RL, idempotency)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  createServiceClient,
  getIdempotentResponse,
  storeIdempotentResponse,
  claimIdempotencyKey,
  releaseIdempotencyKey,
} from "../_shared/supabase.ts";
import { enforceDataExportRateLimitAsync } from "../_shared/rateLimit.ts";
import { logDataExportAudit } from "../_shared/audit.ts";

const ALLOWED_TYPES = new Set(["full", "sessions", "transcripts", "answers", "interviews"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SELECTED_SESSIONS = 5000;

function jsonError(req: Request, status: number, code: string, error: string): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function exportAttachment(
  req: Request,
  type: string,
  exportData: Record<string, unknown>
): Response {
  let jsonBlob: string;
  try {
    jsonBlob = JSON.stringify(exportData, null, 2);
    JSON.parse(jsonBlob);
  } catch {
    throw new Error("EXPORT_SERIALIZE_FAILED");
  }
  const encoded = new TextEncoder().encode(jsonBlob);
  if (
    encoded.length === 0 ||
    new TextDecoder("utf-8", { fatal: true }).decode(encoded) !== jsonBlob
  ) {
    throw new Error("EXPORT_SERIALIZE_FAILED");
  }
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
  sectionErrors: Array<{ section: string; code: string }>
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
  const header = req.headers.get("idempotency-key") ?? req.headers.get("x-idempotency-key");
  const fromBody = body && typeof body.idempotencyKey === "string" ? body.idempotencyKey : null;
  const raw = (header ?? fromBody ?? "").trim();
  if (!raw || !/^[A-Za-z0-9._:-]{16,150}$/.test(raw)) return null;
  return raw.slice(0, 150);
}

function parseDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("INVALID_EXPORT_REQUEST");
  }
  return new Date(value).toISOString();
}

function readSessionSelection(body: Record<string, unknown> | null): {
  ids: string[] | null;
  from: string | null;
  to: string | null;
} {
  const raw = body?.sessionIds ?? body?.session_ids;
  if (raw === undefined) {
    return {
      ids: null,
      from: parseDate(body?.from),
      to: parseDate(body?.to),
    };
  }
  if (!Array.isArray(raw) || raw.length > MAX_SELECTED_SESSIONS) {
    throw new Error("INVALID_EXPORT_REQUEST");
  }
  const ids = raw.map((value) => {
    if (typeof value !== "string" || !UUID_RE.test(value)) {
      throw new Error("INVALID_EXPORT_REQUEST");
    }
    return value;
  });
  if (new Set(ids).size !== ids.length) throw new Error("INVALID_EXPORT_REQUEST");
  return { ids, from: parseDate(body?.from), to: parseDate(body?.to) };
}

function publicSession(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id ?? null,
    session_type: row.session_type ?? row.type ?? row.mode ?? null,
    title: row.title ?? null,
    created_at: row.created_at ?? null,
    started_at: row.started_at ?? null,
    completed_at: row.ended_at ?? null,
    duration_seconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    status: row.status ?? null,
    score: typeof row.overall_score === "number" ? row.overall_score : null,
    metrics: {
      filler_words: row.filler_words ?? null,
      avg_wpm: row.avg_wpm ?? null,
      confidence_score: row.confidence_score ?? null,
      clarity_score: row.clarity_score ?? null,
      question_count: row.question_count ?? null,
    },
    summary: row.summary ?? null,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let claimedKey: string | null = null;
  let db: ReturnType<typeof createServiceClient> | null = null;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;
    const user_id = user.id;
    db = createServiceClient();

    /* ---------------------------------------------------
       VALIDATE BODY (before rate limit — invalid type must not burn quota)
    --------------------------------------------------- */
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const requestedType = body && typeof body === "object" ? body.type : undefined;
    const type = typeof requestedType === "string" ? requestedType.trim().toLowerCase() : "full";

    if (!ALLOWED_TYPES.has(type)) {
      return jsonError(req, 400, "INVALID_EXPORT_TYPE", "Unsupported export type.");
    }

    let selection: { ids: string[] | null; from: string | null; to: string | null };
    try {
      selection = readSessionSelection(body);
      if (selection.from && selection.to && Date.parse(selection.from) > Date.parse(selection.to)) {
        throw new Error("INVALID_EXPORT_REQUEST");
      }
    } catch {
      return jsonError(req, 400, "INVALID_EXPORT_REQUEST", "Invalid export filters.");
    }
    if (
      (selection.ids || selection.from || selection.to) &&
      !["full", "sessions", "transcripts"].includes(type)
    ) {
      return jsonError(
        req,
        400,
        "INVALID_EXPORT_REQUEST",
        "Session filters are not supported for this export."
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
        (prior.payload as { exportData?: unknown }).exportData &&
        typeof (prior.payload as { exportData?: unknown }).exportData === "object"
      ) {
        return exportAttachment(req, type, (prior.payload as { exportData: Record<string, unknown> }).exportData);
      }
      // In-flight duplicate (pending claim without completed payload).
      if (
        prior &&
        typeof prior === "object" &&
        (prior as { status?: string }).status === "pending"
      ) {
        return jsonError(
          req,
          409,
          "EXPORT_IN_PROGRESS",
          "An export with this key is already in progress. Please wait and try again.",
        );
      }

      const claim = await claimIdempotencyKey(db, idempotencyKey, {
        userId: user_id,
        action: idempotencyAction,
      });
      if (claim === "duplicate") {
        const again = await getIdempotentResponse(db, idempotencyKey, {
          userId: user_id,
          action: idempotencyAction,
        });
        if (
          again?.success &&
          again.payload &&
          typeof again.payload === "object" &&
          (again.payload as { exportData?: unknown }).exportData &&
          typeof (again.payload as { exportData?: unknown }).exportData === "object"
        ) {
          return exportAttachment(
            req,
            type,
            (again.payload as { exportData: Record<string, unknown> }).exportData,
          );
        }
        return jsonError(
          req,
          409,
          "EXPORT_IN_PROGRESS",
          "An export with this key is already in progress. Please wait and try again.",
        );
      }
      if (claim === "claimed") claimedKey = idempotencyKey;
    }

    /* ---------------------------------------------------
       RATE LIMIT (after validate; CORS on 429/503)
    --------------------------------------------------- */
    const rateLimited = await enforceDataExportRateLimitAsync(db, user_id, req);
    if (rateLimited) {
      if (claimedKey) {
        await releaseIdempotencyKey(db, claimedKey);
        claimedKey = null;
      }
      return rateLimited;
    }

    /* ---------------------------------------------------
       BUILD EXPORT (server-authoritative, user-scoped)
    --------------------------------------------------- */
    const exportData: Record<string, unknown> = {};
    const sectionErrors: Array<{ section: string; code: string }> = [];
    let sessionIds: string[] = [];

    if (type === "full" || type === "sessions" || type === "transcripts") {
      const sessions = await safeSelect(
        "sessions",
        async () => {
          let query = db
            .from("sessions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", { ascending: false });
          if (selection.ids) query = query.in("id", selection.ids);
          if (selection.from) query = query.gte("created_at", selection.from);
          if (selection.to) query = query.lte("created_at", selection.to);
          return await query;
        },
        sectionErrors
      );

      const sessionRows = Array.isArray(sessions) ? sessions : [];
      if (selection.ids && sessionRows.length !== selection.ids.length) {
        return jsonError(req, 403, "FORBIDDEN", "One or more sessions are not available.");
      }
      sessionIds = sessionRows
        .map((s: { id?: unknown }) => (typeof s.id === "string" ? s.id : null))
        .filter((id): id is string => id !== null);

      if (type === "sessions" && sessionIds.length > 0) {
        const [answerScores, scorecards] = await Promise.all([
          safeSelect(
            "session_answers",
            async () =>
              await db
                .from("session_answers")
                .select(
                  "id, session_id, question, answer, score, ai_feedback, duration_ms, created_at"
                )
                .eq("user_id", user_id)
                .in("session_id", sessionIds)
                .order("created_at", { ascending: true }),
            sectionErrors
          ),
          safeSelect(
            "scorecards",
            async () =>
              await db
                .from("scorecards")
                .select(
                  "id, session_id, overall_score, communication, technical, problem_solving, confidence, feedback, strengths, improvements, created_at"
                )
                .eq("user_id", user_id)
                .in("session_id", sessionIds),
            sectionErrors
          ),
        ]);
        const answersBySession = new Map<string, unknown[]>();
        for (const row of Array.isArray(answerScores) ? answerScores : []) {
          const sid = String((row as { session_id?: string }).session_id ?? "");
          if (!sid) continue;
          const list = answersBySession.get(sid) ?? [];
          list.push(row);
          answersBySession.set(sid, list);
        }
        const scorecardBySession = new Map<string, unknown>();
        for (const row of Array.isArray(scorecards) ? scorecards : []) {
          const sid = String((row as { session_id?: string }).session_id ?? "");
          if (sid && !scorecardBySession.has(sid)) scorecardBySession.set(sid, row);
        }
        exportData.sessions = sessionRows.map((s: Record<string, unknown>) => {
          const id = String(s.id ?? "");
          const scorecard = scorecardBySession.get(id) ?? null;
          return {
            ...publicSession(s),
            score:
              scorecard && typeof (scorecard as Record<string, unknown>).overall_score === "number"
                ? (scorecard as Record<string, unknown>).overall_score
                : publicSession(s).score,
            scorecard,
            answers: answersBySession.get(id) ?? [],
          };
        });
      } else {
        exportData.sessions = sessionRows.map((row: Record<string, unknown>) => publicSession(row));
      }
    }

    if (type === "full" || type === "transcripts") {
      const ids = sessionIds.length ? sessionIds : ["-no-sessions-"];
      const [transcripts, answers] = await Promise.all([
        safeSelect(
          "session_transcripts",
          async () =>
            await db
              .from("session_transcripts")
              .select(
                "id, session_id, content, speaker, is_final, confidence, wpm, filler_count, language, offset_ms, timestamp_ms, sequence, created_at"
              )
              .eq("user_id", user_id)
              .in("session_id", ids)
              .order("created_at", { ascending: true }),
          sectionErrors
        ),
        safeSelect(
          "transcripts",
          async () =>
            await db
              .from("transcripts")
              .select(
                "id, session_id, content, utterances, wpm_data_points, filler_occurrences, created_at"
              )
              .eq("user_id", user_id)
              .in("session_id", ids)
              .order("created_at", { ascending: true }),
          sectionErrors
        ),
      ]);
      exportData.transcripts = [
        ...(Array.isArray(transcripts) ? transcripts : []),
        ...(Array.isArray(answers) ? answers : []),
      ];
      /* Keep answer records separate so missing transcripts are explicit. */
      const answerRows = await safeSelect(
        "session_answers_for_transcripts",
        async () =>
          await db
            .from("session_answers")
            .select("id, session_id, question, answer, score, ai_feedback, duration_ms, created_at")
            .eq("user_id", user_id)
            .in("session_id", ids),
        sectionErrors
      );
      exportData.answers = Array.isArray(answerRows) ? answerRows : [];
    }

    if (type === "full" || type === "answers") {
      const bank = await safeSelect(
        "answer_bank",
        async () => await db.from("answer_bank").select("*").eq("user_id", user_id),
        sectionErrors
      );
      exportData.answer_bank = Array.isArray(bank) ? bank : [];
    }

    if (type === "full" || type === "interviews") {
      const interviews = await safeSelect(
        "interviews",
        async () => await db.from("scheduled_interviews").select("*").eq("user_id", user_id),
        sectionErrors
      );
      exportData.interviews = Array.isArray(interviews) ? interviews : [];
    }

    if (type === "full") {
      const profile = await safeSelect(
        "profile",
        async () =>
          await db
            .from("profiles")
            .select("full_name, email, plan, created_at, years_of_experience, target_role")
            .eq("id", user_id)
            .maybeSingle(),
        sectionErrors
      );
      exportData.profile = profile ?? null;

      const debriefs = await safeSelect(
        "debriefs",
        async () => await db.from("session_debriefs").select("*").eq("user_id", user_id),
        sectionErrors
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
        { userId: user_id, action: idempotencyAction }
      );
    }

    try {
      return exportAttachment(req, type, exportData);
    } catch {
      if (claimedKey && db) {
        await releaseIdempotencyKey(db, claimedKey);
        claimedKey = null;
      }
      return jsonError(
        req,
        500,
        "EXPORT_FAILED",
        "We couldn't prepare your export. Please try again in a moment."
      );
    }
  } catch (err) {
    console.error("[export-user-data] error:", err);
    if (claimedKey && db) {
      await releaseIdempotencyKey(db, claimedKey);
    }
    return jsonError(
      req,
      500,
      "EXPORT_FAILED",
      "We couldn't prepare your export. Please try again in a moment."
    );
  }
});
