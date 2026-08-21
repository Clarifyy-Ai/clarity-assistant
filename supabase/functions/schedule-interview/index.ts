// schedule-interview — create in-app notification + optional email reminder after scheduling.

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { requireAuth } from "../_shared/utils.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ??
  Deno.env.get("FROM_EMAIL") ??
  "Clarify AI <noreply@clarifyprep.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://clarityapp.ai";

function sanitize(str: unknown, max = 200): string {
  return String(str ?? "")
    .replace(/[<>]/g, "")
    .slice(0, max)
    .trim();
}

async function sendReminderEmail(
  to: string,
  company: string,
  role: string,
  whenIso: string
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
<p><a href="${APP_URL}/app/interviews">View in Clarify AI</a></p>`,
    }),
  });

  return res.ok;
  } catch (error) {
    console.error(
      "[schedule-interview] reminder email failed:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
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

    const interviewId = sanitize(body?.interview_id, 64);
    const company = sanitize(body?.company_name, 120);
    const role = sanitize(body?.role_title, 120);
    const scheduledAt = sanitize(body?.scheduled_at, 64);

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(interviewId) ||
      !company ||
      !scheduledAt
    ) {
      return new Response(
        JSON.stringify({ error: "Missing interview_id, company_name, or scheduled_at" }),
        { status: 400, headers }
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
    let emailSent = false;
    if (email) {
      emailSent = await sendReminderEmail(email, company, role, scheduledAt);
    }

    return new Response(
      JSON.stringify({
        success: true,
        notification_id: notification?.id,
        email_sent: emailSent,
      }),
      { headers }
    );
  } catch (err) {
    console.error("[schedule-interview]", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: getCorsHeaders(req),
    });
  }
});
