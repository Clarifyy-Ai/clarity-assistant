import { handleCors, getCorsHeaders } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ??
  Deno.env.get("FROM_EMAIL") ??
  "Clarify AI <noreply@clarifyprep.com>";
const SALES_EMAIL = Deno.env.get("SALES_EMAIL") ?? "sales@clarifyprep.com";

function sanitize(str: unknown, max = 2000): string {
  return String(str ?? "")
    .replace(/[<>]/g, "")
    .slice(0, max)
    .trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  if (!RESEND_API_KEY) {
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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: SALES_EMAIL,
      reply_to: email,
      subject: `Sales inquiry from ${name}${company ? ` (${company})` : ""}`,
      html: `<p><strong>${name}</strong> &lt;${email}&gt;</p>
${company ? `<p>Company: ${company}</p>` : ""}
<p>${message.replace(/\n/g, "<br/>")}</p>`,
    }),
  });

  if (!res.ok) {
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
