# Results — Production Certification

## Scope

Genuine results, scoring, and provenance hardening across interview scorecards, gov/assessment marks, coding scores, gap match display, and Session History.

## Deliverables checklist

| Doc | Path | Status |
|-----|------|--------|
| Source inventory | `docs/results/RESULTS_SOURCE_INVENTORY.md` | DONE |
| Data contract | `docs/results/RESULTS_DATA_CONTRACT.md` | DONE |
| Scoring / algorithms | `docs/results/RESULTS_SCORING_AND_ALGORITHMS.md` | DONE |
| AI validation policy | `docs/results/RESULTS_AI_VALIDATION_POLICY.md` | DONE |
| Python worker | `docs/results/RESULTS_PYTHON_WORKER_REPORT.md` | DONE |
| Edge functions | `docs/results/RESULTS_EDGE_FUNCTION_REPORT.md` | DONE |
| Migration / RLS | `docs/results/RESULTS_MIGRATION_AND_RLS.md` | DONE |
| Reconciliation | `docs/results/RESULTS_RECONCILIATION_REPORT.md` | DONE |
| Test evidence | `docs/results/RESULTS_TEST_EVIDENCE.md` | DONE |
| This certification | `docs/results/RESULTS_PRODUCTION_CERTIFICATION.md` | DONE |

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| No product UI path converts missing evidence into believable non-zero / default 50/75% | FIXED (unit contracts) |
| Gov marks Edge-deterministic; AI never sets `total_score` | FIXED |
| History / Detail / Results agree on scored vs not for fixtures | FIXED (history gate + resolveOverallScore); live recon PARTIAL until deploy |
| Ten `RESULTS_*.md` exist with honest FIXED / PARTIAL / deferred rows | FIXED |
| Vitest no-fake regressions green | FIXED (local) |
| Migration `20260904160000_results_provenance_hardening` applied on target DB | REQUIRED for production |
| Edge functions redeployed with algorithm + snapshot writes | REQUIRED for production |
| End-to-end User A/B browser matrix on live production | DEFERRED — blocks full GO_PRODUCTION |

## Explicitly deferred

- Immutable `result_versions` table for every surface
- Vendor invoice / AI cost as result provenance
- Replacing marketing demo animations
- Subjective scorecard becoming fully deterministic

## Release decision

**CONDITIONAL_GO_PRODUCTION**

Allowed only when:

1. Migration + Edge redeploy complete on the target environment, and
2. Unit suites above are green in CI, and
3. Spot reconciliation on one interview + one gov attempt confirms History/Results/Scorecard status agreement.

Otherwise **NO_GO**.

Full **GO_PRODUCTION** requires the User A/B live matrix documented in test evidence.

| Role | Name | Date | Result |
|------|------|------|--------|
| Engineering | | | CONDITIONAL_GO (code) |
| QA | | | |
| Release | | | |
