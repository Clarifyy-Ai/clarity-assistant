#!/usr/bin/env node
/**
 * Confirms whether deployed GEMINI_API_KEY works by calling generate-questions.
 * Also retries with a session-bound generate-hint / generate-answer after start-session.
 *
 * generate-answer post-gates on factual integrity: empty resume_context often yields
 * AI_INVALID_OUTPUT when the model invents metrics. Pass a minimal honest resume so
 * the smoke proves provider success without disabling groundedness validation.
 */
import fs from "node:fs";

/** Minimal honest resume facts for generate-answer smoke (not a fabricated "AI success" bypass). */
const SMOKE_RESUME_CONTEXT = [
  "Backend engineer at Northwind Labs.",
  "Built TypeScript and Node.js REST APIs backed by PostgreSQL.",
  "Owned reliability work on billing webhooks and partner integrations.",
  "Collaborated with product on incident response and on-call runbooks.",
  "Seeking senior backend roles focused on distributed systems.",
].join(" ");

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
const base = (env.VITE_SUPABASE_URL || env.QA_SUPABASE_URL || "").replace(/\/$/, "");
const anon = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const email = env.QA_PRO_EMAIL;
const password = env.QA_PRO_PASSWORD;

const authRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const auth = await authRes.json();
if (!auth.access_token) {
  console.log(JSON.stringify({ ok: false, step: "auth", status: authRes.status }));
  process.exit(1);
}
const token = auth.access_token;
const headers = {
  Authorization: `Bearer ${token}`,
  apikey: anon,
  "Content-Type": "application/json",
};

async function call(name, body) {
  const t0 = Date.now();
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return {
    name,
    status: res.status,
    ms: Date.now() - t0,
    body: text,
    preview: text.slice(0, 400).replace(/\s+/g, " "),
  };
}

const session = await call("start-session", {
  session_type: "rehearsal",
  type: "rehearsal",
  is_practice: true,
  interview_type: "behavioral",
  duration_minutes: 15,
});
console.log(JSON.stringify({ ...session, body: session.preview }));

let sessionId = null;
try {
  sessionId = JSON.parse(session.body).session_id;
} catch {
  /* ignore */
}

let hint = null;
let answer = null;
if (sessionId) {
  hint = await call("generate-hint", {
    session_id: sessionId,
    question: "Tell me about a challenge you faced at work.",
    mode: "rehearsal",
    session_type: "rehearsal",
    is_practice: true,
    resume_context: SMOKE_RESUME_CONTEXT,
  });
  console.log(JSON.stringify({ ...hint, body: hint.preview }));
  answer = await call("generate-answer", {
    session_id: sessionId,
    question: "Why do you want this role?",
    mode: "rehearsal",
    session_type: "rehearsal",
    is_practice: true,
    resume_context: SMOKE_RESUME_CONTEXT,
  });
  console.log(JSON.stringify({ ...answer, body: answer.preview }));
}

const questions = await call("generate-questions", {
  type: "behavioral",
  count: 1,
  role: "Engineer",
  free_session: true,
});
console.log(JSON.stringify({ ...questions, body: questions.preview }));

function edgeOk(result) {
  if (!result || result.status >= 400) return false;
  const body = String(result.body ?? "");
  // Streamed factual-gate failures still return HTTP 200 with this code in the SSE body.
  if (/"AI_INVALID_OUTPUT"|AI returned invalid output/i.test(body)) return false;
  return true;
}

const ok =
  session.status === 200 &&
  questions.status === 200 &&
  (!sessionId || (edgeOk(hint) && edgeOk(answer)));
process.exit(ok ? 0 : 1);
