/**
 * Phase 0: set Edge PYTHON_SERVICE_URL + PAPER_FACTORY_WORKER, list secret names,
 * query applied 20260831 migrations. Never prints secret values.
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

function upsertLocalEnv(file, key, value) {
  const p = path.join(ROOT, file);
  let text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) text = text.replace(re, `${key}=${value}`);
  else text = `${text.trimEnd()}\n${key}=${value}\n`;
  fs.writeFileSync(p, text, "utf8");
}

const local = loadEnv(".env.local");
const token = process.env.SUPABASE_ACCESS_TOKEN || local.SUPABASE_ACCESS_TOKEN || "";
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN missing");
  process.exit(1);
}

const pythonUrl = (
  local.PYTHON_SERVICE_URL ||
  local.SCRAPER_URL ||
  local.VITE_SCRAPER_URL ||
  ""
).replace(/\/$/, "");

if (!pythonUrl) {
  console.error("No PYTHON_SERVICE_URL / VITE_SCRAPER_URL");
  process.exit(1);
}

console.log(JSON.stringify({ pythonHost: new URL(pythonUrl).host }));

const secretsRes = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/secrets`,
  { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
);
const secretsText = await secretsRes.text();
let secretNames = [];
try {
  const parsed = JSON.parse(secretsText);
  secretNames = Array.isArray(parsed)
    ? parsed.map((s) => s.name).sort()
    : [];
} catch {
  secretNames = [`parse_failed_${secretsRes.status}`];
}
console.log("edge_secret_names", secretNames.join(","));

const put = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify([
    { name: "PYTHON_SERVICE_URL", value: pythonUrl },
    { name: "SCRAPER_URL", value: pythonUrl },
    { name: "GOV_EXAM_PYTHON_URL", value: pythonUrl },
    { name: "PAPER_FACTORY_URL", value: pythonUrl },
    { name: "PAPER_FACTORY_WORKER", value: "1" },
  ]),
});
console.log("edge_python_url_set", put.status, (await put.text()).slice(0, 120));

upsertLocalEnv(".env.local", "PYTHON_SERVICE_URL", pythonUrl);
upsertLocalEnv(".env.local", "SCRAPER_URL", pythonUrl);
upsertLocalEnv(".env.local", "PAPER_FACTORY_WORKER", "1");

async function runQuery(sql) {
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
  return { status: res.status, text: text.slice(0, 4000) };
}

const probe = await runQuery("select 1 as ok");
console.log("db_probe", probe.status, probe.text.slice(0, 200));

const applied = await runQuery(`
  select version
  from supabase_migrations.schema_migrations
  where version like '20260831%'
  order by version
`);
console.log("applied_20260831", applied.status, applied.text.slice(0, 1500));

const latest = await runQuery(`
  select version
  from supabase_migrations.schema_migrations
  order by version desc
  limit 8
`);
console.log("latest_migrations", latest.status, latest.text.slice(0, 800));

const rls = await runQuery(`
  select relname, relrowsecurity
  from pg_class
  where relname in (
    'gov_paper_generation_jobs','mock_tests','test_responses',
    'documents','sessions','credit_transactions'
  )
  and relkind = 'r'
`);
console.log("rls_flags", rls.status, rls.text.slice(0, 800));
