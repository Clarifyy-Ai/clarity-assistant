#!/usr/bin/env node
/**
 * Apply Career Pilot branded Auth email templates + site URL on the live project.
 *
 * Never prints secret values. Pass the PAT via env:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node --use-system-ca scripts/configure-auth-email-templates.mjs
 */

import fs from "node:fs";
import https from "https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();

const PROJECT_REF = "qzgvjrvtkwlzxpmlddkx";
const SITE_URL = "https://trycareerpilot.com";
const WWW_URL = "https://www.trycareerpilot.com";
const MAILBOX = "hello@trycareerpilot.com";
const LEGAL = "Payara Labs";
const YEAR = String(new Date().getFullYear());

const EXTRA_REDIRECTS = [
  `${SITE_URL}/**`,
  `${WWW_URL}/**`,
  `${SITE_URL}/auth/callback`,
  `${WWW_URL}/auth/callback`,
  `${SITE_URL}/reset-password`,
  `${WWW_URL}/reset-password`,
];

function requestJson(hostname, apiPath, { method, token, body }) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, data }));
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function supabase(method, apiPath, token, body) {
  return requestJson("api.supabase.com", apiPath, { method, token, body });
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function emailButton(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#2563EB;color:#ffffff !important;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;font-size:14px;margin-top:16px;">${label}</a>`;
}

function heading(text) {
  return `<h1 style="font-size:22px;font-weight:800;margin:0 0 12px;color:#F8FAFC;">${text}</h1>`;
}

function para(html) {
  return `<p style="font-size:14px;line-height:1.65;color:#CBD5E1;margin:8px 0;">${html}</p>`;
}

function wrapCareerPilotEmail(innerHtml, preheader) {
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Career Pilot</title>
</head>
<body style="margin:0;padding:0;background:#0B1220;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
${pre}
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
            &copy; ${YEAR} ${LEGAL} &middot;
            <a href="${SITE_URL}" style="color:#38BDF8;text-decoration:none;">trycareerpilot.com</a><br/>
            <a href="mailto:${MAILBOX}" style="color:#64748B;text-decoration:none;">${MAILBOX}</a>
            &middot; <a href="${SITE_URL}/unsubscribe" style="color:#64748B;text-decoration:none;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function actionEmail({ title, body, href, cta, preheader, extra = "" }) {
  return wrapCareerPilotEmail(
    `${heading(title)}${para(body)}${emailButton(href, cta)}${para(`If the button does not work, copy and paste this link into your browser:<br/><span style="word-break:break-all;color:#38BDF8;">${href}</span>`)}${extra}`,
    preheader,
  );
}

function noticeEmail({ title, body, preheader }) {
  return wrapCareerPilotEmail(
    `${heading(title)}${para(body)}${emailButton(`${SITE_URL}/login`, "Open Career Pilot")}`,
    preheader,
  );
}

function otpEmail() {
  return wrapCareerPilotEmail(
    `${heading("Your verification code")}
${para("Use this code to confirm it is you. It expires shortly. Do not share it with anyone.")}
<div style="font-size:28px;letter-spacing:0.28em;font-weight:800;color:#F8FAFC;background:#0B1220;border-radius:12px;padding:16px 8px;text-align:center;font-family:ui-monospace,Consolas,monospace;margin:16px 0;">{{ .Token }}</div>
${para("If you did not request this, you can ignore this email.")}`,
    "Your Career Pilot verification code",
  );
}

function mergeAllowList(existing) {
  const parts = String(existing || "")
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set(parts);
  for (const url of EXTRA_REDIRECTS) set.add(url);
  return [...set].join(",");
}

function templates() {
  const confirmUrl = "{{ .ConfirmationURL }}";
  return {
    mailer_subjects_confirmation: "Confirm your Career Pilot email",
    mailer_templates_confirmation_content: actionEmail({
      title: "Confirm your email",
      body: "Welcome to Career Pilot. Confirm this address to finish setting up your account and start preparing with confidence.",
      href: confirmUrl,
      cta: "Confirm email",
      preheader: "Confirm your Career Pilot email address",
    }),
    mailer_subjects_recovery: "Reset your Career Pilot password",
    mailer_templates_recovery_content: actionEmail({
      title: "Reset your password",
      body: "We received a request to reset the password for this Career Pilot account. This link expires soon.",
      href: confirmUrl,
      cta: "Reset password",
      preheader: "Reset your Career Pilot password",
      extra: para("If you did not request a reset, you can ignore this email. Your password will stay the same."),
    }),
    mailer_subjects_magic_link: "Your Career Pilot sign-in link",
    mailer_templates_magic_link_content: actionEmail({
      title: "Sign in to Career Pilot",
      body: "Use this secure link to sign in. It works once and expires shortly. Do not forward it.",
      href: confirmUrl,
      cta: "Sign in",
      preheader: "Your Career Pilot magic link",
    }),
    mailer_subjects_invite: "You're invited to Career Pilot",
    mailer_templates_invite_content: actionEmail({
      title: "You have been invited",
      body: "Create your Career Pilot account with this invitation to start mock interviews, exams, and practice coaching.",
      href: confirmUrl,
      cta: "Accept invitation",
      preheader: "Join Career Pilot",
    }),
    mailer_subjects_email_change: "Confirm your new Career Pilot email",
    mailer_templates_email_change_content: actionEmail({
      title: "Confirm your new email",
      body: "Confirm this address to finish changing the email on your Career Pilot account.",
      href: confirmUrl,
      cta: "Confirm new email",
      preheader: "Confirm your new Career Pilot email",
    }),
    mailer_subjects_reauthentication: "Your Career Pilot verification code",
    mailer_templates_reauthentication_content: otpEmail(),
    mailer_notifications_password_changed_enabled: true,
    mailer_subjects_password_changed_notification: "Your Career Pilot password was changed",
    mailer_templates_password_changed_notification_content: noticeEmail({
      title: "Password changed",
      body: "The password on your Career Pilot account was just changed. If this was not you, reset your password immediately and contact hello@trycareerpilot.com.",
      preheader: "Your Career Pilot password was changed",
    }),
    mailer_notifications_email_changed_enabled: true,
    mailer_subjects_email_changed_notification: "Your Career Pilot email was changed",
    mailer_templates_email_changed_notification_content: noticeEmail({
      title: "Email address changed",
      body: "The email on your Career Pilot account was just changed. If this was not you, contact hello@trycareerpilot.com right away.",
      preheader: "Your Career Pilot email was changed",
    }),
    mailer_notifications_phone_changed_enabled: true,
    mailer_subjects_phone_changed_notification: "Your Career Pilot phone number was changed",
    mailer_templates_phone_changed_notification_content: noticeEmail({
      title: "Phone number changed",
      body: "The phone number on your Career Pilot account was just changed. If this was not you, contact hello@trycareerpilot.com.",
      preheader: "Your Career Pilot phone number was changed",
    }),
    mailer_notifications_identity_linked_enabled: true,
    mailer_subjects_identity_linked_notification: "A new sign-in method was added",
    mailer_templates_identity_linked_notification_content: noticeEmail({
      title: "New sign-in method added",
      body: "A new identity was linked to your Career Pilot account. If you did not add it, contact hello@trycareerpilot.com.",
      preheader: "A new Career Pilot sign-in method was added",
    }),
    mailer_notifications_identity_unlinked_enabled: true,
    mailer_subjects_identity_unlinked_notification: "A sign-in method was removed",
    mailer_templates_identity_unlinked_notification_content: noticeEmail({
      title: "Sign-in method removed",
      body: "An identity was unlinked from your Career Pilot account. If you did not remove it, contact hello@trycareerpilot.com.",
      preheader: "A Career Pilot sign-in method was removed",
    }),
    mailer_notifications_mfa_factor_enrolled_enabled: true,
    mailer_subjects_mfa_factor_enrolled_notification: "Multi-factor authentication enabled",
    mailer_templates_mfa_factor_enrolled_notification_content: noticeEmail({
      title: "MFA enabled",
      body: "Multi-factor authentication was added to your Career Pilot account. This helps keep your practice data private.",
      preheader: "MFA was enabled on Career Pilot",
    }),
    mailer_notifications_mfa_factor_unenrolled_enabled: true,
    mailer_subjects_mfa_factor_unenrolled_notification: "Multi-factor authentication removed",
    mailer_templates_mfa_factor_unenrolled_notification_content: noticeEmail({
      title: "MFA removed",
      body: "Multi-factor authentication was removed from your Career Pilot account. If this was not you, reset your password and contact hello@trycareerpilot.com.",
      preheader: "MFA was removed from Career Pilot",
    }),
  };
}

function summarizeTemplates(cfg) {
  const keys = Object.keys(cfg)
    .filter((k) => k.startsWith("mailer_templates_") && k.endsWith("_content"))
    .sort();
  return keys.map((key) => {
    const html = String(cfg[key] ?? "");
    return {
      key,
      chars: html.length,
      branded: html.includes("Career") && html.includes("#163B73"),
      confirm: html.includes("{{ .ConfirmationURL }}"),
      token: html.includes("{{ .Token }}"),
      site: html.includes("trycareerpilot.com"),
    };
  });
}

async function main() {
  const token = String(process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  if (!token.startsWith("sbp_")) {
    console.error("Set SUPABASE_ACCESS_TOKEN to a Supabase personal access token.");
    process.exit(1);
  }

  console.log(`Project ${PROJECT_REF}`);
  const authGet = await supabase("GET", `/v1/projects/${PROJECT_REF}/config/auth`, token);
  if (authGet.status !== 200) {
    console.error(`Auth config GET failed (${authGet.status}): ${authGet.data.slice(0, 400)}`);
    process.exit(1);
  }
  const before = parseJson(authGet.data) ?? {};
  console.log(`1) before site_url=${before.site_url || "(none)"}`);
  console.log(`   smtp_sender_name=${before.smtp_sender_name || "(none)"} smtp_user=${before.smtp_user || "(none)"}`);
  const beforeAllow = String(before.uri_allow_list || "");
  console.log(`   uri_allow_list entries=${beforeAllow ? beforeAllow.split(",").filter(Boolean).length : 0}`);

  const uriAllowList = mergeAllowList(before.uri_allow_list);
  const smtpPassword = String(process.env.HOSTINGER_SMTP_PASSWORD ?? "").trim();
  const payload = {
    site_url: SITE_URL,
    uri_allow_list: uriAllowList,
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_secure_email_change_enabled: true,
    smtp_admin_email: MAILBOX,
    smtp_sender_name: "Career Pilot",
    ...templates(),
  };
  if (smtpPassword) {
    Object.assign(payload, {
      smtp_host: "smtp.hostinger.com",
      smtp_port: "465",
      smtp_user: MAILBOX,
      smtp_pass: smtpPassword,
    });
  }

  console.log("2) PATCH Auth templates + site URL");
  const authPatch = await supabase("PATCH", `/v1/projects/${PROJECT_REF}/config/auth`, token, payload);
  if (authPatch.status < 200 || authPatch.status >= 300) {
    console.error(`Auth PATCH failed (${authPatch.status}): ${authPatch.data.slice(0, 600)}`);
    process.exit(1);
  }
  const after = parseJson(authPatch.data) ?? {};
  console.log(`   after site_url=${after.site_url || "(none)"}`);
  const afterAllow = String(after.uri_allow_list || uriAllowList);
  console.log(`   uri_allow_list includes trycareerpilot.com=${afterAllow.includes("trycareerpilot.com")}`);
  for (const row of summarizeTemplates(after.site_url ? after : { ...before, ...payload })) {
    console.log(
      `   ${row.key}: ${row.chars} chars branded=${row.branded} confirm=${row.confirm} token=${row.token} site=${row.site}`,
    );
  }

  const verify = await supabase("GET", `/v1/projects/${PROJECT_REF}/config/auth`, token);
  const live = parseJson(verify.data) ?? {};
  const liveRows = summarizeTemplates(live);
  const brandedCount = liveRows.filter((r) => r.branded && r.site).length;
  console.log(`3) verified branded templates=${brandedCount}/${liveRows.length} site_url=${live.site_url || "(none)"}`);
  if (String(live.site_url || "") !== SITE_URL) {
    console.error("site_url did not update to trycareerpilot.com");
    process.exit(1);
  }
  if (live.smtp_host !== "smtp.hostinger.com" || live.smtp_user !== MAILBOX) {
    console.warn(
      `   WARN Auth SMTP host/user not Hostinger (host=${live.smtp_host || "(none)"} user=${live.smtp_user || "(none)"}).`,
    );
    console.warn("   Set HOSTINGER_SMTP_PASSWORD and re-run, or configure SMTP in Supabase Dashboard.");
  } else {
    console.log(`   Auth SMTP OK (${live.smtp_host}:${live.smtp_port || "465"} as ${live.smtp_user})`);
  }
  const required = [
    "mailer_templates_confirmation_content",
    "mailer_templates_recovery_content",
    "mailer_templates_magic_link_content",
    "mailer_templates_invite_content",
    "mailer_templates_email_change_content",
    "mailer_templates_reauthentication_content",
  ];
  for (const key of required) {
    const html = String(live[key] ?? "");
    if (!html.includes("#163B73") || !html.includes("trycareerpilot.com")) {
      console.error(`Template ${key} is not Career Pilot branded.`);
      process.exit(1);
    }
    if (key !== "mailer_templates_reauthentication_content" && !html.includes("{{ .ConfirmationURL }}")) {
      console.error(`Template ${key} is missing ConfirmationURL.`);
      process.exit(1);
    }
    if (key === "mailer_templates_reauthentication_content" && !html.includes("{{ .Token }}")) {
      console.error("Reauthentication template is missing Token.");
      process.exit(1);
    }
  }

  console.log("4) Edge secrets APP_URL / PUBLIC_URL / SITE_URL");
  const secretsRes = await supabase("POST", `/v1/projects/${PROJECT_REF}/secrets`, token, [
    { name: "APP_URL", value: SITE_URL },
    { name: "PUBLIC_URL", value: SITE_URL },
    { name: "SITE_URL", value: SITE_URL },
    { name: "FROM_EMAIL", value: `Career Pilot <${MAILBOX}>` },
    { name: "RESEND_FROM_EMAIL", value: `Career Pilot <${MAILBOX}>` },
    { name: "SALES_EMAIL", value: MAILBOX },
    { name: "HOSTINGER_MAIL_ADDRESS", value: MAILBOX },
  ]);
  if (secretsRes.status < 200 || secretsRes.status >= 300) {
    console.error(`Secret sync failed (${secretsRes.status}): ${secretsRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  console.log("   OK secrets updated (values not printed)");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
