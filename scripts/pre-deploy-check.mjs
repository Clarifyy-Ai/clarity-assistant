#!/usr/bin/env node
/**
 * Pre-deploy validation — run before db push / edge deploy.
 * Checks migrations exist, edge function inventory, and optional CLI auth.
 *
 * Usage: node scripts/pre-deploy-check.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const REQUIRED_MIGRATIONS = [
  "20260525120000_admin_production_fixes.sql",
  "20260525140000_page_audit_grants.sql",
  "20260525160000_seed_starter_mock_questions.sql",
  "20260525161000_storage_documents_bucket.sql",
  "20260527000000_revoke_increment_profile_credits.sql",
  "20260527000001_pg_trgm_extensions_schema.sql",
  "20260527120000_revoke_credit_transactions_client_insert.sql",
  "20260628120001_session_ai_enforcement.sql",
  "20260628130000_production_hardening.sql",
  "20260628131000_ai_usage_monitoring.sql",
  "20260628140000_debrief_stripe_idempotency.sql",
  "20260628150000_billing_razorpay_offers_referrals.sql",
  "20260628160000_refund_credits_service_role.sql",
  "20260628161000_public_share_token_rls.sql",
  "20260628161500_check_free_tier_limits_auth_guard.sql",
  "20260628162000_audit_logs_baseline.sql",
  "20260628163000_fix_questions_index.sql",
  "20260628164000_ai_usage_logs_rls_fix.sql",
  "20260628165000_retention_cron_jobs.sql",
  // Sep-2026 QA wave (gov credits, answer persistence, email gate, session RLS)
  "20260902120000_email_verification_server_gate.sql",
  "20260902120100_start_session_expire_hardening.sql",
  "20260902120200_record_quiz_progress.sql",
  "20260902140000_company_research_jobs.sql",
  "20260902210000_assessment_response_write_rls.sql",
  "20260902220000_answer_persistence_lifecycle.sql",
  "20260902220100_help_articles_inr_credit_parity.sql",
  "20260902230000_release_gov_paper_credits_fail_closed.sql",
  "20260902231000_gov_paper_atomic_enqueue_and_sweeper.sql",
  "20260902240000_attempt_submission_lifecycle.sql",
  "20260902260000_session_artifact_session_ownership_rls.sql",
  "20260902280000_session_debriefs_session_user_unique.sql",
];

const SCRAPER_MIGRATION_PREFIX = "20260614015211_";

const REQUIRED_EDGE_FUNCTIONS = [
  "bulk-import-questions",
  "deepgram-token",
  "generate-hint",
  "generate-answer",
  "generate-debrief",
  "generate-questions",
  "select-test-questions",
  "parse-resume",
  "prep-tool",
];

/** Edge functions that must import session enforcement helpers. */
const AI_ENFORCEMENT_FUNCTIONS = [
  "generate-hint",
  "generate-answer",
  "generate-debrief",
];

const SESSION_ENFORCEMENT_MARKERS = [
  "sessionEnforcement",
  "enforceAiSessionAccess",
  "isSessionTypeAllowedForAi",
];

const REQUIRED_SECRETS = [
  "GEMINI_API_KEY",
  "DEEPGRAM_API_KEY",
  "DEEPGRAM_PROJECT_ID",
  "SYSTEM_USER_ID",
  "ALLOWED_ORIGINS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  // Required for Edge → Render HMAC (gov exams, docs, coach hybrid).
  "DOCUMENT_INTELLIGENCE_AUTH_SECRET",
  // At least one Python base URL must be present (checked separately below).
];

let failed = false;

console.log("\nPre-deploy check\n────────────────");

const migDir = path.join(root, "supabase", "migrations");
for (const name of REQUIRED_MIGRATIONS) {
  const exists = fs.existsSync(path.join(migDir, name));
  console.log(`  ${exists ? "OK" : "MISSING"}  migration ${name}`);
  if (!exists) failed = true;
}

const scraperMig = fs
  .readdirSync(migDir)
  .find((f) => f.startsWith(SCRAPER_MIGRATION_PREFIX));
