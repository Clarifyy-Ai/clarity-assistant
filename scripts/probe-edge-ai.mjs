#!/usr/bin/env node
import fs from "node:fs";

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

if (!base || !anon || !email || !password) {
  console.error("Missing base/anon/QA_PRO credentials");
  process.exit(1);
}

async function signIn() {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`auth ${res.status} ${JSON.stringify(json).slice(0, 160)}`);
  }
  return json.access_token;
}

async function invoke(name, body, token) {
  const t0 = Date.now();
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  return {
    name,
    status: res.status,
    ms: Date.now() - t0,
    ok: res.ok,
    body: text.slice(0, 260).replace(/\s+/g, " "),
  };
}

const token = await signIn();
console.log(JSON.stringify({ auth: "ok", project: base }));

const jobs = [
  [
    "generate-questions",
    {
      type: "behavioral",
      count: 2,
      role: "Engineer",
      company: "Test",
      free_session: true,
    },
  ],
  [
    "generate-hint",
    {
      question: "Tell me about yourself",
      session_type: "rehearsal",
      is_practice: true,
    },
  ],
  [
    "start-session",
    {
      session_type: "rehearsal",
      type: "rehearsal",
      is_practice: true,
      interview_type: "behavioral",
      duration_minutes: 15,
    },
  ],
  ["deepgram-token", {}],
  ["analytics-dashboard", {}],
  ["prep-tool", { tool: "rephrase", text: "I led a team of five engineers." }],
  ["company-research", { company: "Google", role: "Software Engineer" }],
];

for (const [name, body] of jobs) {
  try {
    const result = await invoke(name, body, token);
    console.log(JSON.stringify(result));
  } catch (e) {
    console.log(
      JSON.stringify({
        name,
        ok: false,
        error: String(e?.message || e).slice(0, 200),
      }),
    );
  }
}
