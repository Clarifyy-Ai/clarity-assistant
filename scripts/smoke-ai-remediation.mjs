#!/usr/bin/env node
/**
 * Post-remediation smoke: Gemini hint, hybrid-health, Render ready.
 */
import fs from "node:fs";
import crypto from "node:crypto";

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = val;
  }
  return out;
}

const env = { ...loadEnv(".env.local"), ...loadEnv(".env.qa.local") };
const base = (env.VITE_SUPABASE_URL || env.QA_SUPABASE_URL || "").replace(
  /\/$/,
  "",
);
const anon =
  env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const proEmail = env.QA_PRO_EMAIL || "qa.pro@clarify.ai.test";
const proPassword = env.QA_PRO_PASSWORD;
const adminEmail = env.QA_ADMIN_EMAIL || "qa.admin@clarify.ai.test";
const adminPassword = env.QA_ADMIN_PASSWORD || proPassword;
const renderBase = (
  env.PYTHON_SERVICE_URL ||
  env.VITE_SCRAPER_URL ||
  ""
).replace(/\/$/, "");
const hmacSecret = env.DOCUMENT_INTELLIGENCE_AUTH_SECRET || "";

const results = [];

async function auth(email, password) {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!body.access_token) {
    return { ok: false, step: "auth", email, status: res.status, body };
  }
  return {
    ok: true,
    token: body.access_token,
    headers: {
      Authorization: `Bearer ${body.access_token}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
  };
}

async function edge(name, headers, body, method = "POST") {
  const t0 = Date.now();
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return {
    name,
    check: name,
    status: res.status,
    ms: Date.now() - t0,
    body: text.slice(0, 500),
    fullBody: text,
    ok: res.ok,
  };
}

// 1) Pro user: start-session + generate-hint
const pro = await auth(proEmail, proPassword);
if (!pro.ok) {
  results.push({ check: "pro_auth", ...pro });
} else {
  const session = await edge("start-session", pro.headers, {
    session_type: "rehearsal",
    type: "rehearsal",
    is_practice: true,
    interview_type: "behavioral",
    duration_minutes: 15,
  });
  results.push({ check: "start-session", ...session });

  let sessionId = null;
  try {
    sessionId = JSON.parse(session.fullBody).session_id;
  } catch {
    /* ignore */
  }

  if (sessionId) {
    const hint = await edge("generate-hint", pro.headers, {
      session_id: sessionId,
      question: "Tell me about a challenge you faced at work.",
      mode: "rehearsal",
      session_type: "rehearsal",
      is_practice: true,
    });
    results.push({ check: "generate-hint", ...hint });
  }
}

// 2) Admin hybrid-health
const admin = await auth(adminEmail, adminPassword);
if (admin.ok) {
  const health = await edge(
    "hybrid-health",
    admin.headers,
    null,
    "GET",
  );
  results.push({ check: "hybrid-health", ...health });
  const keys = await edge("ai-key-check", admin.headers, {});
  results.push({ check: "ai-key-check", ...keys });
}

// 3) Render /ready
if (renderBase) {
  const ready = await fetch(`${renderBase}/ready`);
  const text = await ready.text();
  results.push({
    check: "render-ready",
    status: ready.status,
    ok: ready.ok,
    body: text.slice(0, 300),
  });
}

// 4) HMAC gov-exams health
if (renderBase && hmacSecret.length >= 32) {
  const method = "GET";
  const pathName = "/internal/gov-exams/health";
  const ts = String(Math.floor(Date.now() / 1000));
  const rid = `smoke-${crypto.randomBytes(6).toString("hex")}`;
  const digest = crypto.createHash("sha256").update("").digest("hex");
  const msg = [method, pathName, ts, rid, digest].join("\n");
  const sig = crypto.createHmac("sha256", hmacSecret).update(msg).digest("hex");
  const r = await fetch(`${renderBase}${pathName}`, {
    method,
    headers: {
      "X-Internal-Timestamp": ts,
      "X-Request-ID": rid,
      "X-Internal-Signature": `sha256=${sig}`,
    },
  });
  results.push({
    check: "render-hmac",
    status: r.status,
    ok: r.ok,
    body: (await r.text()).slice(0, 200),
  });
}

// 5) Live frontend bundle probe
try {
  const live = await fetch("https://trycareerpilot.com/");
  const html = await live.text();
  const assets = [...html.matchAll(/assets\/[A-Za-z0-9_.-]+\.js/g)].map((m) => m[0]);
  let hasSupabaseRef = false;
  let hasScraperUrl = false;
  for (const asset of assets.slice(0, 8)) {
    const js = await fetch(`https://trycareerpilot.com/${asset}`);
    const jsText = await js.text();
    if (jsText.includes("qzgvjrvtkwlzxpmlddkx")) hasSupabaseRef = true;
    if (jsText.includes("clarity-assistant-az05.onrender.com")) hasScraperUrl = true;
    if (hasSupabaseRef && hasScraperUrl) break;
  }
  results.push({
    check: "live-frontend-bundle",
    status: live.status,
    ok: live.ok && hasSupabaseRef,
    hasSupabaseRef,
    hasScraperUrl,
    assetsChecked: assets.slice(0, 8).length,
  });
} catch (err) {
  results.push({
    check: "live-frontend-bundle",
    ok: false,
    error: String(err).slice(0, 200),
  });
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ results, failed: failed.length }, null, 2));
process.exit(failed.length ? 1 : 0);
