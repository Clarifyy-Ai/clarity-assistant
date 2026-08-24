/**
 * Set DOCUMENT_INTELLIGENCE_AUTH_SECRET on Edge and verify HMAC against Render.
 * Usage: node --use-system-ca scripts/set-python-hmac-secret.mjs [--secret=...] [--skip-render-check]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = "qzgvjrvtkwlzxpmlddkx";

function loadEnv(file) {
  const p = path.join(ROOT, file);
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

function upsertLocalEnv(file, key, value) {
  const p = path.join(ROOT, file);
  let text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) text = text.replace(re, `${key}=${value}`);
  else text = `${text.trimEnd()}\n${key}=${value}\n`;
  fs.writeFileSync(p, text, "utf8");
}

const local = loadEnv(".env.local");
const token =
  process.env.SUPABASE_ACCESS_TOKEN || local.SUPABASE_ACCESS_TOKEN || "";
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN required");
  process.exit(1);
}

const argSecret = process.argv.find((a) => a.startsWith("--secret="))?.slice(9);
const secret =
  argSecret ||
  local.DOCUMENT_INTELLIGENCE_AUTH_SECRET ||
  crypto.randomBytes(32).toString("hex");

if (secret.length < 32) {
  console.error("Secret must be at least 32 characters");
  process.exit(1);
}

const base = (
  local.VITE_SCRAPER_URL ||
  local.PYTHON_SERVICE_URL ||
  local.SCRAPER_URL ||
  ""
).replace(/\/$/, "");

console.log(JSON.stringify({
  secretLen: secret.length,
  secretPrefix: secret.slice(0, 4),
  scraperHost: base ? new URL(base).host : null,
}));

// 1) Set Edge secret
const put = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify([
    { name: "DOCUMENT_INTELLIGENCE_AUTH_SECRET", value: secret },
    { name: "PYTHON_SERVICE_AUTH_SECRET", value: secret },
  ]),
});
console.log("edge_secrets_set", put.status, (await put.text()).slice(0, 200));
if (!put.ok && put.status !== 201 && put.status !== 200) process.exit(1);

upsertLocalEnv(".env.local", "DOCUMENT_INTELLIGENCE_AUTH_SECRET", secret);
upsertLocalEnv(".env.local", "PYTHON_SERVICE_AUTH_SECRET", secret);

// 2) Probe Render with this secret
if (base && !process.argv.includes("--skip-render-check")) {
  const method = "GET";
  const pathName = "/internal/gov-exams/health";
  const body = "";
  const ts = String(Math.floor(Date.now() / 1000));
  const rid = `edge-sync-${crypto.randomBytes(8).toString("hex")}`;
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  const msg = [method, pathName, ts, rid, digest].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  const r = await fetch(`${base}${pathName}`, {
    method,
    headers: {
      "X-Internal-Timestamp": ts,
      "X-Request-ID": rid,
      "X-Internal-Signature": `sha256=${sig}`,
    },
  });
  const text = await r.text();
  console.log("render_hmac_probe", r.status, text.slice(0, 240));
  if (r.status === 401 || r.status === 403) {
    console.log(
      "RENDER_SECRET_MISMATCH: Update Render env DOCUMENT_INTELLIGENCE_AUTH_SECRET to the same value as Edge (copied into .env.local). Do not commit .env.local.",
    );
    process.exit(3);
  }
}

console.log("ok");
