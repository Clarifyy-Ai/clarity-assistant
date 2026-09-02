import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { getClientIp } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  createRateLimitKey,
  enforceRateLimitAsync,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import { isHostingerMailConfigured, sendHostingerEmail } from "../_shared/hostingerMail.ts";
import { wrapCareerPilotEmail } from "../_shared/emailLayout.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ??
  Deno.env.get("FROM_EMAIL") ??
  "Career Pilot <hello@trycareerpilot.com>";
const SALES_EMAIL = Deno.env.get("SALES_EMAIL") ?? "hello@trycareerpilot.com";

function sanitize(str: unknown, max = 2000): string {
  return String(str ?? "")
    .replace(/[<>]/g, "")
    .slice(0, max)
    .trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function emailProviderConfigured(): boolean {
  return isHostingerMailConfigured() || RESEND_API_KEY.trim().length > 0;
}

function buildSalesHtml(name: string, email: string, company: string, message: string): string {
  return wrapCareerPilotEmail(
    `<h1 style="font-size:22px;font-weight:800;margin:0 0 12px;color:#F8FAFC;">New sales inquiry</h1>
<p style="font-size:14px;line-height:1.65;color:#CBD5E1;margin:8px 0;"><strong style="color:#F8FAFC;">${name}</strong> &lt;${email}&gt;</p>
${company ? `<p style="font-size:14px;line-height:1.65;color:#CBD5E1;margin:8px 0;">Company: ${company}</p>` : ""}
<p style="font-size:14px;line-height:1.65;color:#CBD5E1;margin:8px 0;">${message.replace(/\n/g, "<br/>")}</p>
<p style="font-size:13px;line-height:1.65;color:#94A3B8;margin:16px 0 0;">Reply to <a href="mailto:${email}" style="color:#2563EB;">${email}</a></p>`,
    { preheader: `Sales inquiry from ${name}` },
  );
}

async function sendSalesEmailResend(
  subject: string,
  html: string,
  replyTo: string,
): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: SALES_EMAIL,
      reply_to: replyTo,
      subject,
      html,
    }),
  });
  return res.ok;
}

/** Prefer Hostinger Mail API when configured; otherwise Resend. */
async function sendSalesEmail(
  subject: string,
  html: string,
  replyTo: string,
): Promise<boolean> {
  if (isHostingerMailConfigured()) {
    const result = await sendHostingerEmail({
      to: SALES_EMAIL,
      subject,
      html,
      displayName: "Career Pilot",
    });
    if (!result.ok) {
      console.error("[contact-sales] Hostinger error:", result.status, result.error);
    }
    return result.ok;
  }
  if (!RESEND_API_KEY.trim()) return false;
  return sendSalesEmailResend(subject, html, replyTo);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  const rateLimited = await enforceRateLimitAsync(
    createServiceClient(),
    {
      key: createRateLimitKey("contact-sales", getClientIp(req) || "unknown"),
      ...RATE_LIMIT_PRESETS.EMAIL_ACTION,
    },
    req,
  );
  if (rateLimited) return rateLimited;

  if (!emailProviderConfigured()) {
    return new Response(
      JSON.stringify({
        error: "Contact Sales email is not configured.",
        code: "NOT_CONFIGURED",
      }),
      { status: 501, headers },
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = sanitize(body?.name, 120);
  const email = sanitize(body?.email, 200);
  const company = sanitize(body?.company, 150);
  const message = sanitize(body?.message, 4000);

  if (!name || !isValidEmail(email) || message.length < 10) {
    return new Response(
      JSON.stringify({
        error: "Name, a valid email, and a message of at least 10 characters are required.",
        code: "INVALID_INPUT",
      }),
      { status: 400, headers },
    );
  }

  const subject = `Sales inquiry from ${name}${company ? ` (${company})` : ""}`;
  const html = buildSalesHtml(name, email, company, message);
  const sent = await sendSalesEmail(subject, html, email);

  if (!sent) {
    return new Response(
      JSON.stringify({
        error: "Could not send the sales message. Try again or use email.",
        code: "EMAIL_FAILED",
      }),
      { status: 502, headers },
    );
  }

  return new Response(JSON.stringify({ success: true }), { headers });
});
