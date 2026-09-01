import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const token = local.SUPABASE_ACCESS_TOKEN;
const REF = "qzgvjrvtkwlzxpmlddkx";

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
    return { text: text.slice(0, 1500) };
  }
}

const resumes = await q(`
  select r.id, r.user_id, r.name, p.email, p.full_name, p.plan_id, p.onboarding_completed, p.credits
  from resumes r
  join profiles p on p.id = r.user_id
  where r.name ilike '%Monali%' or r.name ilike '%Barai%'
     or p.full_name ilike '%Monali%' or p.full_name ilike '%Barai%'
     or p.email ilike '%monali%' or p.email ilike '%barai%'
  order by r.created_at desc
  limit 8
`);
console.log("resumes", JSON.stringify(resumes, null, 2));

const docs = await q(`
  select d.id, d.user_id, d.title, d.file_name, d.type, p.email, p.full_name
  from documents d
  join profiles p on p.id = d.user_id
  where d.title ilike '%Monali%' or d.title ilike '%Barai%'
     or d.file_name ilike '%Monali%' or d.file_name ilike '%Barai%'
     or p.full_name ilike '%Monali%' or p.email ilike '%monali%'
  order by d.created_at desc
  limit 8
`);
console.log("docs", JSON.stringify(docs, null, 2));

const uid =
  (Array.isArray(resumes) && resumes[0]?.user_id) ||
  (Array.isArray(docs) && docs[0]?.user_id) ||
  null;

console.log("uid", uid);
if (!uid) process.exit(0);

console.log(
  "sessions",
  JSON.stringify(
    await q(`
  select id, type, status, lifecycle_status, terminal_reason, started_at, expires_at, ended_at,
         document_id, jd_id, model_used, created_at
  from sessions
  where user_id = '${uid}' and deleted_at is null
  order by created_at desc
  limit 15
`),
    null,
    2,
  ),
);

console.log(
  "jds",
  JSON.stringify(
    await q(`
  select id, title, parse_status, created_at
  from job_descriptions
  where user_id = '${uid}'
  order by created_at desc
  limit 10
`),
    null,
    2,
  ),
);

console.log(
  "rpc mock",
  JSON.stringify(
    await q(`
  select public.start_owned_session(
    '${uid}'::uuid, 'mock', 'probe mock monali',
    null, null, 'gpt-4o', array['practice']::text[],
    null, null, 30, 'probe-monali-mock-' || gen_random_uuid()::text
  ) as result
`),
    null,
    2,
  ),
);

console.log(
  "rpc rehearsal",
  JSON.stringify(
    await q(`
  select public.start_owned_session(
    '${uid}'::uuid, 'rehearsal', 'probe rehearsal monali',
    null, null, 'gpt-4o', array['practice','rehearsal']::text[],
    null, null, 30, 'probe-monali-reh-' || gen_random_uuid()::text
  ) as result
`),
    null,
    2,
  ),
);
