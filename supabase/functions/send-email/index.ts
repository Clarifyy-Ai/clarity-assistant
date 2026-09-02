// send-email/index.ts — FIXED, SECURE, PRODUCTION VERSION

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  errorResponse,
  successResponse,
  log,
  getAdminClient,
} from "../_shared/utils.ts";
import { enforceEmailRateLimitAsync } from "../_shared/rateLimit.ts";
import { isHostingerMailConfigured, sendHostingerEmail } from "../_shared/hostingerMail.ts";
import { emailButton, publicAppUrl, wrapCareerPilotEmail } from "../_shared/emailLayout.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ??
  Deno.env.get("FROM_EMAIL") ??
  "Career Pilot <hello@trycareerpilot.com>";

/* -------------------------------------------------------------------------- */
/*                              HELPERS                                       */
/* -------------------------------------------------------------------------- */

function sanitize(str: unknown, max = 500): string {
  return String(str ?? "")
    .replace(/[<>]/g, "")
    .replace(/`/g, "")
    .replace(/[\u0000-\u0009]/g, "")
    .slice(0, max)
    .trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function structuredError(
  req: Request,
  message: string,
  code: string,
  status: number,
  correlationId: string,
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      code,
      correlation_id: correlationId,
    }),
    {
      status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    },
  );
}

async function sendEmailResend(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[send-email] Resend error:", res.status, text);
  }

  return res.ok;
}

function emailProviderConfigured(): boolean {
  return isHostingerMailConfigured() || RESEND_API_KEY.trim().length > 0;
}

/** Prefer Hostinger Mail API when the token is set; otherwise Resend. */
async function sendProductEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (isHostingerMailConfigured()) {
    const result = await sendHostingerEmail({ to, subject, html });
    if (!result.ok) {
      console.error("[send-email] Hostinger error:", result.status, result.error);
    }
    return result.ok;
  }
  if (!RESEND_API_KEY.trim()) return false;
  return sendEmailResend(to, subject, html);
}

/* -------------------------------------------------------------------------- */
/*                           EMAIL TEMPLATES                                  */
/* -------------------------------------------------------------------------- */

const ALLOWED_TYPES = [
  "interview_reminder",
  "weekly_report",
  "debrief_ready",
  "welcome",
  "low_credits",
  "streak_reminder",
] as const;

type EmailType = (typeof ALLOWED_TYPES)[number];

function renderTemplate(type: EmailType, data: Record<string, unknown>) {
  const safe = (x: unknown, max = 500) => sanitize(x, max);
  const app = publicAppUrl();
  const heading = (text: string) =>
    `<h1 style="font-size:22px;font-weight:800;margin:0 0 12px;color:#F8FAFC;">${text}</h1>`;
  const para = (text: string) =>
    `<p style="font-size:14px;line-height:1.65;color:#CBD5E1;margin:8px 0;">${text}</p>`;

  switch (type) {
    case "interview_reminder":
      return {
        subject: `Interview reminder: ${safe(data.company)} in ${safe(data.time_until)}`,
        html: wrapCareerPilotEmail(
          `${heading("Interview soon")}
          ${para(`Your interview with <strong style="color:#F8FAFC;">${safe(data.company)}</strong> for <strong style="color:#F8FAFC;">${safe(data.role)}</strong> begins in ${safe(data.time_until)}.`)}
          ${para(`${safe(data.time)} · ${safe(data.platform)}`)}
          ${data.meeting_link ? emailButton(sanitize(data.meeting_link), "Open meeting") : emailButton(`${app}/app/interviews`, "View in Career Pilot")}`,
          { preheader: `Interview with ${safe(data.company)} in ${safe(data.time_until)}` },
        ),
      };
    case "debrief_ready":
      return {
        subject: `Your interview debrief is ready (${safe(data.score)}/100)`,
        html: wrapCareerPilotEmail(
          `${heading("Debrief ready")}
          ${para(`You scored <strong style="color:#F8FAFC;">${safe(data.score)}</strong> on your interview.`)}
          ${emailButton(`${app}/app/debrief/${safe(data.debrief_id)}`, "View debrief")}`,
          { preheader: "Your Career Pilot interview debrief is ready." },
        ),
      };
    case "weekly_report":
      return {
        subject: `Your weekly Career Pilot report — ${safe(data.sessions_this_week)} sessions`,
        html: wrapCareerPilotEmail(
          `${heading("This week's summary")}
          ${para(`Sessions: ${safe(data.sessions_this_week)}`)}
          ${para(`Average score: ${safe(data.avg_score)}`)}
          ${para(`Streak: ${safe(data.streak)} days`)}
          ${emailButton(`${app}/app/dashboard`, "Open dashboard")}`,
          { preheader: "Your weekly Career Pilot practice summary." },
        ),
      };
    case "welcome":
      return {
        subject: "Welcome to Career Pilot",
        html: wrapCareerPilotEmail(
          `${heading(`Welcome${data.name ? `, ${safe(data.name)}` : ""}`)}
          ${para("You're ready to start preparing for interviews and exams with Career Pilot.")}
          ${emailButton(`${app}/app/dashboard`, "Start practicing")}`,
          { preheader: "Welcome to Career Pilot." },
        ),
      };
    case "low_credits":
      return {
        subject: `Low credits — ${safe(data.remaining)} left`,
        html: wrapCareerPilotEmail(
          `${heading("Running low on credits")}
          ${para(`You have ${safe(data.remaining)} credits remaining.`)}
          ${emailButton(`${app}/app/settings/credits`, "Buy credits")}`,
          { preheader: "Your Career Pilot credits are running low." },
        ),
      };
    case "streak_reminder":
      return {
        subject: "Keep your Career Pilot streak going",
        html: wrapCareerPilotEmail(
          `${heading("Your practice streak needs you")}
          ${para("Don't break the momentum — complete a session today.")}
          ${emailButton(`${app}/app/dashboard`, "Practice now")}`,
          { preheader: "Complete a session today to keep your streak." },
        ),
      };
    default:
      return {
        subject: "Career Pilot",
        html: wrapCareerPilotEmail(`${para("Hello from Career Pilot.")}${emailButton(`${app}/app/dashboard`, "Open Career Pilot")}`),
      };
  }
}

/* -------------------------------------------------------------------------- */
/*                             MAIN HANDLER                                   */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const correlationId = crypto.randomUUID();

  try {
    if (!emailProviderConfigured()) {
      return structuredError(
        req,
        "Email is not configured yet. Add HOSTINGER_MAIL_API_TOKEN or RESEND_API_KEY in Supabase project secrets.",
        "PROVIDER_UNAVAILABLE",
        503,
        correlationId,
      );
    }

    const auth = await requireAuth(req);
    const userId = auth.userId;

    const rateLimited = await enforceEmailRateLimitAsync(
      getAdminClient(),
      "send-email",
      userId,
    );
    if (rateLimited) return withCorsHeaders(req, rateLimited);

    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse("Invalid JSON body", "INVALID", 400, req);
    }

    const { to, type, data } = body as {
      to?: unknown;
      type?: unknown;
      data?: Record<string, unknown>;
    };

    if (!to || typeof to !== "string" || !isValidEmail(to)) {
      return errorResponse("Invalid 'to' field", "VALIDATION_ERROR", 400, req);
    }

    if (!type || !ALLOWED_TYPES.includes(type as EmailType)) {
      return errorResponse("Unknown email type", "VALIDATION_ERROR", 400, req);
    }

    if (to !== auth.email) {
      return errorResponse("Not authorized to send to this address", "FORBIDDEN", 403, req);
    }

    // Honour profile notification preferences (master + category)
    const { data: profile } = await getAdminClient()
      .from("profiles")
      .select("email_notifications, session_reminders, marketing_emails, notification_prefs")
      .eq("id", userId)
      .maybeSingle();

    const prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
    const emailMaster = profile?.email_notifications !== false;

    const typeAllowed = ((): boolean => {
      if (type === "welcome") return true; // onboarding always allowed
      if (!emailMaster) return false;
      switch (type) {
        case "interview_reminder":
          return profile?.session_reminders !== false;
        case "debrief_ready":
          return prefs.debrief_ready !== false;
        case "low_credits":
          return prefs.credit_low !== false;
        case "streak_reminder":
          return prefs.practice_reminders !== false;
        case "weekly_report":
          return prefs.digest_frequency !== "off" && prefs.session_complete !== false;
        default:
          // Product/marketing-style mail must honour marketing + product_updates prefs
          if (profile?.marketing_emails === false) return false;
          if (prefs.product_updates === false) return false;
          return true;
      }
    })();

    if (!typeAllowed) {
      log("send-email", "info", "Skipped by notification prefs", { to, type, userId, correlationId });
      return successResponse({
        success: false,
        skipped: true,
        reason: "notification_prefs_disabled",
      }, undefined, 200, req);
    }

    const { subject, html } = renderTemplate(type as EmailType, data ?? {});
    const ok = await sendProductEmail(to, subject, html);

    log("send-email", "info", "Email sent", { to, type, userId, correlationId, ok });

    return successResponse({ success: ok }, undefined, 200, req);
  } catch (err) {
    if (err instanceof Response) {
      return withCorsHeaders(req, err);
    }
    const errMsg = err instanceof Error ? err.message : String(err ?? "");
    console.error("[send-email] error:", { correlationId, err: errMsg.slice(0, 500) });
    return structuredError(
      req,
      "Internal error",
      "INTERNAL_ERROR",
      500,
      correlationId,
    );
  }
});
