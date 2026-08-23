/**
 * Apply pending local SQL migrations via Management API database/query.
 * Requires a valid SUPABASE_ACCESS_TOKEN in .env.local or env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";

function loadEnv(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(".env.local");

const token = process.env.SUPABASE_ACCESS_TOKEN || "";
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN missing");
  process.exit(1);
}

const pending = [
  "20260823180638_admin_portal_production_repair.sql",
  "20260823184317_coach_conversations.sql",
  "20260824010000_gov_exam_hybrid_registry.sql",
  "20260824020000_backend_operation_log.sql",
  "20260824120000_gov_exam_paper_engine_provenance.sql",
  "20260824120100_gov_exam_practice_bank_seeds.sql",
  "20260824140000_moderator_role.sql",
  "20260824190000_algorithm_security_consistency.sql",
];

async function runQuery(sql) {
  const urls = [
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    `https://api.supabase.com/v1/projects/${REF}/db/query`,
  ];
  let last = null;
  for (const url of urls) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    last = { url, status: res.status, text: text.slice(0, 500) };
    if (res.ok) return last;
  }
  return last;
}

const probe = await runQuery("select 1 as ok");
console.log("probe", probe);
if (!probe || probe.status === 401 || probe.status === 403) {
  console.error("Access token unauthorized. Create a new PAT at https://supabase.com/dashboard/account/tokens");
  process.exit(2);
}

for (const name of pending) {
  const file = path.join(ROOT, "supabase", "migrations", name);
  if (!fs.existsSync(file)) {
    console.log("SKIP missing", name);
    continue;
  }
  const sql = fs.readFileSync(file, "utf8");
  console.log("APPLY", name, `(${sql.length} bytes)`);
  const result = await runQuery(sql);
  console.log(" ", result?.status, (result?.text || "").slice(0, 200));
  if (result && result.status >= 400 && result.status !== 409) {
    // continue — some may already be applied
    console.warn("  warn: non-2xx (may already be applied)");
  }
}

console.log("done");
