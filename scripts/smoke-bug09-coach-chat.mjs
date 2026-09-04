#!/usr/bin/env node
/**
 * BUG 09 smoke: start practice session + ai-coach-chat with app slug gemini-flash.
 * Expect 200 SSE (usable reply) when Gemini healthy; never unmapped model-id failures.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function load(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
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
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...load(".env.local"), ...load(".env.qa.local"), ...process.env };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const email = env.QA_USER_A_EMAIL;
const pass = env.QA_USER_A_PASSWORD;

if (!url || !anon || !email || !pass) {
  console.error("missing creds");
  process.exit(1);
}

const sb = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: auth, error: ae } = await sb.auth.signInWithPassword({
  email,
  password: pass,
});
if (ae) throw ae;

const token = auth.session.access_token;

async function edge(slug, body) {
  const res = await fetch(`${url}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": `bug09-${slug}-${Date.now()}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* sse or plain */
  }
  return { status: res.status, text, json, contentType: res.headers.get("content-type") };
}

const start = await edge("start-session", {
  session_type: "practice",
  mode: "practice",
  title: "bug09-coach-chat-smoke",
});
let sessionId =
  start.json?.session_id || start.json?.session?.id || start.json?.id || null;
if (!sessionId) {
  const rest = await edge("start-session", {
    action: "restore",
    session_type: "practice",
  });
  sessionId =
    rest.json?.session_id || rest.json?.session?.id || rest.json?.id || null;
  console.log("start-session", start.status, start.text.slice(0, 200));
  console.log("restore", rest.status, rest.text.slice(0, 200));
} else {
  console.log("start-session", start.status, sessionId);
}

if (!sessionId) {
  console.error("FAIL: could not start/restore practice session");
  process.exit(1);
}

const chatRes = await fetch(`${url}/functions/v1/ai-coach-chat`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    apikey: anon,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "Idempotency-Key": `bug09-chat-${Date.now()}`,
  },
  body: JSON.stringify({
    session_id: sessionId,
    message: "Give me one tip for answering Tell me about yourself.",
    previous_turns: [],
    context: {
      current_question: "Tell me about yourself",
      recent_transcript: "",
      resume_context: "Built APIs in Node.js for three years",
      job_description: "Backend engineer",
      recent_answers: [],
    },
    model: "gemini-flash",
  }),
});

const chatText = await chatRes.text();
console.log(
  JSON.stringify(
    {
      chatStatus: chatRes.status,
      contentType: chatRes.headers.get("content-type"),
      bodyHead: chatText.slice(0, 600),
      sessionId,
    },
    null,
    2,
  ),
);

const looksLikeModelIdBug =
  /models\/gemini-flash[^0-9.]|Unknown model.*gemini-flash\b|invalid model id.*gemini-flash\b/i.test(
    chatText,
  );
if (looksLikeModelIdBug) {
  console.error("FAIL: unmapped gemini-flash model id");
  process.exit(1);
}

if (chatRes.status === 200 && /data:|reply|chunk|content/i.test(chatText)) {
  console.log("PASS: 200 SSE coach reply with gemini-flash slug resolved");
  process.exit(0);
}

if (chatRes.status === 503) {
  console.log(
    "PARTIAL: typed 503 provider unavailable (model slug mapping OK; Gemini outage)",
  );
  process.exit(0);
}

console.error("FAIL: unexpected coach chat response");
process.exit(1);
