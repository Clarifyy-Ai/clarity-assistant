# GOV_EXAM_END_TO_END_TEST_EVIDENCE

## Automated runs (2026-09-05, local)

| Suite | Command | Result | Exit |
|-------|---------|--------|------|
| Gov-exam unit/lib | `npm run test:run -- src/test/lib/gov-exam/` | **260 passed** | 0 |
| Onboarding recovery | `onboardingGovExamRecovery.test.ts` | **6 passed** | 0 |
| RLS matrix | `rlsMatrix.test.ts` | **16 passed** | 0 |
| Route resolution (new) | `routeResolution.test.ts` | **7 passed** | 0 |
| Redirect contract | `govExamRedirectContract.test.ts` | **3 passed** | 0 |
| Edge credit/lifecycle | `govExamCreditContracts`, `govPaperLifecycleContracts` | **22 passed** | 0 |
| Scoring / autosave | `mockTestScoring`, `TestSession.autosaveRace` | **16 passed** | 0 |
| Playwright gov-exam | `e2e/gov-exam-*.spec.ts` | **10 passed / 10 failed** | 1 |
| Hybrid suite | `npm run test:hybrid` | Vitest hybrid contracts **failed**; pytest **47 passed** | 1 |

## Code changes covered by tests

- `ProtectedRoute` onboarding/MFA `pathWithReturnTo` — `routeResolution.test.ts` source contract
- `routeResolution.ts` FSM — unit tests for auth phase + error classification
- Inventory RPC v2 migration — `govExamCreditContracts.test.ts` (existing); apply migration on target DB before live parity
- `create-exam-paper` official_previous Python skip — lockstep with `check-exam-paper-availability`

## Playwright failures (local, needs triage)

Failures in generation/search/session specs — mostly wizard hydration timing and submit confirm dialog (see `test-results/` screenshots). **Not dashboard redirect regressions.** Re-run after stable dev server:

```bash
npm run test:e2e -- e2e/gov-exam-generation.spec.ts
```

## Manual acceptance (Section 28)

| Step | Local | Staging | Production |
|------|-------|---------|------------|
| 1–10 Generate no dashboard redirect | Pending UAT | Pending | Pending |
| 11–14 Job + credits | Pending DB + Edge | Pending | Pending |
| 15–22 Attempt lifecycle | Partial (unit) | Pending | Pending |
| 23–27 Revision/analytics/history | Pending | Pending | Pending |
| 28 User B isolation | RLS unit pass | Pending | Pending |

## Environment blockers

- Apply migration `20260905140000_gov_exam_inventory_public_pyp_fix.sql` on Supabase
- Deploy edge functions + Python worker for live generation (BLK-EDGE / BLK-PY)
- Fix `search-exams` availability on target env (RC-SEARCH-EXAMS-API)

See: `GOV_EXAM_REGRESSION_REPORT.md`, `GOV_EXAM_PRODUCTION_CERTIFICATION.md`
