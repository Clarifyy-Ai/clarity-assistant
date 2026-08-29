#!/usr/bin/env node
/** Quick probe: start-session + generate-answer SSE after deploy */
import fs from "node:fs";

function loadEnv(p) {
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

const env = { ...loadEnv(".env.local"), ...loadEnv(".env.qa.local") };
const base = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const anon = env.VITE_SUPABASE_ANON_KEY || "";
const email = env.QA_PRO_EMAIL;
const password = env.QA_PRO_PASSWORD;

if (!base || !anon || !email || !password) {
  console.error("Missing credentials in .env.local");
  process.exit(1);
}

const authRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const authJson = await authRes.json();
const token = authJson.access_token;
if (!token) {
  console.error("Auth failed", authRes.status);
  process.exit(1);
}

const idem = `probe-pc-${Date.now()}`;
const startRes = await fetch(`${base}/functions/v1/start-session`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    apikey: anon,
    "Content-Type": "application/json",
    "Idempotency-Key": idem,
  },
  body: JSON.stringify({
    session_type: "rehearsal",
    type: "rehearsal",
    is_practice: true,
    interview_type: "behavioral",
    duration_minutes: 15,
  }),
});
const startJson = await startRes.json();
const sessionId = startJson.session_id;

const ansRes = await fetch(`${base}/functions/v1/generate-answer`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    apikey: anon,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "Idempotency-Key": `probe-answer-${Date.now()}`,
  },
  body: JSON.stringify({
    question: "Tell me about a time you showed leadership.",
    session_id: sessionId,
    mode: "rehearsal",
    interview_type: "behavioral",
    model: "gemini-2.5-flash",
  }),
});
const ansText = await ansRes.text();
const hasContent = /data:\s*\{/.test(ansText) && ansText.length > 80;

console.log(
  JSON.stringify(
    {
      start_session: { status: startRes.status, session_id: sessionId },
      generate_answer: {
        status: ansRes.status,
        has_sse_content: hasContent,
        preview: ansText.slice(0, 320).replace(/\s+/g, " "),
      },
    },
    null,
    2,
  ),
);

process.exit(startRes.ok && ansRes.ok && hasContent ? 0 : 1);
