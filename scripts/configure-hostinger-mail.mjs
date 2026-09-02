#!/usr/bin/env node
/**
 * Configure Hostinger Mail on the live Supabase project:
 *   - Edge secrets (HOSTINGER_MAIL_API_TOKEN, address, From)
 *   - Auth custom SMTP (hello@trycareerpilot.com)
 *   - Tracking folders on the mailbox (OTPs, Verifications, …)
 *
 * Never prints secret values. Pass tokens via env:
 *   SUPABASE_ACCESS_TOKEN
 *   HOSTINGER_MAIL_API_TOKEN
 *   HOSTINGER_SMTP_PASSWORD   (optional mailbox password for Auth SMTP)
 */

import https from "https";

const PROJECT_REF = "qzgvjrvtkwlzxpmlddkx";
const MAIL_ADDRESS = "hello@trycareerpilot.com";
const FROM_EMAIL = "Career Pilot <hello@trycareerpilot.com>";

const TRACKING_FOLDERS = [
  "OTPs",
  "Verifications",
  "PasswordResets",
  "MagicLinks",
  "Notifications",
  "InterviewReminders",
  "Welcome",
  "Support",
  "Billing",
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

async function main() {
  const supabaseToken = String(process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  const hostingerToken = String(process.env.HOSTINGER_MAIL_API_TOKEN ?? "").trim();
  const smtpPassword = String(process.env.HOSTINGER_SMTP_PASSWORD ?? "").trim();

  if (!supabaseToken.startsWith("sbp_")) {
    console.error("Set SUPABASE_ACCESS_TOKEN to a Supabase personal access token.");
    process.exit(1);
  }
  if (!hostingerToken) {
    console.error("Set HOSTINGER_MAIL_API_TOKEN.");
    process.exit(1);
  }

  console.log(`Project ${PROJECT_REF}`);
  console.log("1) Edge secrets (names only)");
  const secretPayload = [
    { name: "HOSTINGER_MAIL_API_TOKEN", value: hostingerToken },
    { name: "HOSTINGER_MAIL_ADDRESS", value: MAIL_ADDRESS },
    { name: "FROM_EMAIL", value: FROM_EMAIL },
    { name: "RESEND_FROM_EMAIL", value: FROM_EMAIL },
    { name: "SALES_EMAIL", value: MAIL_ADDRESS },
  ];
  if (smtpPassword) {
    secretPayload.push({ name: "HOSTINGER_SMTP_PASSWORD", value: smtpPassword });
  }
  const secretsRes = await supabase("POST", `/v1/projects/${PROJECT_REF}/secrets`, supabaseToken, secretPayload);
  if (secretsRes.status < 200 || secretsRes.status >= 300) {
    console.error(`Secret sync failed (${secretsRes.status}): ${secretsRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  console.log(
    `   OK secrets (${secretsRes.status}): ${secretPayload.map((s) => s.name).join(", ")}`,
  );

  if (!smtpPassword) {
    console.error("Set HOSTINGER_SMTP_PASSWORD to the mailbox password for Auth SMTP.");
    process.exit(1);
  }

  console.log("2) Auth SMTP");
  const authGet = await supabase("GET", `/v1/projects/${PROJECT_REF}/config/auth`, supabaseToken);
  if (authGet.status !== 200) {
    console.error(`Auth config GET failed (${authGet.status}): ${authGet.data.slice(0, 300)}`);
    process.exit(1);
  }
  const before = parseJson(authGet.data) ?? {};
  console.log(
    `   before smtp_host=${before.smtp_host || "(none)"} smtp_user=${before.smtp_user || "(none)"} smtp_port=${before.smtp_port || "(none)"}`,
  );

  const smtpPass = smtpPassword;
  const authPatch = await supabase("PATCH", `/v1/projects/${PROJECT_REF}/config/auth`, supabaseToken, {
    external_email_enabled: true,
    mailer_secure_email_change_enabled: true,
    mailer_autoconfirm: false,
    smtp_admin_email: MAIL_ADDRESS,
    smtp_host: "smtp.hostinger.com",
    smtp_port: "465",
    smtp_user: MAIL_ADDRESS,
    smtp_pass: smtpPass,
    smtp_sender_name: "Career Pilot",
  });
  if (authPatch.status < 200 || authPatch.status >= 300) {
    console.error(`Auth SMTP PATCH failed (${authPatch.status}): ${authPatch.data.slice(0, 400)}`);
    process.exit(1);
  }
  const after = parseJson(authPatch.data) ?? {};
  console.log(
    `   after smtp_host=${after.smtp_host || "(none)"} smtp_user=${after.smtp_user || "(none)"} smtp_port=${after.smtp_port || "(none)"} smtp_sender_name=${after.smtp_sender_name || "(none)"}`,
  );
  console.log("   Auth SMTP password: mailbox password (not the Mail API token)");

  console.log("3) Hostinger tracking folders");
  const meRes = await requestJson("api.mail.hostinger.com", "/api/v1/me", {
    method: "GET",
    token: hostingerToken,
  });
  if (meRes.status !== 200) {
    console.error(`Hostinger /me failed (${meRes.status}): ${meRes.data.slice(0, 300)}`);
    process.exit(1);
  }
  const me = parseJson(meRes.data);
  const mailboxes = me?.data?.mailboxes ?? [];
  const mailbox =
    mailboxes.find((m) => String(m.address ?? "").toLowerCase() === MAIL_ADDRESS) ?? mailboxes[0];
  if (!mailbox?.resourceId) {
    console.error("No mailbox on this Hostinger token.");
    process.exit(1);
  }
  console.log(`   mailbox ${mailbox.address}`);

  const listed = [];
  for (let page = 1; page <= 10; page += 1) {
    const listRes = await requestJson(
      "api.mail.hostinger.com",
      `/api/v1/mailboxes/${mailbox.resourceId}/folders?page=${page}&perPage=100`,
      { method: "GET", token: hostingerToken },
    );
    if (listRes.status !== 200) {
      console.error(`Folder list failed (${listRes.status}): ${listRes.data.slice(0, 300)}`);
      process.exit(1);
    }
    const body = parseJson(listRes.data);
    const rows = Array.isArray(body?.data) ? body.data : [];
    listed.push(...rows);
    if (page >= (body?.pagination?.totalPages ?? 1) || rows.length === 0) break;
  }

  const existingNames = new Set(
    listed.flatMap((f) => [String(f.name ?? ""), String(f.path ?? "").split(".").pop() ?? ""]).map((n) => n.toLowerCase()),
  );
  const created = [];
  const skipped = [];
  for (const name of TRACKING_FOLDERS) {
    if (existingNames.has(name.toLowerCase())) {
      skipped.push(name);
      continue;
    }
    const createRes = await requestJson(
      "api.mail.hostinger.com",
      `/api/v1/mailboxes/${mailbox.resourceId}/folders`,
      { method: "POST", token: hostingerToken, body: { name } },
    );
    if (createRes.status === 201 || (createRes.status >= 200 && createRes.status < 300)) {
      created.push(name);
      existingNames.add(name.toLowerCase());
    } else if (createRes.status === 409 || createRes.status === 422) {
      skipped.push(name);
    } else {
      console.error(`Create ${name} failed (${createRes.status}): ${createRes.data.slice(0, 200)}`);
    }
  }
  console.log(`   created: ${created.join(", ") || "(none)"}`);
  console.log(`   already present: ${skipped.join(", ") || "(none)"}`);
  console.log("Done. Rotate the pasted Supabase and Hostinger tokens after this run.");
}

main().catch((err) => {
  console.error("configure-hostinger-mail failed:", err?.message || err);
  process.exit(1);
});
