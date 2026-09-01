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
    return { status: res.status, text: text.slice(0, 800) };
  }
}

const ids = {
  QA_PRO: "692978b7-153a-4dcd-811a-8a7133fba8c8",
  QA_FREE: "d17262d4-a63c-4f6d-9543-51452997144b",
  QA_USER_A: "1215cc75-12db-4028-a386-bdf3106bd73e",
};

console.log("=== open sessions ===");
console.log(
  JSON.stringify(
    await q(`
  select user_id, id, type, status, lifecycle_status, terminal_reason,
         started_at, expires_at, ended_at, start_idempotency_key,
         model_used, tags, document_id, jd_id, created_at
  from sessions
  where user_id in (
    '692978b7-153a-4dcd-811a-8a7133fba8c8',
    'd17262d4-a63c-4f6d-9543-51452997144b',
    '1215cc75-12db-4028-a386-bdf3106bd73e'
  )
    and status in ('pending','active','paused')
    and deleted_at is null
  order by user_id, created_at desc
`),
    null,
    2,
  ),
);

console.log("\n=== unique indexes on sessions ===");
console.log(
  await q(`
  select indexname, indexdef
  from pg_indexes
  where schemaname='public' and tablename='sessions'
  order by indexname
`),
);

console.log("\n=== triggers on sessions ===");
console.log(
  await q(`
  select tgname, pg_get_triggerdef(t.oid) as def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relname='sessions' and not t.tgisinternal
`),
);

console.log("\n=== check constraints ===");
console.log(
  await q(`
  select conname, pg_get_constraintdef(oid)
  from pg_constraint
  where conrelid = 'public.sessions'::regclass
    and contype = 'c'
`),
);

console.log("\n=== rpc call QA_PRO mock ===");
console.log(
  JSON.stringify(
    await q(`
  select public.start_owned_session(
    '692978b7-153a-4dcd-811a-8a7133fba8c8'::uuid,
    'mock',
    'probe mock',
    null, null, 'gemini-1-5-flash',
    array['practice']::text[],
    null, null, 30,
    'probe-rpc-pro-' || gen_random_uuid()::text
  ) as result
`),
    null,
    2,
  ),
);

console.log("\n=== rpc call QA_FREE mock ===");
console.log(
  JSON.stringify(
    await q(`
  select public.start_owned_session(
    'd17262d4-a63c-4f6d-9543-51452997144b'::uuid,
    'mock',
    'probe mock',
    null, null, 'gemini-1-5-flash',
    array['practice']::text[],
    null, null, 30,
    'probe-rpc-free-' || gen_random_uuid()::text
  ) as result
`),
    null,
    2,
  ),
);

console.log("\n=== feature flags related ===");
console.log(
  await q(`
  select key, is_enabled, metadata
  from feature_flags
  where key ilike '%live%' or key ilike '%mock%' or key ilike '%session%' or key ilike '%coach%'
`),
);
