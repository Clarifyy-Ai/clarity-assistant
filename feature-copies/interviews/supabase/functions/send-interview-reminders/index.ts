/**
 * send-interview-reminders — process due rows from interview_reminders.
 *
 * Auth (any one):
 *  - x-internal-secret / Bearer matching CRON_SECRET, INTERNAL_WORKER_SECRET,
 *    or SUPABASE_SERVICE_ROLE_KEY
 *  - JWT admin (manual trigger)
 *
 * Invoked by pg_cron every 15m (see migration 20260826220100_interview_reminders.sql)
 * or GitHub Actions / Dashboard cron.
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  authenticateRequest,
  extractBearerToken,
  isAdmin,
} from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ??
  Deno.env.get("FROM_EMAIL") ??
  "Clarify AI <noreply@clarifyprep.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://trycareerpilot.com";
const BATCH_LIMIT = 50;

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
    Deno.env.get("CRON_SECRET"),
    Deno.env.get("INTERNAL_WORKER_SECRET"),
    Deno.env.get("INTERVIEW_REMINDER_CRON_SECRET"),
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

function sanitize(str: unknown, max = 200): string {
  return String(str ?? "")
    .replace(/[<>]/g, "")
    .slice(0, max)
    .trim();
}

function subjectForKind(kind: string, company: string): string {
  if (kind === "t24h") return `Reminder: interview at ${company} in 24 hours`;
  if (kind === "t1h") return `Reminder: interview at ${company} in 1 hour`;
  return `Interview scheduled: ${company}`;
}

function bodyForKind(
  kind: string,
  company: string,
  role: string,
  whenText: string,
): string {
  const roleBit = role ? `${sanitize(role)} ` : "";
  if (kind === "t24h") {
    return `<p>Reminder: your ${roleBit}interview at <strong>${sanitize(company)}</strong> is in about 24 hours (${sanitize(whenText)}).</p>
<p><a href="${APP_URL}/app/interviews">View in Clarify AI</a></p>`;
  }
  if (kind === "t1h") {
    return `<p>Reminder: your ${roleBit}interview at <strong>${sanitize(company)}</strong> starts in about 1 hour (${sanitize(whenText)}).</p>
<p><a href="${APP_URL}/app/interviews">View in Clarify AI</a></p>`;
  }
  return `<p>Your ${roleBit}interview at <strong>${sanitize(company)}</strong> is scheduled for ${sanitize(whenText)}.</p>
<p><a href="${APP_URL}/app/interviews">View in Clarify AI</a></p>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      signal: controller.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    return res.ok;
  } catch (err) {
    console.error(
      "[send-interview-reminders] email failed:",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
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

  if (!RESEND_API_KEY) {
    return json(
      req,
      {
        error: "RESEND_API_KEY not configured",
        code: "NOT_CONFIGURED",
        processed: 0,
      },
      501,
    );
  }

  const db = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due, error: dueErr } = await db
    .from("interview_reminders")
    .select("id, interview_id, user_id, kind, remind_at")
    .eq("status", "pending")
    .lte("remind_at", nowIso)
    .order("remind_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (dueErr) {
    console.error("[send-interview-reminders] query:", dueErr);
    return json(req, { error: "Failed to load reminders", code: "DB_ERROR" }, 500);
  }

  const rows = due ?? [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const { data: interview } = await db
      .from("scheduled_interviews")
      .select("id, company_name, role_title, status")
      .eq("id", row.interview_id)
      .maybeSingle();

    if (!interview || interview.status === "cancelled" || interview.status === "completed") {
      await db
        .from("interview_reminders")
        .update({
          status: "failed",
          error: "interview_unavailable",
          updated_at: nowIso,
        })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    // Prefer round scheduled_at for display time
    const { data: rounds } = await db
      .from("interview_rounds")
      .select("scheduled_at")
      .eq("scheduled_interview_id", row.interview_id)
      .order("round_number", { ascending: true })
      .limit(1);

    const whenIso = rounds?.[0]?.scheduled_at ?? row.remind_at;
    const when = new Date(whenIso);
    const whenText = Number.isNaN(when.getTime())
      ? String(whenIso)
      : when.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });

    const { data: authUser } = await db.auth.admin.getUserById(row.user_id);
    const email = authUser?.user?.email ?? "";
    if (!email) {
      await db
        .from("interview_reminders")
        .update({
          status: "failed",
          error: "no_email",
          updated_at: nowIso,
        })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const company = String(interview.company_name ?? "Interview");
    const role = String(interview.role_title ?? "");
    const ok = await sendEmail(
      email,
      subjectForKind(row.kind, company),
      bodyForKind(row.kind, company, role, whenText),
    );

    if (ok) {
      await db
        .from("interview_reminders")
        .update({
          status: "sent",
          sent_at: nowIso,
          error: null,
          updated_at: nowIso,
        })
        .eq("id", row.id);
      sent++;
    } else {
      await db
        .from("interview_reminders")
        .update({
          status: "failed",
          error: "resend_failed",
          updated_at: nowIso,
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return json(req, {
    success: true,
    processed: rows.length,
    sent,
    failed,
    skipped,
  });
});
