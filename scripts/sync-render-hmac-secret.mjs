/**
 * Sync DOCUMENT_INTELLIGENCE_AUTH_SECRET from .env.local → Render service env,
 * then trigger a deploy and probe HMAC until 200.
 *
 * Requires RENDER_API_KEY in env or .env.local
 * Usage: node --use-system-ca scripts/sync-render-hmac-secret.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE_ID = process.env.RENDER_SERVICE_ID || "srv-da58j1qjobas73dtjbk0";

function load(file) {
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

const local = load(".env.local");
const apiKey = process.env.RENDER_API_KEY || local.RENDER_API_KEY || "";
const secret =
  process.env.DOCUMENT_INTELLIGENCE_AUTH_SECRET ||
  local.DOCUMENT_INTELLIGENCE_AUTH_SECRET ||
  "";
const base = (local.VITE_SCRAPER_URL || "").replace(/\/$/, "");

if (!apiKey) {
  console.error(
    "RENDER_API_KEY missing. Create one at https://dashboard.render.com/u/settings#api-keys and add to .env.local",
  );
  process.exit(1);
}
if (!secret || secret.length < 32) {
  console.error("DOCUMENT_INTELLIGENCE_AUTH_SECRET missing/too short in .env.local");
  process.exit(1);
}

console.log(
  JSON.stringify({
    serviceId: SERVICE_ID,
    secretLen: secret.length,
    secretPrefix: secret.slice(0, 4),
    scraperHost: base ? new URL(base).host : null,
  }),
);

const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

// PUT single env var (safe — does not wipe other vars)
const putUrl = `https://api.render.com/v1/services/${SERVICE_ID}/env-vars/DOCUMENT_INTELLIGENCE_AUTH_SECRET`;
const put = await fetch(putUrl, {
  method: "PUT",
  headers,
  body: JSON.stringify({ value: secret }),
});
const putText = await put.text();
console.log("render_env_put", put.status, putText.slice(0, 200));
if (!put.ok) process.exit(2);

// Also set PYTHON_SERVICE_AUTH_SECRET alias if used anywhere
const put2 = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/env-vars/PYTHON_SERVICE_AUTH_SECRET`,
  {
    method: "PUT",
    headers,
    body: JSON.stringify({ value: secret }),
  },
);
console.log("render_env_put_alias", put2.status, (await put2.text()).slice(0, 120));

// Trigger deploy so env takes effect
const dep = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys`, {
  method: "POST",
  headers,
  body: JSON.stringify({ clearCache: "do_not_clear" }),
});
const depText = await dep.text();
console.log("render_deploy", dep.status, depText.slice(0, 240));
if (!dep.ok) process.exit(3);

let deployId = null;
try {
  deployId = JSON.parse(depText)?.id || JSON.parse(depText)?.deploy?.id;
} catch {
  /* ignore */
}

async function probe() {
  if (!base) return { status: 0, text: "no base url" };
  const method = "GET";
  const pathName = "/internal/gov-exams/health";
  const ts = String(Math.floor(Date.now() / 1000));
  const rid = `sync-${crypto.randomBytes(6).toString("hex")}`;
  const digest = crypto.createHash("sha256").update("").digest("hex");
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
  return { status: r.status, text: (await r.text()).slice(0, 180) };
}

// Poll deploy + probe for up to ~6 minutes
for (let i = 0; i < 36; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  if (deployId) {
    const st = await fetch(
      `https://api.render.com/v1/services/${SERVICE_ID}/deploys/${deployId}`,
      { headers },
    );
    const body = await st.text();
    let status = "?";
    try {
      status = JSON.parse(body)?.status || JSON.parse(body)?.deploy?.status || "?";
    } catch {
      /* ignore */
    }
    console.log(`deploy_poll ${i + 1}`, status);
    if (status === "live" || status === "update_live") break;
    if (["build_failed", "update_failed", "canceled", "deactivated"].includes(status)) {
      console.error("deploy failed", status);
      process.exit(4);
    }
  } else {
    console.log(`wait ${i + 1}`);
  }
}

const final = await probe();
console.log("render_hmac_probe", final.status, final.text);
process.exit(final.status === 200 ? 0 : 5);
