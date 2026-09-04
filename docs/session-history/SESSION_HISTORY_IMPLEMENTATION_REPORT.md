# Session History — Implementation Report

## Root causes (pre-fix)

1. History UI queried only `public.sessions` with client-side type/search filters.
2. Gov exams, assessments (`mock_tests`), practice workspace, and coding submissions were invisible.
3. Hard caps (20/500) masqueraded as totals; soft-delete mismatch vs dashboard.
4. Debrief links often used `session.id` instead of `session_debriefs.id`.

## Canonical model

**Approach B** — `get_session_history` RPC normalizes existing tables (no duplicate write table).

## Files changed (primary)

| Area | Paths |
|------|-------|
| Docs | `docs/session-history/SESSION_HISTORY_*.md` |
| Migration | `supabase/migrations/20260904120000_get_session_history.sql` |
| Types | `src/integrations/supabase/types.ts` (`get_session_history`) |
| Contract | `src/lib/session/sessionHistoryTypes.ts`, `sessionHistoryApi.ts`, `sessionHistoryFilters.ts`, `sessionCountPolicy.ts` |
| UI | `src/pages/app/sessions/CallSessions.tsx` |
| Detail | `src/pages/app/sessions/SessionDetail.tsx` (debrief id) |
| Dashboard | `src/hooks/useDashboardData.ts`, `src/pages/app/Dashboard.tsx` |
| Tests | `src/test/lib/session/sessionHistoryFilters.test.ts`, `e2e/session-history.spec.ts` |
| Blackbox | `scripts/blackbox_qa/cases_c.py` (TC-SES-001…006) |

## Deploy note

Apply migration to the target Supabase project before relying on the RPC in production. Until deployed, dashboard recent falls back to interview-only list.
