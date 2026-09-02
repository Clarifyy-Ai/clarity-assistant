/**
 * Career Pilot HTML email shell. Table-based for Outlook/Gmail.
 * Public site is always trycareerpilot.com unless APP_URL/PUBLIC_URL/SITE_URL override.
 */

export const PUBLIC_WEBSITE_URL = "https://trycareerpilot.com";
export const PUBLIC_MAILBOX = "hello@trycareerpilot.com";
export const EMAIL_LEGAL_ENTITY = "Payara Labs";

export function publicAppUrl(): string {
  const raw =
    Deno.env.get("APP_URL") ??
    Deno.env.get("PUBLIC_URL") ??
    Deno.env.get("SITE_URL") ??
    PUBLIC_WEBSITE_URL;
  return String(raw).trim().replace(/\/+$/, "") || PUBLIC_WEBSITE_URL;
}

export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#2563EB;color:#ffffff !important;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;font-size:14px;margin-top:16px;">${label}</a>`;
}

export function wrapCareerPilotEmail(innerHtml: string, opts?: { preheader?: string }): string {
  const year = new Date().getFullYear();
  const preheader = opts?.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Career Pilot</title>
</head>
<body style="margin:0;padding:0;background:#0B1220;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="padding:0 8px 24px;">
            <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#F8FAFC;">Career </span>
            <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#38BDF8;">Pilot</span>
          </td>
        </tr>
        <tr>
          <td style="background:#163B73;border:1px solid rgba(56,189,248,0.22);border-radius:16px;padding:28px 24px;color:#F8FAFC;">
            ${innerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 8px 0;font-size:12px;line-height:1.6;color:#64748B;text-align:center;">
            Navigate your career. Prepare with confidence.<br/>
            © ${year} ${EMAIL_LEGAL_ENTITY} ·
            <a href="${PUBLIC_WEBSITE_URL}" style="color:#38BDF8;text-decoration:none;">trycareerpilot.com</a><br/>
            <a href="mailto:${PUBLIC_MAILBOX}" style="color:#64748B;text-decoration:none;">${PUBLIC_MAILBOX}</a>
            · <a href="${PUBLIC_WEBSITE_URL}/unsubscribe" style="color:#64748B;text-decoration:none;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
