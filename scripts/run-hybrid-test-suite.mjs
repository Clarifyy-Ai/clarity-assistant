#!/usr/bin/env node
/**
 * Wave 0–2 hybrid contract test suite — TypeScript (Vitest) + Python (pytest).
 *
 * Usage:
 *   node scripts/run-hybrid-test-suite.mjs
 *   npm run test:hybrid
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const scraperRoot = path.join(root, "scraper");

const VITEST_FILES = [
  "src/test/lib/edge/hybridFallbackContracts.test.ts",
  "src/test/lib/edge/hybridFallbackRuntime.test.ts",
  "src/test/lib/edge/chaosFallback.test.ts",
  "src/test/lib/edge/hybridMigrationContracts.test.ts",
  "src/test/lib/edge/errorEnvelopes.test.ts",
  "src/test/lib/billing/creditErrorCodes.test.ts",
  "src/test/lib/billing/retiredBillingStubs.test.ts",
  "src/test/lib/ai/aiHubRouterFallback.test.ts",
  "src/test/lib/ai/practiceCoachAiHelp.test.ts",
  "src/test/lib/edge/gapCompanyMockHybrid.test.ts",
  "src/test/lib/edge/coachPrepHybrid.test.ts",
  "src/test/lib/edge/sessionsAiHybrid.test.ts",
  "src/test/lib/edge/ingestAdminAllowlists.test.ts",
  "src/test/lib/documents/documentJobLifecycle.test.ts",
];

const PYTEST_FILES = [
  "tests/test_paper_credit_compensation.py",
  "tests/test_paper_bank_fail_closed.py",
  "tests/test_gov_validate_questions_wiring.py",
  "tests/test_document_intelligence.py",
  "tests/test_document_durable_jobs.py",
  "tests/test_hybrid_new_ops.py",
];

function run(label, cmd, args, cwd) {
  console.log(`\n── ${label} ──`);
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) {
    console.error(`${label} failed to start:`, result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

console.log("Hybrid contract test suite (Wave 0–2)");

const vitestExit = run(
  "Vitest (131 contract tests)",
  "npx",
  ["vitest", "run", ...VITEST_FILES],
  root,
);

const pytestExit = run(
  "pytest (49 contract tests)",
  process.platform === "win32" ? "python" : "python3",
  ["-m", "pytest", ...PYTEST_FILES, "-v"],
  scraperRoot,
);

const ok = vitestExit === 0 && pytestExit === 0;
console.log(
  ok
    ? "\n✓ Hybrid contract suite passed (180 tests across 20 files)"
    : "\n✗ Hybrid contract suite failed",
);

process.exit(ok ? 0 : 1);
