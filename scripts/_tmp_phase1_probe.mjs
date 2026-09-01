/**
 * Probe whether Phase-1 objects exist on live (no secret printing).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = "qzgvjrvtkwlzxpmlddkx";

function loadEnv(file) {
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
    ) {
      v = v.slice(1, -1);
    }
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

const local = loadEnv(".env.local");
const token = process.env.SUPABASE_ACCESS_TOKEN || local.SUPABASE_ACCESS_TOKEN || "";

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
  return { status: res.status, text };
}

const checks = [
  [
    "gov_job_credit_cols",
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='gov_paper_generation_jobs'
       and column_name in ('credits_reserved','credits_finalized_at','credits_released_at','inventory_snapshot','inventory_version')
     order by column_name`,
  ],
  [
    "gov_credit_rpcs",
    `select p.proname from pg_proc p
     join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname in ('reserve_gov_paper_credits','finalize_gov_paper_credits','release_gov_paper_credits',
                         'get_owned_session_detail','start_owned_mock_test','save_owned_test_answer',
                         'count_gov_exam_eligible_questions','resolve_gov_exam_bank_type_keys')
     order by 1`,
  ],
  [
    "interview_tz",
    `select table_name, column_name from information_schema.columns
     where table_schema='public' and column_name='timezone'
       and table_name in ('interview_rounds','scheduled_interviews')
     order by 1`,
  ],
  [
    "answer_version",
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='test_responses'
       and column_name in ('answer_version','client_updated_at')
     order by 1`,
  ],
  [
    "job_status_check",
    `select pg_get_constraintdef(c.oid)
     from pg_constraint c
     join pg_class t on t.oid=c.conrelid
     where t.relname='gov_paper_generation_jobs' and c.conname='gov_paper_generation_jobs_status_check'`,
  ],
  [
    "freeze_policies",
    `select tablename, policyname, cmd
     from pg_policies
     where tablename in ('gov_paper_generation_jobs','mock_tests','test_responses')
     order by 1,2`,
  ],
  [
    "local_files_vs_remote",
    `select version from supabase_migrations.schema_migrations
     where version like '202608311%' or version like '20260831%'
     order by version`,
  ],
];

for (const [name, sql] of checks) {
  const r = await q(sql);
  console.log("\n===", name, r.status, "===");
  console.log(r.text.slice(0, 2500));
}
