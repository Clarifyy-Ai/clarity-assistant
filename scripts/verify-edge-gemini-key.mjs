#!/usr/bin/env node
/**
 * Verify GEMINI_API_KEY: local format + live Google probe + Edge ai-key-check.
 * Usage: node --use-system-ca scripts/verify-edge-gemini-key.mjs
 */
import fs from "node:fs";

const REF = "qzgvjrvtkwlzxpmlddkx";

function loadEnv(file) {
  const o = {};
  if (!fs.existsSync(file)) return o;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    o[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return o;
}

function geminiKeyLooksValid(value) {
  const v = String(value ?? "").trim();
  if (!v || v.length < 20) return false;
  return (
    /^AIza[0-9A-Za-z_-]{20,}$/.test(v) ||
    /^AQ\.[A-Za-z0-9_-]{20,}$/.test(v)
  );
}

async function probeGoogle(key) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 8 },
      }),
    },
  );
  return { ok: res.ok, status: res.status, hint: (await res.text()).slice(0, 120) };
}

const env = { ...loadEnv(".env.local"), ...loadEnv(".env.qa.local") };
const localKey = env.GEMINI_API_KEY ?? "";
const localFormat = geminiKeyLooksValid(localKey);
let localProbe = { ok: false, status: 0, hint: "skipped" };
if (localFormat) {
  localProbe = await probeGoogle(localKey);
}

let edge = { gemini: false, format_valid: false, api_ok: false };
const base = (env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const anon = env.VITE_SUPABASE_ANON_KEY ?? "";
const adminEmail = env.QA_ADMIN_EMAIL ?? "qa.admin@clarify.ai.test";
const adminPassword = env.QA_ADMIN_PASSWORD ?? env.QA_PRO_PASSWORD ?? "";

if (base && anon && adminPassword) {
  try {
    const authRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const auth = await authRes.json();
    if (auth.access_token) {
      const check = await fetch(`${base}/functions/v1/ai-key-check`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.access_token}`,
          apikey: anon,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const body = await check.json();
      edge = {
        gemini: Boolean(body.providers?.gemini),
        format_valid: Boolean(body.providers?.gemini_format_valid),
        api_ok: Boolean(body.providers?.gemini_api_ok),
      };
    }
  } catch {
    /* edge probe optional */
  }
}

const ok = localFormat && localProbe.ok && edge.api_ok;
console.log(
  JSON.stringify(
    {
      local_format_valid: localFormat,
      local_google_probe_ok: localProbe.ok,
      local_google_status: localProbe.status,
      edge_gemini: edge.gemini,
      edge_gemini_format_valid: edge.format_valid,
      edge_gemini_api_ok: edge.api_ok,
      action: ok
        ? "ok"
        : "Run npm run qa:sync-secrets and redeploy Render after updating .env.local",
    },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
