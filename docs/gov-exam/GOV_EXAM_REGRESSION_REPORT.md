# GOV_EXAM_REGRESSION_REPORT

**Date:** 2026-09-05  
**Scope:** Government Exam end-to-end recovery (redirect, inventory, route FSM)

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Dashboard redirect root cause | **Fixed in code** | Onboarding/MFA returnTo in URL |
| Route resolution FSM | **Added** | `routeResolution.ts` + `GovExamRouteState` |
| Inventory single source | **Fixed** | RPC v2 + retire RPC skip for public_pyp |
| Python override official/PYQ | **Fixed** | create-exam-paper aligned with availability |
| Vitest gov-exam + RLS | **Pass** | 298 tests |
| Playwright gov-exam | **Partial** | 10/20 pass — flaky/hydration |
| Hybrid vitest contracts | **Fail** | Pre-existing hybrid wave (unrelated files) |
| Hybrid pytest gov | **Pass** | 47 tests including credit compensation |

## Files modified

| File | Why |
|------|-----|
| `src/components/layout/ProtectedRoute.tsx` | Preserve generate deep link through onboarding/MFA |
| `src/lib/gov-exam/routeResolution.ts` | Central route FSM + error classification |
| `src/components/gov-exam/GovExamRouteState.tsx` | Shared in-place failure UI |
| `src/pages/app/mock-test/GovExamDetail.tsx` | Classify load errors without hub bounce |
| `src/pages/app/mock-test/GovExamGenerateJobRedirect.tsx` | Job id URL alias |
| `src/App.tsx` | Register generate/job/:jobId route |
| `supabase/functions/_shared/govQuestionInventory.ts` | RPC-only inventory |
| `supabase/functions/create-exam-paper/index.ts` | No Python override for official_previous |
| `supabase/migrations/20260905140000_*.sql` | public_pyp RPC fix |
| Tests + 10 deliverable docs | Evidence and contracts |

## Preserved behavior

- India region in-page block (no silent dashboard redirect)
- Credit reserve/finalize/release RPCs unchanged
- Session/results in-place not-found (no hub auto-navigate)
- `/app/mock-test/*` path names unchanged

## Recommended follow-up

1. Apply DB migration on staging/production
2. Re-run Playwright with dedicated CI worker
3. Complete 28-step manual UAT on staging URL
4. Regenerate Supabase types after migration apply
