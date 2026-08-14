/**
 * run-daily-exam-scrape — cron / internal worker that collects official PYQs.
 *
 * Auth (any one):
 *  - x-internal-secret / Bearer matching EXAM_SCRAPE_CRON_SECRET,
 *    PAPER_JOB_WORKER_SECRET, INTERNAL_WORKER_SECRET, or service role
 *  - JWT admin (manual trigger from the app)
 *
 * Body:
 *  { exam_type?: "JEE_MAIN", year?: 2025, force?: false }
 * When exam_type is omitted, one pending daily exam is processed (timeout-safe).
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  authenticateRequest,
  extractBearerToken,
  isAdmin,
} from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  collectExamPapers,
  DAILY_EXAM_TYPES,
  sanitizeText,
} from "../_shared/collectExamPapers.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function hasInternalAuth(req: Request): boolean {
  const secrets = [
    Deno.env.get("EXAM_SCRAPE_CRON_SECRET"),
    Deno.env.get("PAPER_JOB_WORKER_SECRET"),
    Deno.env.get("INTERNAL_WORKER_SECRET"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  ].filter((s): s is string => Boolean(s && s.length > 8));

  if (secrets.length === 0) return false;

  const headerSecret = req.headers.get("x-internal-secret")?.trim() ?? "";
  const bearer = extractBearerToken(req) ?? "";

  for (const secret of secrets) {
    if (headerSecret && timingSafeEqual(headerSecret, secret)) return true;
    if (bearer && timingSafeEqual(bearer, secret)) return true;
  }
  return false;
}

function utcDayStartIso(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const internal = hasInternalAuth(req);
  if (!internal) {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    if (!(await isAdmin(auth.context.user.id))) {
      return json(req, { error: "Admin role required", code: "FORBIDDEN" }, 403);
    }
  }

  if (!Deno.env.get("GEMINI_API_KEY")?.trim()) {
    return json(req, { error: "GEMINI_API_KEY not configured", code: "CONFIG_ERROR" }, 503);
  }

  const db = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const requested = sanitizeText(body.exam_type, 64).toUpperCase();
  const year = Number(body.year) || new Date().getUTCFullYear() - 1;
  const force = body.force === true;
  const systemUserId = Deno.env.get("SYSTEM_USER_ID")?.trim() || null;

  const examQueue = requested
    ? [requested]
    : [...DAILY_EXAM_TYPES];

  const since = utcDayStartIso();
  let examId = examQueue[0];

  if (!requested) {
    const pending: string[] = [];
    for (const id of examQueue) {
      const { data } = await db
        .from("scrape_jobs")
        .select("id,status")
        .eq("exam_type", id)
        .gte("created_at", since)
        .in("status", ["queued", "running", "completed"])
        .limit(1);
      if (!data?.length) pending.push(id);
    }
    if (pending.length === 0 && !force) {
      return json(req, {
        ok: true,
        skipped: true,
        message: "All daily exam scrapes already ran today",
        exams: examQueue,
      });
    }
    examId = force ? examQueue[0] : pending[0];
  } else if (!force) {
    const { data } = await db
      .from("scrape_jobs")
      .select("id,status")
      .eq("exam_type", examId)
      .gte("created_at", since)
      .in("status", ["queued", "running", "completed"])
      .limit(1);
    if (data?.length) {
      return json(req, {
        ok: true,
        skipped: true,
        exam_type: examId,
        message: "Already scraped today",
        job_id: data[0].id,
      });
    }
  }

  const { data: jobRow, error: jobErr } = await db
    .from("scrape_jobs")
    .insert({
      exam_type: examId,
      year_from: year,
      year_to: year,
      status: "running",
      progress: { source: "daily-edge", imported: 0 },
      logs: [`${new Date().toISOString()} daily scrape started exam_type=${examId} year=${year}`],
    })
    .select("id")
    .single();

  if (jobErr || !jobRow?.id) {
    return json(req, { error: jobErr?.message ?? "Failed to create scrape_jobs row", code: "JOB_CREATE" }, 500);
  }

  const jobId = jobRow.id as string;

  try {
    const result = await collectExamPapers({
      db,
      examTypeRaw: examId,
      year,
      maxPdfs: 2,
      systemUserId,
    });

    const failed = result.message === "FORBIDDEN_URL" || result.message === "NO_LISTING";
    const status = failed ? "failed" : "completed";
    const logLines = [
      `imported=${result.imported} pdfs=${result.pdfs_processed} exam=${result.exam_type}`,
      ...(result.errors ?? []).slice(0, 20),
    ];

    await db
      .from("scrape_jobs")
      .update({
        status,
        error: failed ? (result.errors?.[0] ?? result.message ?? "collect failed") : null,
        progress: {
          source: "daily-edge",
          imported: result.imported,
          pdfs_processed: result.pdfs_processed,
          pdfs_found: result.pdfs_found,
        },
        logs: logLines,
      })
      .eq("id", jobId);

    return json(req, {
      ok: !failed,
      job_id: jobId,
      ...result,
      remaining: requested
        ? []
        : DAILY_EXAM_TYPES.filter((id) => id !== examId),
    }, failed ? 400 : 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    await db
      .from("scrape_jobs")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", jobId);
    console.error("[run-daily-exam-scrape]", err);
    return json(req, { error: message, code: "INTERNAL", job_id: jobId }, 500);
  }
});
