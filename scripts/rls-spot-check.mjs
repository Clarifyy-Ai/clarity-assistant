#!/usr/bin/env node
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN required");
  process.exit(1);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const qaLocal = loadEnvFile(path.resolve(process.cwd(), ".env.qa.local"));
const userA = process.env.QA_USER_A_EMAIL || qaLocal.QA_USER_A_EMAIL;
const userB = process.env.QA_USER_B_EMAIL || qaLocal.QA_USER_B_EMAIL;

const query = `
SELECT
  c.relname AS table_name,
  COUNT(p.polname)::int AS policy_count,
  bool_or(c.relrowsecurity) AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'sessions',
    'session_transcripts',
    'profiles',
    'credit_transactions',
    'account_deletion_operations',
    'gap_analyses'
  )
GROUP BY c.relname
ORDER BY c.relname;
`;

const body = JSON.stringify({ query });
const req = https.request(
  {
    hostname: "api.supabase.com",
    path: `/v1/projects/${ref}/database/query`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      console.log(JSON.stringify({ status: res.statusCode, body: data }, null, 2));
      if (res.statusCode >= 300) process.exit(1);
      let rows;
      try {
        rows = JSON.parse(data);
      } catch {
        process.exit(1);
      }
      const expected = [
        "sessions",
        "session_transcripts",
        "profiles",
        "credit_transactions",
        "account_deletion_operations",
        "gap_analyses",
      ];
      const rowsArr = Array.isArray(rows) ? rows : [];
      const present = new Set(rowsArr.map((r) => r.table_name));
      const absent = expected.filter((name) => !present.has(name));
      if (absent.length) {
        console.error("FAIL: expected tables missing from public schema:", absent);
        process.exit(1);
      }
      const missing = rowsArr.filter(
        (r) => !r.rls_enabled || Number(r.policy_count) < 1,
      );
      if (missing.length) {
        console.error("FAIL: tables without RLS or policies:", missing);
        process.exit(1);
      }
      console.log(
        "OK: RLS enabled with policies on sessions/transcripts/profiles/credit_transactions/account_deletion_operations/gap_analyses",
      );
      if (userA && userB) {
        console.log(
          "OK: User A/B fixture keys present (QA_USER_A_EMAIL / QA_USER_B_EMAIL). Full cross-user matrix remains IMPLEMENTED_REQUIRES_EXTERNAL_OPS.",
        );
      } else {
        console.log(
          "NOTE: QA_USER_A_EMAIL / QA_USER_B_EMAIL not set — run npm run qa:seed-accounts for isolation fixtures. Full matrix remains IMPLEMENTED_REQUIRES_EXTERNAL_OPS.",
        );
      }
      process.exit(0);
    });
  },
);
req.on("error", (e) => {
  console.error(e);
  process.exit(1);
});
req.write(body);
req.end();
