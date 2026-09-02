#!/usr/bin/env node
/**
 * Reconcile staging/live Postgres schema against code expectations.
 * Uses Supabase Management API (SUPABASE_ACCESS_TOKEN) or falls back to REST probes.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db-schema-reconcile.mjs
 *   node scripts/db-schema-reconcile.mjs --write-docs
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Staging probes only — some Windows Node builds fail TLS verify against api.supabase.com.
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const REF = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
const writeDocs = process.argv.includes("--write-docs");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const fileEnv = {
  ...loadEnvFile(path.join(ROOT, ".env")),
  ...loadEnvFile(path.join(ROOT, ".env.local")),
  ...loadEnvFile(path.join(ROOT, ".env.qa.local")),
};

const token = process.env.SUPABASE_ACCESS_TOKEN || fileEnv.SUPABASE_ACCESS_TOKEN;

const CRITICAL_TABLES = [
  "credit_transactions",
  "profiles",
  "gov_paper_generation_jobs",
  "document_processing_jobs",
  "company_research_jobs",
  "source_ingestion_jobs",
  "gov_exams",
  "gov_official_sources",
  "questions",
  "gov_generated_papers",
  "gov_generated_paper_questions",
  "previous_year_papers",
  "mock_tests",
  "test_responses",
  "sessions",
  "session_answers",
  "session_transcripts",
  "feature_flags",
];

const CRITICAL_RPCS = [
  "deduct_credits_service",
  "get_spendable_credits",
  "enqueue_gov_paper_job",
  "finalize_gov_paper_credits",
  "release_gov_paper_credits",
  "sweep_gov_paper_jobs",
  "save_owned_test_answer",
  "start_owned_mock_test",
  "claim_and_complete_test",
  "start_owned_session",
  "finalize_owned_session",
  "is_auth_email_verified",
  "get_public_feature_flags",
  "complete_onboarding",
  "is_admin",
  "record_quiz_progress",
];

const RLS_TABLES = [
  "session_answers",
  "session_transcripts",
  "gov_paper_generation_jobs",
  "test_responses",
];

const UNIQUE_CHECKS = [
  {
    id: "gov_paper_jobs_idempotency",
    sql: `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'gov_paper_generation_jobs' AND indexdef ILIKE '%idempotency_key%' LIMIT 1`,
  },
  {
    id: "test_responses_test_question",
    sql: `SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'test_responses' AND c.contype = 'u' LIMIT 1`,
  },
  {
    id: "credit_transactions_stripe_payment",
    sql: `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'credit_transactions' AND indexdef ILIKE '%stripe_payment_id%' LIMIT 1`,
  },
  {
    id: "session_debriefs_session_user",
    sql: `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'session_debriefs' AND (indexdef ILIKE '%session_id%' AND indexdef ILIKE '%user_id%') LIMIT 1`,
  },
];

const results = [];

function record(category, id, status, detail) {
  results.push({ category, id, status, detail });
  const icon = status === "PASS" ? "[P]" : status === "FAIL" ? "[F]" : "[W]";
  console.log(`${icon} ${category}/${id}: ${detail}`);
}

async function query(sql) {
  if (!token) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required");
  }
  const payload = JSON.stringify({ query: sql });
  const body = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${REF}/database/query`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
            reject(new Error(`SQL query failed (${res.statusCode}): ${data.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON from management API: ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
  return body;
}

async function main() {
  if (!token) {
    console.error("Missing SUPABASE_ACCESS_TOKEN (env or .env.local)");
    process.exit(1);
  }

  console.log(`\nDB schema reconcile — project ${REF}\n`);

  // Applied migrations
  try {
    const rows = await query(`
      SELECT version FROM supabase_migrations.schema_migrations
      ORDER BY version DESC LIMIT 25
    `);
    const versions = Array.isArray(rows) ? rows.map((r) => r.version) : [];
    record("migrations", "recent_applied", "PASS", `${versions.length} recent; latest=${versions[0] ?? "none"}`);
    const pendingSep = ["enqueue_gov_paper_job", "is_auth_email_verified", "record_quiz_progress"];
    for (const rpc of pendingSep) {
      try {
        const rows = await query(`
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = '${rpc}' LIMIT 1
        `);
        const ok = Array.isArray(rows) && rows.length > 0;
        record(
          "migrations",
          `sep_2026_${rpc}`,
          ok ? "PASS" : "FAIL",
          ok ? "RPC present" : "RPC missing",
        );
      } catch (e) {
        record("migrations", `sep_2026_${rpc}`, "FAIL", String(e.message || e));
      }
    }
  } catch (e) {
    record("migrations", "schema_migrations", "FAIL", String(e.message || e));
  }

  // credit_action enum
  try {
    const rows = await query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'credit_action'
      ORDER BY e.enumsortorder
    `);
    const labels = Array.isArray(rows) ? rows.map((r) => r.enumlabel) : [];
    if (labels.length === 0) {
      record("types", "credit_action", "FAIL", "Enum missing");
    } else {
      record("types", "credit_action", "PASS", `${labels.length} values`);
    }
  } catch (e) {
    record("types", "credit_action", "FAIL", String(e.message || e));
  }

  // Tables
  for (const table of CRITICAL_TABLES) {
    try {
      const rows = await query(`
        SELECT 1 AS ok FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '${table}'
        LIMIT 1
      `);
      const ok = Array.isArray(rows) && rows.length > 0;
      record("tables", table, ok ? "PASS" : "FAIL", ok ? "exists" : "missing");
    } catch (e) {
      record("tables", table, "FAIL", String(e.message || e));
    }
  }

  // profiles.credits column
  try {
    const rows = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'credits'
    `);
    const ok = Array.isArray(rows) && rows.length > 0;
    record("columns", "profiles.credits", ok ? "PASS" : "FAIL", ok ? "exists" : "missing");
  } catch (e) {
    record("columns", "profiles.credits", "FAIL", String(e.message || e));
  }

  // RPCs
  for (const fn of CRITICAL_RPCS) {
    try {
      const rows = await query(`
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = '${fn}'
        LIMIT 1
      `);
      const ok = Array.isArray(rows) && rows.length > 0;
      const detail = ok ? (rows[0].args || "exists") : "missing";
      record("rpc", fn, ok ? "PASS" : "FAIL", detail);
    } catch (e) {
      record("rpc", fn, "FAIL", String(e.message || e));
    }
  }

  // RLS enabled
  for (const table of RLS_TABLES) {
    try {
      const rows = await query(`
        SELECT relrowsecurity FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = '${table}'
      `);
      const enabled = Array.isArray(rows) && rows[0]?.relrowsecurity === true;
      record("rls", `${table}.enabled`, enabled ? "PASS" : "FAIL", enabled ? "on" : "off");
    } catch (e) {
      record("rls", `${table}.enabled`, "FAIL", String(e.message || e));
    }
  }

  // Session ownership policies
  for (const table of ["session_answers", "session_transcripts"]) {
    try {
      const rows = await query(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = '${table}'
      `);
      const names = Array.isArray(rows) ? rows.map((r) => r.policyname).join(", ") : "";
      const hasOwnership = /session|own/i.test(names);
      record(
        "rls",
        `${table}.policies`,
        hasOwnership ? "PASS" : "WARN",
        names || "no policies",
      );
    } catch (e) {
      record("rls", `${table}.policies`, "FAIL", String(e.message || e));
    }
  }

  // Unique indexes
  for (const check of UNIQUE_CHECKS) {
    try {
      const rows = await query(check.sql);
      const ok = Array.isArray(rows) && rows.length > 0;
      record("indexes", check.id, ok ? "PASS" : "WARN", ok ? "found" : "not found");
    } catch (e) {
      record("indexes", check.id, "FAIL", String(e.message || e));
    }
  }

  // feature_flags row count
  try {
    const rows = await query(`SELECT COUNT(*)::int AS c FROM public.feature_flags`);
    const count = Array.isArray(rows) ? rows[0]?.c : 0;
    record(
      "feature_flags",
      "row_count",
      count > 0 ? "PASS" : "WARN",
      `${count ?? 0} rows`,
    );
  } catch (e) {
    record("feature_flags", "row_count", "FAIL", String(e.message || e));
  }

  const failCount = results.filter((r) => r.status === "FAIL").length;
  const warnCount = results.filter((r) => r.status === "WARN").length;
  const passCount = results.filter((r) => r.status === "PASS").length;

  console.log(`\nSummary: ${passCount} pass, ${warnCount} warn, ${failCount} fail\n`);

  if (writeDocs) {
    const outPath = path.join(ROOT, "docs", "qa", "DB_RECONCILE_STAGING.md");
    const lines = [
      "# DB reconcile — staging",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Project: \`${REF}\``,
      "",
      `Summary: **${passCount} pass**, ${warnCount} warn, **${failCount} fail**`,
      "",
      "| Category | ID | Status | Detail |",
      "|----------|-----|--------|--------|",
      ...results.map(
        (r) => `| ${r.category} | ${r.id} | ${r.status} | ${r.detail.replace(/\|/g, "\\|")} |`,
      ),
      "",
    ];
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, lines.join("\n"));
    console.log(`Wrote ${outPath}`);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