if (scraperMig) {
  console.log(`  OK     scraper migration ${scraperMig}`);
} else {
  console.log(`  MISSING  scraper migration ${SCRAPER_MIGRATION_PREFIX}*`);
  failed = true;
}

const auditLogsMigPath = path.join(
  migDir,
  "20260628162000_audit_logs_baseline.sql",
);
if (fs.existsSync(auditLogsMigPath)) {
  const auditSql = fs.readFileSync(auditLogsMigPath, "utf8");
  const hasTable = /CREATE TABLE IF NOT EXISTS public\.audit_logs/i.test(auditSql);
  const hasComment = /COMMENT ON TABLE public\.audit_logs/i.test(auditSql);
  if (hasTable && hasComment) {
    console.log("  OK     audit_logs baseline migration (table + comment)");
  } else {
    console.log(
      "  MISSING  audit_logs migration must CREATE TABLE audit_logs and COMMENT ON TABLE",
    );
    failed = true;
  }
} else {
  console.log("  MISSING  audit_logs baseline migration file");
  failed = true;
}

const fnDir = path.join(root, "supabase", "functions");
const fnNames = fs
  .readdirSync(fnDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name);

console.log(`  OK     ${fnNames.length} edge function directories`);

for (const slug of REQUIRED_EDGE_FUNCTIONS) {
  const exists = fnNames.includes(slug);
  console.log(`  ${exists ? "OK" : "MISSING"}  edge function ${slug}`);
  if (!exists) failed = true;
}

const sharedEnforcement = path.join(
  fnDir,
  "_shared",
  "sessionEnforcement.ts",
);
if (fs.existsSync(sharedEnforcement)) {
  console.log("  OK     _shared/sessionEnforcement.ts");
} else {
  console.log("  MISSING  _shared/sessionEnforcement.ts");
  failed = true;
}

for (const slug of AI_ENFORCEMENT_FUNCTIONS) {
  const indexPath = path.join(fnDir, slug, "index.ts");
  if (!fs.existsSync(indexPath)) {
    console.log(`  MISSING  ${slug}/index.ts (enforcement check skipped)`);
    failed = true;
    continue;
  }
  const source = fs.readFileSync(indexPath, "utf8");
  const hasEnforcement = SESSION_ENFORCEMENT_MARKERS.some((m) =>
    source.includes(m),
  );
  console.log(
    `  ${hasEnforcement ? "OK" : "MISSING"}  ${slug} session enforcement import`,
  );
  if (!hasEnforcement) failed = true;
}

// Optional: verify Supabase CLI is authenticated
try {
  execSync("npx supabase projects list", {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  console.log("  OK     Supabase CLI authenticated");
} catch {
  console.log(
    "  WARN   Supabase CLI not authenticated — run: npx supabase login && npx supabase link",
  );
}

console.log(
  "\nRequired Supabase secrets (Dashboard → Project Settings → Edge Functions):",
);
for (const s of REQUIRED_SECRETS) {
  console.log(`  - ${s}`);
}
console.log(
  "  - PYTHON_SERVICE_URL (or SCRAPER_URL / GOV_EXAM_PYTHON_URL) — FastAPI base URL",
);
console.log(
  "  NOTE: DOCUMENT_INTELLIGENCE_AUTH_SECRET must match Render clarity-scraper env exactly.",
);

console.log(
  "\nOptional secrets (required for Pro multi-model routing):",
);
for (const s of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) {
  console.log(`  - ${s}`);
}

console.log("\nRecommended secrets (warn only — missing does not fail this check):");
console.log(
  "  - ALLOW_ELECTRON_NULL_ORIGIN — set to true so Electron desktop (file:// / null origin) CORS requests are allowed; cors.ts already defaults true if unset",
);

console.log("\nCommands:");
console.log("  npm run validate-env");
console.log("  npx supabase db push");
console.log("  node scripts/deploy-all-edge-functions.mjs");
console.log(
  "  SUPABASE_URL=... ANON_KEY=... bash scripts/smoke-edge.sh\n",
);

process.exit(failed ? 1 : 0);
