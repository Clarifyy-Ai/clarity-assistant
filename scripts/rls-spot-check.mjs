#!/usr/bin/env node
import https from "node:https";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN required");
  process.exit(1);
}

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
    'credit_transactions'
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
      const missing = (Array.isArray(rows) ? rows : []).filter(
        (r) => !r.rls_enabled || Number(r.policy_count) < 1,
      );
      if (missing.length) {
        console.error("FAIL: tables without RLS or policies:", missing);
        process.exit(1);
      }
      console.log("OK: RLS enabled with policies on sessions/transcripts/profiles/credit_transactions");
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
