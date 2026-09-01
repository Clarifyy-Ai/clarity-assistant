/**
 * Record repo migration versions that are already live under other timestamps.
 * SQL is idempotent (IF NOT EXISTS / CREATE OR REPLACE).
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

const token = process.env.SUPABASE_ACCESS_TOKEN || loadEnv(".env.local").SUPABASE_ACCESS_TOKEN;

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
  return { status: res.status, text: await res.text() };
}

const cols = await q(`
  select column_name from information_schema.columns
  where table_schema='supabase_migrations' and table_name='schema_migrations'
  order by 1
`);
console.log("schema_migrations_cols", cols.status, cols.text.slice(0, 500));

const versions = [
  "20260831120000",
  "20260831130000",
  "20260831140000",
  "20260831140100",
  "20260831150000",
  "20260831151000",
];

for (const version of versions) {
  const ins = await q(`
    insert into supabase_migrations.schema_migrations (version)
    values ('${version}')
    on conflict (version) do nothing
    returning version
  `);
  console.log("record", version, ins.status, ins.text.slice(0, 200));
}

const listed = await q(`
  select version from supabase_migrations.schema_migrations
  where version like '202608311%'
  order by version
`);
console.log("listed", listed.status, listed.text);
