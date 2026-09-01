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
const base = local.VITE_SUPABASE_URL.replace(/\/$/, "");
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
  return JSON.parse(await res.text());
}

const uid = "692978b7-153a-4dcd-811a-8a7133fba8c8";
console.log(
  "end leftover",
  await q(`
  select public.end_owned_session('${uid}'::uuid, id, 'CANCELLED', 'CANCELLED') as result
  from public.sessions
  where user_id = '${uid}'
    and status in ('pending','active','paused')
    and deleted_at is null
`),
);

const sign = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: qa.QA_PRO_EMAIL, password: qa.QA_PRO_PASSWORD }),
});
const s = await sign.json();

async function call(label, body) {
  const r = await fetch(`${base}/functions/v1/start-session`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${s.access_token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `fresh-${label}-${crypto.randomUUID()}`,
    },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  console.log(label, r.status, json.session_id, "reused=" + json.reused, json.code || "", json.error || "");
}

const resumeId = "8b1df310-7f8d-4bf8-985d-adbac3d12e3e";
const jdId = "b6c7920a-dd8f-41d4-9e85-81447c7590b2";

await call("practice-coach", {
  session_type: "rehearsal",
  type: "rehearsal",
  is_practice: true,
  interview_type: "behavioral",
  role: "Software Engineer",
  resume_id: resumeId,
  jd_id: jdId,
  model: "gpt-4o",
  duration_minutes: 30,
  session_call_type: "interview",
  hint_style: "short_hints",
});

await call("mock", {
  session_type: "mock",
  type: "mock",
  is_practice: true,
  resume_id: resumeId,
  jd_id: jdId,
  model: "gpt-4o",
});
