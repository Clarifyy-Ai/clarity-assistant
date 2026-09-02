#!/usr/bin/env node
/**
 * Verify Hostinger SMTP for Auth (hello@trycareerpilot.com).
 * Never prints passwords. Env:
 *   SUPABASE_ACCESS_TOKEN
 *   HOSTINGER_SMTP_PASSWORD
 */

import https from "https";
import tls from "tls";

const PROJECT_REF = "qzgvjrvtkwlzxpmlddkx";
const MAIL_ADDRESS = "hello@trycareerpilot.com";
const SMTP_HOST = "smtp.hostinger.com";
const SMTP_PORT = 465;

function supabaseGet(token, apiPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: apiPath,
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, data }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function readLine(buf) {
  const idx = buf.indexOf("\r\n");
  if (idx < 0) return null;
  return { line: buf.slice(0, idx), rest: buf.slice(idx + 2) };
}

function smtpAuth(user, pass) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: SMTP_HOST,
        port: SMTP_PORT,
        servername: SMTP_HOST,
        timeout: 20_000,
        rejectUnauthorized: process.env.SMTP_TLS_INSECURE === "1" ? false : true,
      },
      () => {
        /* wait for greeting */
      },
    );
    let buf = "";
    let step = "greet";
    const send = (line) => socket.write(`${line}\r\n`);

    socket.setEncoding("utf8");
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("SMTP timed out"));
    });
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      buf += chunk;
      while (true) {
        const parsed = readLine(buf);
        if (!parsed) break;
        buf = parsed.rest;
        const code = parsed.line.slice(0, 3);
        if (step === "greet") {
          if (code !== "220") {
            socket.end();
            return reject(new Error(`SMTP greeting failed: ${code}`));
          }
          step = "ehlo";
          send("EHLO careerpilot.verify");
          continue;
        }
        if (step === "ehlo") {
          if (parsed.line.startsWith("250-")) continue;
          if (code !== "250") {
            socket.end();
            return reject(new Error(`EHLO failed: ${code}`));
          }
          step = "auth";
          const plain = Buffer.from(`\u0000${user}\u0000${pass}`, "utf8").toString("base64");
          send(`AUTH PLAIN ${plain}`);
          continue;
        }
        if (step === "auth") {
          socket.end();
          if (code === "235") return resolve({ ok: true, code });
          return reject(new Error(`AUTH failed: ${code}`));
        }
      }
    });
  });
}

async function main() {
  const supabaseToken = String(process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  const smtpPassword = String(process.env.HOSTINGER_SMTP_PASSWORD ?? "").trim();

  if (!supabaseToken.startsWith("sbp_")) {
    console.error("Set SUPABASE_ACCESS_TOKEN");
    process.exit(1);
  }
  if (!smtpPassword) {
    console.error("Set HOSTINGER_SMTP_PASSWORD");
    process.exit(1);
  }

  console.log("1) Supabase Auth SMTP config");
  const res = await supabaseGet(supabaseToken, `/v1/projects/${PROJECT_REF}/config/auth`);
  if (res.status !== 200) {
    console.error(`Auth GET failed (${res.status}): ${res.data.slice(0, 300)}`);
    process.exit(1);
  }
  const cfg = JSON.parse(res.data);
  const passSet =
    typeof cfg.smtp_pass === "string" ? cfg.smtp_pass.length > 0 : Boolean(cfg.smtp_pass);
  console.log(`   smtp_host=${cfg.smtp_host || "(none)"}`);
  console.log(`   smtp_port=${cfg.smtp_port || "(none)"}`);
  console.log(`   smtp_user=${cfg.smtp_user || "(none)"}`);
  console.log(`   smtp_admin_email=${cfg.smtp_admin_email || "(none)"}`);
  console.log(`   smtp_sender_name=${cfg.smtp_sender_name || "(none)"}`);
  console.log(`   smtp_pass_set=${passSet ? "yes" : "hidden-or-empty"}`);
  console.log(`   external_email_enabled=${cfg.external_email_enabled === true}`);
  console.log(`   mailer_autoconfirm=${cfg.mailer_autoconfirm === true}`);

  const hostOk = cfg.smtp_host === SMTP_HOST;
  const userOk = cfg.smtp_user === MAIL_ADDRESS;
  const portOk = String(cfg.smtp_port) === String(SMTP_PORT);
  if (!hostOk || !userOk || !portOk) {
    console.error("   FAIL: Auth SMTP host/user/port do not match Hostinger.");
    process.exit(1);
  }
  console.log("   PASS config matches Hostinger hello@ mailbox");

  console.log("2) SMTP AUTH to smtp.hostinger.com:465");
  try {
    const auth = await smtpAuth(MAIL_ADDRESS, smtpPassword);
    console.log(`   PASS AUTH ${auth.code} (credentials accepted; no message sent)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unable to verify the first certificate") && process.env.SMTP_TLS_INSECURE !== "1") {
      console.log("   local TLS trust failed; retrying AUTH with SMTP_TLS_INSECURE=1 (login check only)");
      process.env.SMTP_TLS_INSECURE = "1";
      const auth = await smtpAuth(MAIL_ADDRESS, smtpPassword);
      console.log(`   PASS AUTH ${auth.code} (credentials accepted; local CA chain untrusted)`);
    } else {
      throw err;
    }
  }
  console.log("SMTP verify OK");
}

main().catch((err) => {
  console.error("SMTP verify failed:", err?.message || err);
  process.exit(1);
});
