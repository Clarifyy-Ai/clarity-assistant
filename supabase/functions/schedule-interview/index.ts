// schedule-interview — in-app notification + optional email confirmation + T-24h/T-1h queue.

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { requireAuth } from "../_shared/utils.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ??
  Deno.env.get("FROM_EMAIL") ??
  "Career Pilot <hello@trycareerpilot.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://clarityapp.ai";

function sanitize(str: unknown, max = 200): string {
  return String(str ?? "")
    .replace(/[<>]/g, "")
    .slice(0, max)
    .trim();
}

async function sendConfirmationEmail(
  to: string,
  company: string,
  role: string,
  whenIso: string,
): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false;

  const when = new Date(whenIso);
  const whenText = Number.isNaN(when.getTime())
    ? whenIso
    : when.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });

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
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject: `Interview scheduled: ${company}`,
        html: `<p>Your ${sanitize(role)} interview at <strong>${sanitize(company)}</strong> is scheduled for ${sanitize(whenText)}.</p>
<p><a href="${APP_URL}/app/interviews">View in Career Pilot</a></p>`,
      }),
    });

    return res.ok;
  } catch (error) {
    console.error(
      "[schedule-interview] confirmation email failed:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

type ReminderKind = "t24h" | "t1h" | "confirmation";

function buildReminderRows(
  interviewId: string,
  userId: string,
  scheduledAtMs: number,
  nowMs: number,
  includeConfirmation: boolean,
): Array<{
  interview_id: string;
  user_id: string;
  remind_at: string;
  kind: ReminderKind;
  status: "pending" | "sent";
  sent_at?: string;
}> {
  const rows: Array<{
    interview_id: string;
    user_id: string;
    remind_at: string;
    kind: ReminderKind;
    status: "pending" | "sent";
    sent_at?: string;
  }> = [];

  const t24 = scheduledAtMs - 24 * 60 * 60 * 1000;
  const t1 = scheduledAtMs - 60 * 60 * 1000;

  if (t24 > nowMs) {
    rows.push({
      interview_id: interviewId,
      user_id: userId,
      remind_at: new Date(t24).toISOString(),
      kind: "t24h",
      status: "pending",
    });
  }
  if (t1 > nowMs) {
    rows.push({
      interview_id: interviewId,
      user_id: userId,
      remind_at: new Date(t1).toISOString(),
      kind: "t1h",
      status: "pending",
    });
  }
  if (includeConfirmation) {
    rows.push({
      interview_id: interviewId,
      user_id: userId,
      remind_at: new Date(nowMs).toISOString(),
      kind: "confirmation",
      status: "sent",
      sent_at: new Date(nowMs).toISOString(),
    });
  }

  return rows;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers,
      });
    }

    const { userId } = await requireAuth(req);
    const db = createServiceClient();

    const rateLimited = await enforceSessionRateLimitAsync(
      db,
      "schedule-interview",
      userId,
    );
    if (rateLimited) return withCorsHeaders(req, rateLimited);

    const body = await req.json().catch(() => ({}));
    const action = sanitize(body?.action, 20).toLowerCase();

    const interviewId = sanitize(body?.interview_id, 64);
    const company = sanitize(body?.company_name, 150);
    const role = sanitize(body?.role_title, 150);
    const scheduledAt = sanitize(body?.scheduled_at, 64);
    const timezone = sanitize(body?.timezone, 64);
    const ianaOk =
      !timezone ||
      timezone === "local" ||
      timezone === "UTC" ||
      /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(timezone);
    if (!ianaOk) {
      return new Response(
        JSON.stringify({ error: "timezone must be a valid IANA zone (e.g. Asia/Kolkata)." }),
        { status: 400, headers },
      );
    }
    // Immediate confirmation email is optional (default true when RESEND configured).
    const sendConfirmation =
      body?.send_confirmation === undefined
        ? true
        : Boolean(body.send_confirmation);

    if (action === "cancel") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(interviewId)) {
        return new Response(JSON.stringify({ error: "Interview id is required." }), {
          status: 400,
          headers,
        });
      }
      const { data: owned } = await db
        .from("scheduled_interviews")
        .select("id")
        .eq("id", interviewId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!owned) {
        return new Response(JSON.stringify({ error: "Interview not found" }), {
          status: 404,
          headers,
        });
      }
      await db
        .from("scheduled_interviews")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", interviewId)
        .eq("user_id", userId);
      await db
        .from("interview_reminders")
        .delete()
        .eq("interview_id", interviewId)
        .eq("user_id", userId)
        .eq("status", "pending");
      return new Response(
        JSON.stringify({ success: true, cancelled: true, reminders_cleared: true }),
        { headers },
      );
    }

    const placeholderValues = new Set([
      "test",
      "testing",
      "asdf",
      "qwerty",
      "xxx",
      "xyz",
      "abc",
      "n/a",
      "na",
      "none",
      "null",
      "company",
      "role",
      "5555",
      "tttttt",
    ]);

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(interviewId) ||
      !company ||
      company.length < 2 ||
      company.length > 150 ||
      !/[a-zA-Z]/.test(company) ||
      placeholderValues.has(company.toLowerCase()) ||
      !scheduledAt
    ) {
      return new Response(
        JSON.stringify({ error: "Company name is required and must be a meaningful value." }),
        { status: 400, headers },
      );
    }

    if (
      !role ||
      role.length < 2 ||
      role.length > 150 ||
      !/[a-zA-Z]/.test(role) ||
      placeholderValues.has(role.toLowerCase())
    ) {
      return new Response(
        JSON.stringify({ error: "Role title is required and must be a meaningful value." }),
        { status: 400, headers },
      );
    }

    const { data: interview } = await db
      .from("scheduled_interviews")
      .select("id, user_id")
      .eq("id", interviewId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!interview) {
      return new Response(JSON.stringify({ error: "Interview not found" }), {
        status: 404,
        headers,
      });
    }

    if (timezone && timezone !== "local") {
      await db
        .from("scheduled_interviews")
        .update({ timezone, updated_at: new Date().toISOString() })
        .eq("id", interviewId)
        .eq("user_id", userId);
    }

    const when = new Date(scheduledAt);
    if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) {
      return new Response(
        JSON.stringify({ error: "scheduled_at must be a valid future timestamp" }),
        { status: 400, headers },
      );
    }
    const title = `Interview: ${company}`;
    const bodyText = role
      ? `${role} — ${Number.isNaN(when.getTime()) ? scheduledAt : when.toLocaleString()}`
      : Number.isNaN(when.getTime())
        ? scheduledAt
        : when.toLocaleString();

    const { data: notification, error: notifErr } = await db
      .from("notifications")
      .insert({
        user_id: userId,
        type: "reminder",
        title,
        body: bodyText,
        action_url: `/app/interviews/${interviewId}`,
      })
      .select("id")
      .single();

    if (notifErr) {
      console.error("[schedule-interview] notification insert:", notifErr);
      return new Response(JSON.stringify({ error: "Failed to create reminder" }), {
        status: 500,
        headers,
      });
    }

    const { data: authUser } = await db.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? "";
    const emailConfigured = Boolean(RESEND_API_KEY);
    let emailSent = false;
    let remindersQueued = 0;

    if (emailConfigured) {
      if (sendConfirmation && email) {
        emailSent = await sendConfirmationEmail(email, company, role, scheduledAt);
      }

      const nowMs = Date.now();
      const rows = buildReminderRows(
        interviewId,
        userId,
        when.getTime(),
        nowMs,
        sendConfirmation && emailSent,
      );

      if (rows.length > 0) {
        const { data: upserted, error: queueErr } = await db
          .from("interview_reminders")
          .upsert(rows, { onConflict: "interview_id,kind" })
          .select("id");

        if (queueErr) {
          console.error("[schedule-interview] reminder queue:", queueErr);
        } else {
          remindersQueued = upserted?.length ?? rows.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notification_id: notification?.id,
        email_sent: emailSent,
        email_configured: emailConfigured,
        reminders_queued: remindersQueued,
        send_confirmation: sendConfirmation,
      }),
      { headers },
    );
  } catch (err) {
    if (err instanceof Response) {
      return withCorsHeaders(req, err);
    }
    console.error("[schedule-interview]", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
