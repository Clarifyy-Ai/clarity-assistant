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
const token = local.SUPABASE_ACCESS_TOKEN;
const REF = "qzgvjrvtkwlzxpmlddkx";
const supabaseUrl = (local.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const anon = local.VITE_SUPABASE_ANON_KEY;

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
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, text: text.slice(0, 800) };
  }
}

const sql = fs.readFileSync(
  path.join(ROOT, "supabase/migrations/20260901150000_allow_session_lifecycle_expired.sql"),
  "utf8",
);
console.log("apply constraint", await q(sql));
console.log(
  "record",
  await q(`
    insert into supabase_migrations.schema_migrations (version)
    values ('20260901150000')
    on conflict (version) do nothing
    returning version
  `),
);
console.log(
  "constraint now",
  await q(`
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and conname = 'sessions_lifecycle_status_check'
  `),
);

async function signIn(email, password) {
  const sign = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await sign.json();
  return session.access_token ? { access: session.access_token, userId: session.user.id } : null;
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
  return { status: res.status, json: JSON.parse(await res.text()) };
}

const auth = await signIn(qa.QA_PRO_EMAIL, qa.QA_PRO_PASSWORD);
const free = await signIn(qa.QA_FREE_EMAIL, qa.QA_FREE_PASSWORD);
const userA = await signIn(qa.QA_USER_A_EMAIL, qa.QA_USER_A_PASSWORD);

for (const [label, a] of [
  ["QA_PRO", auth],
  ["QA_FREE", free],
  ["QA_USER_A", userA],
]) {
  if (!a) {
    console.log(label, "signin_failed");
    continue;
  }
  const mock = await callStart(
    a,
    { session_type: "mock", type: "mock", is_practice: true, interview_type: "behavioral" },
    { "Idempotency-Key": `fix-mock-${label}-${crypto.randomUUID()}` },
  );
  console.log(label, "mock", mock.status, mock.json.code || mock.json.session_id, mock.json.reused, mock.json.error);

  const rehearsal = await callStart(
    a,
    {
      session_type: "rehearsal",
      type: "rehearsal",
      is_practice: true,
      interview_type: "behavioral",
      duration_minutes: 15,
    },
    { "Idempotency-Key": `fix-reh-${label}-${crypto.randomUUID()}` },
  );
  console.log(
    label,
    "rehearsal",
    rehearsal.status,
    rehearsal.json.code || rehearsal.json.session_id,
    rehearsal.json.reused,
    rehearsal.json.error,
  );
}

const resume = await q(`
  select id, user_id from resumes
  where user_id = '692978b7-153a-4dcd-811a-8a7133fba8c8'
  order by created_at desc limit 1
`);
console.log("qa_pro resume", resume);
if (auth && Array.isArray(resume.json) && resume.json[0]?.id) {
  const withResume = await callStart(
    auth,
    {
      session_type: "rehearsal",
      type: "rehearsal",
      is_practice: true,
      interview_type: "behavioral",
      duration_minutes: 15,
      role: "Software Engineer",
      resume_id: resume.json[0].id,
      session_call_type: "interview",
    },
    { "Idempotency-Key": `fix-pc-${crypto.randomUUID()}` },
  );
  console.log(
    "QA_PRO practice coach interview",
    withResume.status,
    withResume.json.code || withResume.json.session_id,
    withResume.json.reused,
    withResume.json.error,
  );
}
