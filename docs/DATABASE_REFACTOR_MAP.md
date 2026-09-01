# Career Pilot — database.ts decomposition map

Incremental refactor only. Do not big-bang rewrite.

## Current

- `src/lib/supabase/database.ts` (~2,200 lines) — god module facade

## Target modules

| Module | Responsibility |
|--------|----------------|
| `database/client.ts` | Shared query helper, timeouts |
| `database/errors.ts` | DatabaseError / ErrorCode |
| `database/profiles.ts` | profilesDB |
| `database/sessions.ts` | sessionsDB, answers, debriefs |
| `database/credits.ts` | creditsDB (no direct deduct_credits RPC) |
| `database/billing.ts` | subscriptions / payment helpers |
| `database/mockTests.ts` | tests / questions |
| `database/prep.ts` | answer bank / prep artifacts |
| `database/sharing.ts` | share tokens |
| `database/admin.ts` | adminAnalyticsDB |
| `database/analytics.ts` | usage aggregates |
| `database/types.ts` | row aliases |

## Sequence

1. Extract errors + query helper (low risk)
2. Extract creditsDB + tests (billing-adjacent)
3. Extract sessions / mockTests
4. Re-export from `database.ts` for compatibility
5. Migrate callers module-by-module
6. Delete facade only when imports are zero

## Status (this sprint)

- Compatibility note added on `creditsDB.deduct` (throws; Edge Function only)
- Full extraction deferred to follow-up PRs to avoid risky rewrite mid-release
- No modules extracted yet; map remains the source of truth for post-beta work
