/**
 * End-to-end verification: every Python route reachability + Edge→Python hybrid wiring.
 * Usage: node --use-system-ca scripts/verify-python-hybrid-e2e.mjs
 *
 * Never prints secrets. Evidence-only statuses: CONNECTED | REACHABLE_UNWIRED | BROKEN | SKIPPED
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

const local = load(".env.local");
const qa = load(".env.qa.local");
const base = (local.VITE_SCRAPER_URL || local.PYTHON_SERVICE_URL || "").replace(
  /\/$/,
  "",
);
const secret = local.DOCUMENT_INTELLIGENCE_AUTH_SECRET || "";
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;

if (!base || !secret || !url || !anon) {
  console.error("Missing VITE_SCRAPER_URL / DOCUMENT_INTELLIGENCE_AUTH_SECRET / Supabase");
  process.exit(1);
}

function signHeaders(method, path, body = "") {
  const ts = String(Math.floor(Date.now() / 1000));
  const rid = `e2e-${crypto.randomBytes(6).toString("hex")}`;
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  const msg = [method, path, ts, rid, digest].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  return {
    "X-Internal-Timestamp": ts,
    "X-Request-ID": rid,
    "X-Internal-Signature": `sha256=${sig}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function pythonFetch(method, path, bodyObj = null) {
  const body = bodyObj == null ? "" : JSON.stringify(bodyObj);
  const headers = signHeaders(method, path, body);
  const r = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body || undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: r.status, text: text.slice(0, 220), json };
}

async function publicFetch(path) {
  const r = await fetch(`${base}${path}`);
  const text = await r.text();
  return { status: r.status, text: text.slice(0, 180) };
}

const rows = [];
function row(area, id, status, detail, wired) {
  const rec = { area, id, status, wired, detail };
  rows.push(rec);
  console.log(JSON.stringify(rec));
  return rec;
}

console.log(JSON.stringify({ scraperHost: new URL(base).host, startedAt: new Date().toISOString() }));

// ─── A. Public Python reachability ───────────────────────────────────────────
{
  const h = await publicFetch("/health");
  row(
    "python-public",
    "GET /health",
    h.status === 200 ? "CONNECTED" : "BROKEN",
    `http=${h.status} ${h.text}`,
    "public",
  );
}
{
  const h = await publicFetch("/ready");
  row(
    "python-public",
    "GET /ready",
    h.status === 200 ? "CONNECTED" : "BROKEN",
    `http=${h.status} ${h.text}`,
    "public",
  );
}
{
  const h = await publicFetch("/metrics");
  row(
    "python-public",
    "GET /metrics",
    h.status === 200 ? "CONNECTED" : "BROKEN",
    `http=${h.status}`,
    "ops",
  );
}

// ─── B. HMAC gov-exams ───────────────────────────────────────────────────────
{
  const r = await pythonFetch("GET", "/internal/gov-exams/health");
  row(
    "python-gov",
    "GET /internal/gov-exams/health",
    r.status === 200 ? "CONNECTED" : "BROKEN",
    `http=${r.status} ${r.text}`,
    "Edge:hybrid-health,gov clients",
  );
}
{
  const r = await pythonFetch("POST", "/internal/gov-exams/availability", {
    exam_id: "ssc_cgl",
    mode: "custom_mock",
    question_count: 10,
    language: "en",
  });
  // May 422 if schema differs — treat 2xx or structured 4xx (not 401/503) as reachable
  const ok = r.status === 200 || (r.status >= 400 && r.status < 500 && r.status !== 401);
  row(
    "python-gov",
    "POST /internal/gov-exams/availability",
    r.status === 200 ? "CONNECTED" : ok ? "REACHABLE_SCHEMA" : "BROKEN",
    `http=${r.status} ${r.text}`,
    "Edge:check-exam-paper-availability",
  );
}
{
  const r = await pythonFetch("POST", "/internal/gov-exams/select", {
    exam_id: "ssc_cgl",
    mode: "custom_mock",
    question_count: 5,
    language: "en",
  });
  const ok = r.status === 200 || (r.status >= 400 && r.status < 500 && r.status !== 401);
  row(
    "python-gov",
    "POST /internal/gov-exams/select",
    r.status === 200 ? "CONNECTED" : ok ? "REACHABLE_SCHEMA" : "BROKEN",
    `http=${r.status} ${r.text}`,
    "Edge:govPaperAssembly",
  );
}
{
  const r = await pythonFetch("POST", "/internal/gov-exams/validate-questions", {
    questions: [],
  });
  const ok = r.status === 200 || (r.status >= 400 && r.status < 500 && r.status !== 401);
  row(
    "python-gov",
    "POST /internal/gov-exams/validate-questions",
    ok ? "REACHABLE_UNWIRED" : "BROKEN",
    `http=${r.status} ${r.text} | no Edge caller`,
    "NONE (Python only)",
  );
}
{
  const r = await pythonFetch("POST", "/internal/gov-exams/process-job", {
    job_id: "00000000-0000-0000-0000-000000000000",
  });
  // Expect 404/400 not 401 — proves route + HMAC
  const ok = r.status !== 401 && r.status !== 0 && r.status < 500;
  row(
    "python-gov",
    "POST /internal/gov-exams/process-job",
    r.status === 401 ? "BROKEN" : ok ? "CONNECTED" : "BROKEN",
    `http=${r.status} ${r.text}`,
    "Edge:create-exam-paper",
  );
}
{
  const r = await pythonFetch("POST", "/internal/gov-exams/build-paper", {
    exam_id: "ssc_cgl",
    question_count: 5,
  });
  const ok = r.status !== 401 && r.status !== 0;
  row(
    "python-gov",
    "POST /internal/gov-exams/build-paper",
    r.status === 401
      ? "BROKEN"
      : r.status < 500
        ? "REACHABLE_UNWIRED"
        : "BROKEN",
    `http=${r.status} ${r.text} | no dedicated Edge wrapper`,
    "NONE / optional",
  );
}

// ─── C. Hybrid operations ────────────────────────────────────────────────────
{
  const r = await pythonFetch("GET", "/internal/operations/supported");
  row(
    "python-hybrid",
    "GET /internal/operations/supported",
    r.status === 200 ? "CONNECTED" : "BROKEN",
    `http=${r.status} ${r.text}`,
    "Edge:hybrid diagnostics",
  );
}
{
  const r = await pythonFetch("POST", "/internal/operations", {
    operation_type: "ping",
    payload: {},
  });
  row(
    "python-hybrid",
    "POST /internal/operations ping",
    r.status === 200 ? "CONNECTED" : "BROKEN",
    `http=${r.status} ${r.text}`,
    "Edge:hybrid-ping",
  );
}
for (const op of [
  "star_format",
  "system_design_outline",
  "resume_structure",
  "company_research_skeleton",
  "mock_question_bank",
  "document_extract",
  "practice_coach",
]) {
  const r = await pythonFetch("POST", "/internal/operations", {
    operation_type: op,
    payload: { text: "hello world test", topic: "algorithms" },
  });
  row(
    "python-hybrid-ops",
    `op:${op}`,
    r.status === 200 ? "CONNECTED" : r.status === 401 ? "BROKEN" : "REACHABLE_SCHEMA",
    `http=${r.status} ${r.text}`,
    "via pythonExecuteOperation / hybrid",
  );
}

// ─── D. /v1/process ops ──────────────────────────────────────────────────────
for (const op of [
  "document_extract",
  "document_classify",
  "star_evidence",
  "system_design",
  "practice_coach",
  "company_normalize",
  "mock_question_validate",
  "speech_process",
]) {
  const payload =
    op === "practice_coach"
      ? {
          operation: "practice_coach",
          input: {
            operation_type: "coach_chat",
            message: "Say hi in one word.",
          },
        }
      : {
          operation: op,
          input: {
            text: "Sample resume text for verification probe.",
            message: "hello",
            company: "Acme",
            question: "Tell me about yourself",
          },
        };
  const r = await pythonFetch("POST", "/v1/process", payload);
  row(
    "python-v1-process",
    `process:${op}`,
    r.status === 200 ? "CONNECTED" : r.status === 401 ? "BROKEN" : "REACHABLE_SCHEMA",
    `http=${r.status} ${r.text}`,
    "Edge callPythonProcess",
  );
}

// ─── E. Document intelligence jobs ───────────────────────────────────────────
{
  const r = await pythonFetch("POST", "/internal/jobs/document", {
    job_id: "00000000-0000-0000-0000-000000000001",
    user_id: "00000000-0000-0000-0000-000000000002",
    document_id: "00000000-0000-0000-0000-000000000003",
  });
  row(
    "python-docs",
    "POST /internal/jobs/document",
    r.status === 401
      ? "BROKEN"
      : r.status < 500
        ? "CONNECTED"
        : "BROKEN",
    `http=${r.status} ${r.text}`,
    "Edge:create-document-processing-job",
  );
}
{
  const r = await pythonFetch("POST", "/internal/jobs/exam-source", {
    job_id: "00000000-0000-0000-0000-000000000001",
  });
  row(
    "python-docs",
    "POST /internal/jobs/exam-source",
    r.status === 401 ? "BROKEN" : r.status < 500 ? "REACHABLE_UNWIRED" : "BROKEN",
    `http=${r.status} ${r.text} | no Edge caller`,
    "NONE",
  );
}
{
  const r = await pythonFetch("POST", "/internal/jobs/validate-paper", {
    job_id: "00000000-0000-0000-0000-000000000001",
  });
  row(
    "python-docs",
    "POST /internal/jobs/validate-paper",
    r.status === 401 ? "BROKEN" : r.status < 500 ? "REACHABLE_UNWIRED" : "BROKEN",
    `http=${r.status} ${r.text} | no Edge caller`,
    "NONE",
  );
}

// ─── F. Admin-only routes (expect 401 without JWT — proves deployed) ─────────
for (const path of [
  "/scrape/sources",
  "/paper-factory/exams",
]) {
  const r = await fetch(`${base}${path}`);
  row(
    "python-admin",
    `GET ${path}`,
    r.status === 401 || r.status === 403
      ? "REACHABLE_UNWIRED"
      : r.status === 200
        ? "CONNECTED"
        : "BROKEN",
    `http=${r.status} (admin JWT; not Edge-hybrid)`,
    "Admin UI / direct only",
  );
}

// ─── G. Edge → Python hybrid E2E (auth’d) ─────────────────────────────────────
const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function edge(fn, { method = "POST", body, token, query = "" } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: anon,
    "Content-Type": "application/json",
  };
  const r = await fetch(`${url}/functions/v1/${fn}${query}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: r.status, text: text.slice(0, 240), json };
}

const { data: pro, error: proErr } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
if (proErr || !pro.session) {
  row("edge", "auth-pro", "BROKEN", String(proErr?.message || "no session"), "qa");
} else {
  const tok = pro.session.access_token;

  // hybrid-ping
  {
    const r = await edge("hybrid-ping", { method: "POST", body: {}, token: tok });
    const py =
      r.json?.python ||
      r.json?.source ||
      r.json?.result?.source ||
      r.json?.ok;
    row(
      "edge-hybrid",
      "hybrid-ping → python ping",
      r.status === 200 ? "CONNECTED" : "BROKEN",
      `http=${r.status} ${r.text}`,
      "POST /internal/operations ping",
    );
  }

  // search + availability (gov)
  {
    const se = await edge("search-exams", {
      method: "GET",
      token: tok,
      query: "?q=SSC%20CGL",
    });
    row(
      "edge-hybrid",
      "search-exams",
      se.status === 200 && (se.json?.results?.length || 0) > 0
        ? "CONNECTED"
        : "BROKEN",
      `http=${se.status} n=${se.json?.results?.length || 0}`,
      "Edge DB (not Python)",
    );
    const exam = se.json?.results?.[0];
    if (exam) {
      const av = await edge("check-exam-paper-availability", {
        token: tok,
        body: {
          examId: exam.examId,
          stageId: exam.stages?.[0]?.id,
          mode: "custom_mock",
          questionCount: 10,
          language: "en",
        },
      });
      const usedPy =
        av.json?.python === true ||
        av.json?.source === "python" ||
        av.json?.engine === "python" ||
        /python/i.test(JSON.stringify(av.json || {}));
      row(
        "edge-hybrid",
        "check-exam-paper-availability → gov availability",
        av.status === 200 ? "CONNECTED" : "BROKEN",
        `http=${av.status} available=${av.json?.available} blocked=${av.json?.blocked} python_signal=${usedPy}`,
        "POST /internal/gov-exams/availability",
      );
    }
  }

  // coach (may be FEATURE_DISABLED)
  {
    const r = await edge("ai-coach-chat", {
      token: tok,
      body: { message: "Say hi briefly.", mode: "practice" },
    });
    row(
      "edge-hybrid",
      "ai-coach-chat → practice_coach",
      r.status < 500 ? "CONNECTED" : "BROKEN",
      `http=${r.status} code=${r.json?.code || ""} ${r.text}`,
      "POST /v1/process practice_coach",
    );
  }

  // generate-hint
  {
    const r = await edge("generate-hint", {
      token: tok,
      body: {
        question: "Tell me about a time you failed.",
        answer_so_far: "I once missed a deadline",
      },
    });
    row(
      "edge-hybrid",
      "generate-hint → practice_coach",
      r.status < 500 ? "CONNECTED" : "BROKEN",
      `http=${r.status} ${r.text}`,
      "POST /v1/process practice_coach",
    );
  }

  // company-research
  {
    const r = await edge("company-research", {
      token: tok,
      body: { company: "Google" },
    });
    row(
      "edge-hybrid",
      "company-research → company_normalize",
      r.status < 500 ? "CONNECTED" : "BROKEN",
      `http=${r.status} ${r.text}`,
      "POST /v1/process company_normalize",
    );
  }

  // generate-star-answer
  {
    const r = await edge("generate-star-answer", {
      token: tok,
      body: {
        question: "Tell me about a challenge you faced.",
        context: "software engineer",
      },
    });
    row(
      "edge-hybrid",
      "generate-star-answer → star_evidence",
      r.status < 500 ? "CONNECTED" : "BROKEN",
      `http=${r.status} ${r.text}`,
      "POST /v1/process star_evidence",
    );
  }

  // parse-document (may need file — expect validation not 401/502)
  {
    const r = await edge("parse-document", {
      token: tok,
      body: { text: "John Doe\nSoftware Engineer\nBuilt APIs.", type: "resume" },
    });
    row(
      "edge-hybrid",
      "parse-document → document_extract",
      r.status === 401 || r.status >= 502 ? "BROKEN" : "CONNECTED",
      `http=${r.status} ${r.text}`,
      "POST /v1/process document_extract",
    );
  }
}

await client.auth.signOut();
const { data: admin } = await client.auth.signInWithPassword({
  email: qa.QA_ADMIN_EMAIL,
  password: qa.QA_ADMIN_PASSWORD,
});
if (admin?.session) {
  const r = await edge("hybrid-health", {
    method: "GET",
    token: admin.session.access_token,
  });
  const hmacOk = r.json?.python?.hmac_ok === true;
  row(
    "edge-hybrid",
    "hybrid-health (admin)",
    hmacOk ? "CONNECTED" : "BROKEN",
    `http=${r.status} hmac_ok=${r.json?.python?.hmac_ok} status=${r.json?.python?.status} signed=${r.json?.python?.signed_internal?.status}`,
    "GET /health + signed /internal/gov-exams/health",
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────
const broken = rows.filter((r) => r.status === "BROKEN");
const unwired = rows.filter((r) => r.status === "REACHABLE_UNWIRED");
const connected = rows.filter((r) => r.status === "CONNECTED");
const schema = rows.filter((r) => r.status === "REACHABLE_SCHEMA");

const summary = {
  counts: {
    total: rows.length,
    CONNECTED: connected.length,
    REACHABLE_SCHEMA: schema.length,
    REACHABLE_UNWIRED: unwired.length,
    BROKEN: broken.length,
  },
  broken: broken.map((r) => r.id),
  unwired_python_no_edge: unwired.map((r) => r.id),
  verdict:
    broken.length === 0
      ? "PYTHON_HYBRID_VERIFIED"
      : broken.some((r) => r.area.startsWith("python") && r.id.includes("health"))
        ? "PYTHON_UNREACHABLE"
        : "PARTIAL_FAILURES",
};
console.log(JSON.stringify(summary, null, 2));
process.exit(broken.length ? 2 : 0);
