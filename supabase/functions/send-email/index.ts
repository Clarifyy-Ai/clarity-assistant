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

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ??
  Deno.env.get("FROM_EMAIL") ??
  "Career Pilot <hello@trycareerpilot.com>";
/** Public legal operator name — not "Payara Innovations Private Limited". */
const LEGAL_ENTITY_NAME = "Payara Labs";

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

  const base = (inner: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: Inter, system-ui, sans-serif; background: #0B1220; color: #F5F7FA; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
    .logo { font-size: 20px; font-weight: 800; color: #38BDF8; margin-bottom: 32px; }
    .card { background: #163B73; border: 1px solid rgba(56,189,248,0.18); border-radius: 16px; padding: 24px; margin: 16px 0; }
    .btn { display: inline-block; background: #2563EB; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; font-size: 14px; margin-top: 16px; }
    h1 { font-size: 24px; font-weight: 800; margin: 0 0 8px; }
    p { font-size: 14px; color: #9ca3af; line-height: 1.6; margin: 8px 0; }
    .footer { font-size: 11px; color: #4b5563; margin-top: 32px; text-align: center; }
  </style>
</head>
<body>
<div class="container">
  <div class="logo">Career Pilot</div>
  ${inner}
  <div class="footer">
    © ${new Date().getFullYear()} ${LEGAL_ENTITY_NAME} · <a href="https://confideq.app/unsubscribe" style="color:#4b5563;">Unsubscribe</a>
  </div>
</div>
</body>
</html>`;

  switch (type) {
    case "interview_reminder":
      return {
        subject: `Interview reminder: ${safe(data.company)} in ${safe(data.time_until)}`,
        html: base(`
          <div class="card">
            <h1>Interview soon!</h1>
            <p>Your interview with <strong>${safe(data.company)}</strong> for <strong>${safe(data.role)}</strong> begins in ${safe(data.time_until)}.</p>
            <p>${safe(data.time)} · ${safe(data.platform)}</p>
            ${data.meeting_link ? `<a class="btn" href="${sanitize(data.meeting_link)}">Open meeting</a>` : ""}
          </div>`),
      };
    case "debrief_ready":
      return {
        subject: `Your interview debrief is ready (${safe(data.score)}/100)`,
        html: base(`
          <div class="card">
            <h1>Debrief ready!</h1>
            <p>You scored <strong>${safe(data.score)}</strong> on your interview.</p>
            <a class="btn" href="https://confideq.app/app/debrief/${safe(data.debrief_id)}">View debrief</a>
          </div>`),
      };
    case "weekly_report":
      return {
        subject: `Your weekly Career Pilot report — ${safe(data.sessions_this_week)} sessions`,
        html: base(`
          <div class="card">
            <h1>This week's summary</h1>
            <p>Sessions: ${safe(data.sessions_this_week)}</p>
            <p>Average score: ${safe(data.avg_score)}</p>
            <p>Streak: ${safe(data.streak)} days</p>
          </div>`),
      };
    case "welcome":
      return {
        subject: "Welcome to Career Pilot! 🎉",
        html: base(`
          <div class="card">
            <h1>Welcome ${safe(data.name)}</h1>
            <p>You're ready to start preparing!</p>
            <a href="https://confideq.app/app/dashboard" class="btn">Start practicing</a>
          </div>`),
      };
    case "low_credits":
      return {
        subject: `Low Credits — ${safe(data.remaining)} left`,
        html: base(`
          <div class="card">
            <h1>Running low on credits</h1>
            <p>You have ${safe(data.remaining)} credits remaining.</p>
            <a href="https://confideq.app/app/settings/credits" class="btn">Buy credits</a>
          </div>`),
      };
    case "streak_reminder":
      return {
        subject: "🔥 Keep your streak going!",
        html: base(`
          <div class="card">
            <h1>Your practice streak needs you!</h1>
            <p>Don't break the momentum — complete a session today.</p>
          </div>`),
      };
    default:
      return { subject: "Career Pilot Notification", html: base("<div class='card'>Hello!</div>") };
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
    if (!RESEND_API_KEY.trim()) {
      return structuredError(
        req,
        "Email is not configured yet. Add RESEND_API_KEY in Supabase project secrets.",
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
    const ok = await sendEmailResend(to, subject, html);

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
