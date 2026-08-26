/**
 * Full stack check: Render public/signed health, Edge gov/coach, hybrid-health,
 * hybrid-ping, and lightweight AI smoke probes.
 *
 * Usage: node --use-system-ca scripts/full-stack-check.mjs
 *
 * Chaos / AI-down tests: set on Supabase Edge secrets (not from this script):
 *   HYBRID_FORCE_AI_UNAVAILABLE=1
 *   HYBRID_FORCE_PYTHON_UNAVAILABLE=1
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function load(p) {
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

function note(id, status, detail) {
  console.log(JSON.stringify({ id, status, detail }));
  return { id, status, detail };
}

const local = load(".env.local");
const qa = load(".env.qa.local");
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const base = (local.VITE_SCRAPER_URL || "").replace(/\/$/, "");
const secret = local.DOCUMENT_INTELLIGENCE_AUTH_SECRET || "";
const results = [];

if (!url || !anon || !qa.QA_PRO_EMAIL) {
  console.error("Missing VITE_SUPABASE_* or .env.qa.local credentials");
  process.exit(1);
}

// Render public
if (base) {
  {
    const r = await fetch(`${base}/health`);
    const t = await r.text();
    results.push(
      note(
        "RENDER-PUBLIC-HEALTH",
        r.status === 200 ? "FIXED" : "NOT_FIXED",
        `http=${r.status} ${t.slice(0, 80)}`,
      ),
    );
  }

  // Render signed
  if (secret) {
    const method = "GET";
    const path = "/internal/gov-exams/health";
    const ts = String(Math.floor(Date.now() / 1000));
    const rid = `full-${crypto.randomBytes(4).toString("hex")}`;
    const digest = crypto.createHash("sha256").update("").digest("hex");
    const msg = [method, path, ts, rid, digest].join("\n");
    const sig = crypto.createHmac("sha256", secret).update(msg).digest("hex");
    const r = await fetch(`${base}${path}`, {
      method,
      headers: {
        "X-Internal-Timestamp": ts,
        "X-Request-ID": rid,
        "X-Internal-Signature": `sha256=${sig}`,
      },
    });
    const t = await r.text();
    results.push(
      note(
        "RENDER-SIGNED-HEALTH",
        r.status === 200 ? "FIXED" : "NOT_FIXED",
        `http=${r.status} ${t.slice(0, 140)}`,
      ),
    );
  } else {
    results.push(
      note(
        "RENDER-SIGNED-HEALTH",
        "PARTIALLY_FIXED",
        "DOCUMENT_INTELLIGENCE_AUTH_SECRET missing — skipped signed probe",
      ),
    );
  }
} else {
  results.push(
    note(
      "RENDER-PUBLIC-HEALTH",
      "PARTIALLY_FIXED",
      "VITE_SCRAPER_URL missing — skipped Render probes",
    ),
  );
}

const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: pro } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
const proTok = pro.session?.access_token;
const headers = {
  Authorization: `Bearer ${proTok}`,
  apikey: anon,
  "Content-Type": "application/json",
};

{
  const r = await fetch(`${url}/functions/v1/search-exams?q=SSC%20CGL`, {
    headers,
  });
  const b = await r.json();
  results.push(
    note(
      "GOV-SEARCH",
      r.status === 200 && (b.results?.length || 0) > 0 ? "FIXED" : "NOT_FIXED",
      `http=${r.status} n=${b.results?.length || 0}`,
    ),
  );
  const exam = b.results?.[0];
  if (exam) {
    const av = await fetch(
      `${url}/functions/v1/check-exam-paper-availability`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          examId: exam.examId,
          stageId: exam.stages?.[0]?.id,
          mode: "custom_mock",
          questionCount: 10,
          language: "en",
        }),
      },
    );
    const ab = await av.json();
    results.push(
      note(
        "GOV-AVAIL",
        av.status === 200 && ab.blocked !== true ? "FIXED" : "NOT_FIXED",
        `http=${av.status} available=${ab.available} blocked=${ab.blocked}`,
      ),
    );
  }
}

{
  const r = await fetch(`${url}/functions/v1/ai-coach-chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: "Say hi in one short sentence.",
      mode: "practice",
    }),
  });
  const t = await r.text();
  results.push(
    note(
      "AI-COACH",
      r.status < 500 && !/PAYMENT_REQUIRED/i.test(t) ? "FIXED" : "NOT_FIXED",
      `http=${r.status} body=${t.slice(0, 140)}`,
    ),
  );
}

{
  const r = await fetch(`${url}/functions/v1/hybrid-ping`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const t = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(t);
  } catch {
    parsed = null;
  }
  const ok =
    r.status === 200 &&
    (parsed?.success === true || parsed?.data !== undefined || /pong/i.test(t));
  results.push(
    note(
      "HYBRID-PING",
      ok ? "FIXED" : r.status === 503 ? "NOT_FIXED" : "PARTIALLY_FIXED",
      `http=${r.status} source=${parsed?.source ?? "?"} body=${t.slice(0, 120)}`,
    ),
  );
}

{
  const r = await fetch(`${url}/functions/v1/generate-questions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      interviewType: "behavioral",
      questionCount: 1,
      role: "Engineer",
      free_session: true,
      allow_fallback: true,
    }),
  });
  const t = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(t);
  } catch {
    parsed = null;
  }
  const hasQuestions =
    Array.isArray(parsed?.data?.questions) ||
    Array.isArray(parsed?.questions) ||
    (parsed?.data && Array.isArray(parsed.data));
  results.push(
    note(
      "GENERATE-QUESTIONS",
      r.status === 200 && hasQuestions
        ? "FIXED"
        : r.status === 402
          ? "PARTIALLY_FIXED"
          : "NOT_FIXED",
      `http=${r.status} source=${parsed?.source ?? "?"} body=${t.slice(0, 120)}`,
    ),
  );
}

await client.auth.signOut();
const { data: admin } = await client.auth.signInWithPassword({
  email: qa.QA_ADMIN_EMAIL,
  password: qa.QA_ADMIN_PASSWORD,
});
const adminTok = admin.session?.access_token;
{
  const r = await fetch(`${url}/functions/v1/hybrid-health`, {
    headers: { Authorization: `Bearer ${adminTok}`, apikey: anon },
  });
  const b = await r.json();
  const ops = b?.supported_operations?.length ?? 0;
  const wrappers = b?.edge_operation_wrappers
    ? Object.keys(b.edge_operation_wrappers).length
    : 0;
  const chaosAi = b?.chaos?.force_ai_unavailable === true;
  const chaosPy = b?.chaos?.force_python_unavailable === true;
  const aiKeys = [
    b?.ai?.gemini?.configured,
    b?.ai?.openai?.configured,
    b?.ai?.anthropic?.configured,
  ].filter(Boolean).length;

  results.push(
    note(
      "HYBRID-HEALTH",
      b?.python?.hmac_ok === true
        ? "FIXED"
        : b?.python?.status === "hmac_mismatch"
          ? "NOT_FIXED"
          : "PARTIALLY_FIXED",
      `hmac_ok=${b?.python?.hmac_ok} up=${b?.python?.up} down=${b?.python?.down} status=${b?.python?.status} ops=${ops} wrappers=${wrappers} ai_keys=${aiKeys} chaos_ai=${chaosAi} chaos_py=${chaosPy}`,
    ),
  );

  if (chaosAi || chaosPy) {
    results.push(
      note(
        "HYBRID-CHAOS-FLAGS",
        "PARTIALLY_FIXED",
        `Edge chaos active: force_ai=${chaosAi} force_python=${chaosPy} — unset on Supabase Edge secrets for baseline release checks`,
      ),
    );
  } else {
    results.push(
      note(
        "HYBRID-CHAOS-FLAGS",
        "FIXED",
        "No HYBRID_FORCE_* flags active (set HYBRID_FORCE_AI_UNAVAILABLE / HYBRID_FORCE_PYTHON_UNAVAILABLE on Edge for AI-down chaos tests)",
      ),
    );
  }
}

const blocked = results.filter((r) => r.status === "NOT_FIXED");
console.log(
  JSON.stringify(
    {
      summary: results.map((r) => `${r.id}:${r.status}`),
      blocked: blocked.map((r) => r.id),
      release: blocked.length ? "RELEASE_BLOCKED" : "RELEASE_READY",
      chaos_note:
        "AI-down chaos tests require HYBRID_FORCE_AI_UNAVAILABLE=1 and/or HYBRID_FORCE_PYTHON_UNAVAILABLE=1 on Supabase Edge secrets — this script cannot set them.",
    },
    null,
    2,
  ),
);
process.exit(blocked.length ? 2 : 0);
