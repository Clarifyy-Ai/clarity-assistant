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
import { isHostingerMailConfigured, sendHostingerEmail } from "../_shared/hostingerMail.ts";
import { emailButton, publicAppUrl, wrapCareerPilotEmail } from "../_shared/emailLayout.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ??
  Deno.env.get("FROM_EMAIL") ??
  "Career Pilot <hello@trycareerpilot.com>";
const APP_URL = publicAppUrl();
const BATCH_LIMIT = 50;
const EMAIL_RETRY_BACKOFF_MS = 30 * 60 * 1000;

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
  const cta = emailButton(`${APP_URL}/app/interviews`, "View in Career Pilot");
  if (kind === "t24h") {
    return wrapCareerPilotEmail(
      `<h1 style="font-size:22px;font-weight:800;margin:0 0 12px;color:#F8FAFC;">Interview in 24 hours</h1>
<p style="font-size:14px;line-height:1.65;color:#CBD5E1;margin:8px 0;">Your ${roleBit}interview at <strong style="color:#F8FAFC;">${sanitize(company)}</strong> is in about 24 hours (${sanitize(whenText)}).</p>
${cta}`,
      { preheader: `Interview at ${sanitize(company)} in 24 hours` },
    );
  }
  if (kind === "t1h") {
    return wrapCareerPilotEmail(
      `<h1 style="font-size:22px;font-weight:800;margin:0 0 12px;color:#F8FAFC;">Interview in 1 hour</h1>
<p style="font-size:14px;line-height:1.65;color:#CBD5E1;margin:8px 0;">Your ${roleBit}interview at <strong style="color:#F8FAFC;">${sanitize(company)}</strong> starts in about 1 hour (${sanitize(whenText)}).</p>
${cta}`,
      { preheader: `Interview at ${sanitize(company)} in 1 hour` },
    );
  }
  return wrapCareerPilotEmail(
    `<h1 style="font-size:22px;font-weight:800;margin:0 0 12px;color:#F8FAFC;">Interview scheduled</h1>
<p style="font-size:14px;line-height:1.65;color:#CBD5E1;margin:8px 0;">Your ${roleBit}interview at <strong style="color:#F8FAFC;">${sanitize(company)}</strong> is scheduled for ${sanitize(whenText)}.</p>
${cta}`,
    { preheader: `Interview at ${sanitize(company)}` },
  );
}

function inAppTitleForKind(kind: string, company: string): string {
  if (kind === "t24h") return `Interview in 24 hours: ${company}`;
  if (kind === "t1h") return `Interview in 1 hour: ${company}`;
  return `Interview reminder: ${company}`;
}

function inAppBodyForKind(kind: string, company: string, role: string, whenText: string): string {
  const roleBit = role ? `${role} — ` : "";
  if (kind === "t24h") {
    return `${roleBit}${company} is in about 24 hours (${whenText}).`;
  }
  if (kind === "t1h") {
    return `${roleBit}${company} starts in about 1 hour (${whenText}).`;
  }
  return `${roleBit}${company} — ${whenText}`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!to) return false;

  if (isHostingerMailConfigured()) {
    try {
      const result = await sendHostingerEmail({ to, subject, html });
      return result.ok;
    } catch (err) {
      console.error(
        "[send-interview-reminders] Hostinger email failed:",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  if (!RESEND_API_KEY) return false;

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

  const emailConfigured = isHostingerMailConfigured() || Boolean(RESEND_API_KEY);
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
  let inAppOnly = 0;

  for (const row of rows) {
    const { data: interview } = await db
      .from("scheduled_interviews")
      .select("id, company_name, role_title, status, timezone")
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

    const { data: profile } = await db
      .from("profiles")
      .select("session_reminders, email_notifications, timezone")
      .eq("id", row.user_id)
      .maybeSingle();
    if (profile && (profile.session_reminders === false || profile.email_notifications === false)) {
      await db
        .from("interview_reminders")
        .update({
          status: "failed",
          error: "reminders_disabled",
          updated_at: nowIso,
        })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    const { data: rounds } = await db
      .from("interview_rounds")
      .select("scheduled_at, timezone")
      .eq("scheduled_interview_id", row.interview_id)
      .order("round_number", { ascending: true })
      .limit(1);

    const whenIso = rounds?.[0]?.scheduled_at ?? row.remind_at;
    const zone =
      rounds?.[0]?.timezone ||
      interview.timezone ||
      profile?.timezone ||
      "UTC";
    const when = new Date(whenIso);
    const whenText = Number.isNaN(when.getTime())
      ? String(whenIso)
      : when.toLocaleString("en-US", {
          timeZone: zone,
          dateStyle: "full",
          timeStyle: "short",
        });

    const company = String(interview.company_name ?? "Interview");
    const role = String(interview.role_title ?? "");

    const { error: notifErr } = await db.from("notifications").insert({
      user_id: row.user_id,
      type: "reminder",
      title: inAppTitleForKind(row.kind, company),
      body: inAppBodyForKind(row.kind, company, role, whenText),
      action_url: `/app/interviews/${row.interview_id}`,
    });

    if (notifErr) {
      console.error("[send-interview-reminders] in-app notification:", notifErr);
      await db
        .from("interview_reminders")
        .update({
          status: "pending",
          error: "notification_failed",
          remind_at: new Date(Date.now() + EMAIL_RETRY_BACKOFF_MS).toISOString(),
          updated_at: nowIso,
        })
        .eq("id", row.id);
      failed++;
      continue;
    }

    if (!emailConfigured || row.kind === "confirmation") {
      await db
        .from("interview_reminders")
        .update({
          status: "sent",
          sent_at: nowIso,
          error: emailConfigured ? null : "email_not_configured",
          updated_at: nowIso,
        })
        .eq("id", row.id);
      inAppOnly++;
      sent++;
      continue;
    }

    const { data: authUser } = await db.auth.admin.getUserById(row.user_id);
    const email = authUser?.user?.email ?? "";
    if (!email) {
      await db
        .from("interview_reminders")
        .update({
          status: "sent",
          sent_at: nowIso,
          error: "no_email",
          updated_at: nowIso,
        })
        .eq("id", row.id);
      inAppOnly++;
      sent++;
      continue;
    }

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
          status: "pending",
          error: "resend_failed",
          remind_at: new Date(Date.now() + EMAIL_RETRY_BACKOFF_MS).toISOString(),
          updated_at: nowIso,
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return json(req, {
    success: true,
    email_configured: emailConfigured,
    processed: rows.length,
    sent,
    failed,
    skipped,
    in_app_only: inAppOnly,
  });
});
