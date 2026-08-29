import fs from "node:fs";

function load(p) {
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

const env = { ...load(".env.local"), ...load(".env") };
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
const qa = load(".env.qa.local");

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  console.log("---", sql.slice(0, 80), "status", r.status);
  console.log(typeof data === "string" ? data.slice(0, 2000) : JSON.stringify(data, null, 2).slice(0, 3000));
  return data;
}

await q(`
SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'deduct_credits_service';
`);

await q(`
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       r.rolname AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public' AND p.proname IN ('deduct_credits_service','is_service_role_request');
`);

// Simulate call as postgres (mgmt API runs as privileged)
await q(`
SELECT public.is_service_role_request() AS is_svc,
       current_user AS cu,
       current_setting('role', true) AS role_setting,
       current_setting('request.jwt.claim.role', true) AS jwt_role;
`);
