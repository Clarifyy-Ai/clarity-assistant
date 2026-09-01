import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
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
    )
      v = v.slice(1, -1);
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

const local = load(".env.local");
const qa = load(".env.qa.local");
const supabaseUrl = (local.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const anon = local.VITE_SUPABASE_ANON_KEY;
const token = local.SUPABASE_ACCESS_TOKEN;
const REF = local.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";

async function q(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { parse_error: true, status: res.status, text: text.slice(0, 500) };
  }
}

async function signIn(email, password, label) {
  const sign = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await sign.json();
  if (!session.access_token) {
    console.log(label, "signin_failed", sign.status, JSON.stringify(session).slice(0, 250));
    return null;
  }
  return { access: session.access_token, userId: session.user?.id, label };
}

async function callStart(auth, body, extraHeaders = {}) {
  const res = await fetch(`${supabaseUrl}/functions/v1/start-session`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${auth.access}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

console.log("=== DB: start_owned_session signature ===");
console.log(
  await q(`
  select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('start_owned_session','session_start_eligibility')
`),
);

console.log("=== DB: kill flags / onboarding sample ===");
console.log(
  await q(`
  select column_name from information_schema.columns
  where table_schema='public' and table_name in ('feature_flags','app_flags','kill_switches')
  order by table_name, ordinal_position
`),
);

const accounts = [
  ["QA_PRO", qa.QA_PRO_EMAIL, qa.QA_PRO_PASSWORD],
  ["QA_USER_A", qa.QA_USER_A_EMAIL, qa.QA_USER_A_PASSWORD],
  ["QA_FREE", qa.QA_FREE_EMAIL, qa.QA_FREE_PASSWORD],
].filter(([, e, p]) => e && p);

for (const [label, email, password] of accounts) {
  const auth = await signIn(email, password, label);
  if (!auth) continue;
  console.log("\n===", label, auth.userId, "===");
  const profile = await q(`
    select id, plan_id, credits, onboarding_completed,
      (select count(*) from sessions s where s.user_id = p.id and s.status in ('pending','active','paused') and s.deleted_at is null) as open_sessions
    from profiles p where id = '${auth.userId}'
  `);
  console.log("profile", profile);

  const elig = await callStart(auth, { action: "eligibility", check_only: true });
  console.log("eligibility", elig.status, JSON.stringify(elig.json).slice(0, 500));

  const mock = await callStart(
    auth,
    { session_type: "mock", type: "mock", is_practice: true, interview_type: "behavioral" },
    { "Idempotency-Key": `probe-mock-${label}-${crypto.randomUUID()}` },
  );
  console.log("start mock", mock.status, JSON.stringify(mock.json).slice(0, 600));

  const rehearsal = await callStart(
    auth,
    {
      session_type: "rehearsal",
      type: "rehearsal",
      is_practice: true,
      interview_type: "behavioral",
      duration_minutes: 15,
      role: "Software Engineer",
      session_call_type: "interview",
    },
    { "Idempotency-Key": `probe-reh-${label}-${crypto.randomUUID()}` },
  );
  console.log("start rehearsal (no resume)", rehearsal.status, JSON.stringify(rehearsal.json).slice(0, 600));
}

console.log("\n=== Edge logs start-session ===");
const start = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
const end = new Date().toISOString();
const sql = `
  select timestamp, event_message
  from edge_logs
  where event_message ilike '%start-session%'
     or event_message ilike '%SESSION_CREATE%'
     or event_message ilike '%onboarding%'
  order by timestamp desc
  limit 30
`;
const url =
  `https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/logs.all` +
  `?iso_timestamp_start=${encodeURIComponent(start)}` +
  `&iso_timestamp_end=${encodeURIComponent(end)}` +
  `&sql=${encodeURIComponent(sql)}`;
const logsRes = await fetch(url, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});
const logsBody = await logsRes.json();
console.log("logs status", logsRes.status, "rows", (logsBody.result || []).length);
for (const row of logsBody.result || []) {
  const ts = row.timestamp ? new Date(Number(row.timestamp) / 1000).toISOString() : "?";
  console.log(ts, String(row.event_message || "").slice(0, 280));
}

const fns = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});
const list = await fns.json();
const ss = Array.isArray(list) ? list.find((f) => f.slug === "start-session") : null;
console.log("\nstart-session fn", ss ? { version: ss.version, status: ss.status, updated_at: ss.updated_at } : list);
