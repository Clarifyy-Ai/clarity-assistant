import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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

const local = { ...load(".env.local"), ...load(".env") };
const qa = load(".env.qa.local");
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const service = local.SUPABASE_SERVICE_ROLE_KEY;
const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
if (error) throw error;
const userId = data.user.id;
const tok = data.session.access_token;

// Create a processing JD row if job_descriptions table supports it
const jdId = randomUUID();
const { data: existingJd } = await client
  .from("job_descriptions")
  .select("id, parse_status")
  .eq("user_id", userId)
  .limit(1)
  .maybeSingle();

let useJd = existingJd?.id;
if (!useJd) {
  const ins = await admin.from("job_descriptions").insert({
    id: jdId,
    user_id: userId,
    title: "probe-processing-jd",
    parse_status: "processing",
    company_name: "ProbeCo",
  }).select("id").maybeSingle();
  console.log("jd insert", ins.error?.message || ins.data);
  useJd = ins.data?.id ?? jdId;
} else {
  await admin
    .from("job_descriptions")
    .update({ parse_status: "processing" })
    .eq("id", useJd);
  console.log("forced processing", useJd);
}

const { data: resume } = await client
  .from("resumes")
  .select("id")
  .eq("user_id", userId)
  .limit(1)
  .maybeSingle();

const r = await fetch(`${url}/functions/v1/start-session`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${tok}`,
    apikey: anon,
    "Content-Type": "application/json",
    "x-idempotency-key": `probe-jd-skip-${Date.now()}`,
  },
  body: JSON.stringify({
    session_type: "practice",
    session_call_type: "interview",
    role: "Backend Engineer",
    resume_id: resume?.id,
    jd_id: useJd,
    duration_minutes: 15,
    question_count: 5,
    model: "auto",
    hint_style: "balanced",
  }),
});
const text = await r.text();
console.log("start-session", r.status, text.slice(0, 600));

// write debug evidence
fs.appendFileSync(
  "debug-bf0aca.log",
  JSON.stringify({
    sessionId: "bf0aca",
    hypothesisId: "JD-SKIP",
    location: "scripts/_probe_start_jd_processing.mjs",
    message: "start-session with processing JD",
    data: { status: r.status, body: text.slice(0, 400), jdId: useJd },
    timestamp: Date.now(),
  }) + "\n",
);
