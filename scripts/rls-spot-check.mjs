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
const envLocal = loadEnvFile(path.resolve(process.cwd(), ".env.local"));
const userA = process.env.QA_USER_A_EMAIL || qaLocal.QA_USER_A_EMAIL;
const userB = process.env.QA_USER_B_EMAIL || qaLocal.QA_USER_B_EMAIL;
const passA =
  process.env.QA_USER_A_PASSWORD ||
  qaLocal.QA_USER_A_PASSWORD ||
  process.env.QA_PRO_PASSWORD ||
  qaLocal.QA_PRO_PASSWORD;
const emailA =
  userA ||
  process.env.QA_PRO_EMAIL ||
  qaLocal.QA_PRO_EMAIL ||
  process.env.QA_FREE_EMAIL ||
  qaLocal.QA_FREE_EMAIL;
const supabaseUrl = (
  process.env.VITE_SUPABASE_URL ||
  envLocal.VITE_SUPABASE_URL ||
  qaLocal.QA_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const anonKey =
  process.env.VITE_SUPABASE_ANON_KEY ||
  envLocal.VITE_SUPABASE_ANON_KEY ||
  envLocal.VITE_SUPABASE_PUBLISHABLE_KEY ||
  qaLocal.QA_SUPABASE_ANON_KEY ||
  "";

const CORE_TABLES = [
  "sessions",
  "session_transcripts",
  "profiles",
  "credit_transactions",
  "account_deletion_operations",
  "gap_analyses",
];

const MFA_SECRET_TABLES = [
  "mfa_recovery_codes",
  "mfa_recovery_code_sets",
  "mfa_recovery_tokens",
  "mfa_security_events",
];

const ALL_TABLES = [...CORE_TABLES, ...MFA_SECRET_TABLES];

function managementQuery(query) {
  const body = JSON.stringify({ query });
  return new Promise((resolve, reject) => {
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
          resolve({ status: res.statusCode, body: data });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function isEmptyOrDenied(status, text) {
  if (status === 401 || status === 403 || status === 404) return true;
  if (status >= 400) {
    // permission denied / RLS / privilege errors — never treat as data leak
    if (
      /42501|permission denied|PGRST|not find the table|JWT/i.test(text)
    ) {
      return true;
    }
    return false;
  }
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.length === 0;
    if (parsed && typeof parsed === "object") {
      if (parsed.code === "42501") return true;
      if (/permission denied/i.test(String(parsed.message || ""))) return true;
    }
  } catch {
    return /permission denied|42501/i.test(text);
  }
  return false;
}

async function restGet(bearer, table) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/${table}?select=*&limit=5`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${bearer}`,
        Accept: "application/json",
      },
    },
  );
  const text = await res.text();
  return { status: res.status, text };
}

async function signIn(email, password) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  return {
    status: res.status,
    access: json.access_token || null,
    userId: json.user?.id || null,
    // Do not surface token/password material
    error: json.error_description || json.msg || json.error || null,
  };
}

async function probeMfaClientDenial(label, bearer) {
  const failures = [];
  for (const table of MFA_SECRET_TABLES) {
    const r = await restGet(bearer, table);
    if (!isEmptyOrDenied(r.status, r.text)) {
      failures.push({ table, status: r.status, kind: "leak_or_unexpected" });
    }
  }
  if (failures.length) {
    console.error(`FAIL: ${label} could read MFA secret tables:`, failures);
    return false;
  }
  console.log(`OK: ${label} MFA recovery tables empty/denied`);
  return true;
}

async function probeMfaReenrollmentGuard(access, userId) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ mfa_reenrollment_required: true }),
    },
  );
  const text = await res.text();
  let rows = null;
  try {
    rows = JSON.parse(text);
  } catch {
    rows = null;
  }
  const updated =
    res.status < 300 &&
    Array.isArray(rows) &&
    rows.some((r) => r && r.mfa_reenrollment_required === true);
  if (updated) {
    console.error(
      "FAIL: authenticated client updated profiles.mfa_reenrollment_required",
    );
    return false;
  }
  // Empty representation, 4xx, or server-managed exception all count as denied
  const denied =
    res.status >= 400 ||
    (Array.isArray(rows) && rows.length === 0) ||
    /server-managed|42501|permission denied/i.test(text);
  if (!denied) {
    console.error(
      "FAIL: unexpected response updating mfa_reenrollment_required",
      { status: res.status },
    );
    return false;
  }
  console.log(
    "OK: authenticated client cannot UPDATE profiles.mfa_reenrollment_required",
  );
  return true;
}

async function main() {
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
    ${ALL_TABLES.map((t) => `'${t}'`).join(",\n    ")}
  )
GROUP BY c.relname
ORDER BY c.relname;
`;

  const { status, body } = await managementQuery(query);
  console.log(JSON.stringify({ status, body }, null, 2));
  if (status >= 300) process.exit(1);

  let rows;
  try {
    rows = JSON.parse(body);
  } catch {
    process.exit(1);
  }

  const rowsArr = Array.isArray(rows) ? rows : [];
  const present = new Set(rowsArr.map((r) => r.table_name));
  const absent = ALL_TABLES.filter((name) => !present.has(name));
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
    "OK: RLS enabled with policies on core + MFA recovery tables",
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

  let ok = true;

  if (!supabaseUrl || !anonKey) {
    console.log(
      "NOTE: VITE_SUPABASE_URL / anon key missing — skipped REST client denial probes for MFA tables.",
    );
  } else {
    ok = (await probeMfaClientDenial("anon", anonKey)) && ok;

    if (emailA && passA) {
      const auth = await signIn(emailA, passA);
      if (!auth.access || !auth.userId) {
        console.log(
          "NOTE: authenticated sign-in failed — skipped JWT MFA denial + mfa_reenrollment_required probes",
          { status: auth.status, error: auth.error },
        );
      } else {
        ok = (await probeMfaClientDenial("authenticated", auth.access)) && ok;
        ok = (await probeMfaReenrollmentGuard(auth.access, auth.userId)) && ok;
      }
    } else {
      console.log(
        "NOTE: QA user email/password not set — skipped authenticated MFA denial + mfa_reenrollment_required probes",
      );
    }
  }

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
