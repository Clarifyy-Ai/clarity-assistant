// send-email/index.ts — FIXED, SECURE, PRODUCTION VERSION// send-email/index.ts — FIXED, corsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  errorResponse,
  successResponse,
  log
} from "../_shared/utils.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "Clarify AI <hello@confideq.app>";

/* -------------------------------------------------------------------------- */
/*                              HELPERS                                       */
/* -------------------------------------------------------------------------- */

function sanitize(str: any, max = 500): string {
  return String(str ?? "")
    .replace(/[<>]/g, "")      // prevent HTML/script injection
    .replace(/`/g, "")
    .replace(/[\u0000-\u0009]/g, "")
    .slice(0, max)
    .trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendEmailResend(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    }),
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

function renderTemplate(type: EmailType, data: any) {
  const safe = (x: any, max = 500) => sanitize(x, max);

  const base = (inner: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: system-ui, sans-serif; background: #0a0a0f; color: #e2e2e2; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
    .logo { font-size: 20px; font-weight: 900; color: #8b5cf6; margin-bottom: 32px; }
    .card { background: #13131f; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px; margin: 16px 0; }
    .btn { display: inline-block; background: #7c3aed; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; font-size: 14px; margin-top: 16px; }
    h1 { font-size: 24px; font-weight: 800; margin: 0 0 8px; }
    p { font-size: 14px; color: #9ca3af; line-height: 1.6; margin: 8px 0; }
    .footer { font-size: 11px; color: #4b5563; margin-top: 32px; text-align: center; }
  </style>
</head>
<body>
<div class="container">
  <div class="logo">⚡ Clarify AI</div>
  ${inner}
  <div class="footer">
    © 2025 Payara Labs · <a href="https://confideq.app/unsubscribe" style="color:#4b5563;">Unsubscribe</a>
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
        subject: `Your weekly Clarify AI report — ${safe(data.sessions_this_week)} sessions`,
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
        subject: "Welcome to Clarify AI! 🎉",
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
      return { subject: "Clarify AI Notification", html: base("<div class='card'>Hello!</div>") };
  }
}

/* -------------------------------------------------------------------------- */
/*                             MAIN HANDLER                                   */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ---------------- AUTH ---------------- */
    const auth = await requireAuth(req);
    const userId = auth.userId;

    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse("Invalid JSON body", "INVALID", 400);
    }

    const { to, type, data } = body;

    if (!to || typeof to !== "string" || !isValidEmail(to)) {
      return errorResponse("Invalid 'to' field", "VALIDATION_ERROR", 400);
    }

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return errorResponse("Unknown email type", "VALIDATION_ERROR", 400);
    }

    // OPTIONAL: enforce that users can only email themselves
    if (to !== auth.email) {
      return errorResponse("Not authorized to send to this address", "FORBIDDEN", 403);
    }

    const { subject, html } = renderTemplate(type, data ?? {});
    const ok = await sendEmailResend(to, subject, html);

    log("send-email", "info", "Email sent", { to, type, userId });

    return successResponse({ success: ok });
  } catch (err) {
    console.error("[send-email] error:", err);
    return errorResponse("Internal error", "INTERNAL", 500);
  }
});
``

