# CAREER_PILOT_DATABASE_AND_RLS_COMPLETION

## Migrations this pass

- `supabase/migrations/20260904180000_assessment_response_rls_reaffirm.sql` — response select/insert/update ownership; no broad ALL

## Prior foundation (unchanged)

- Session history RPC coverage: interview / mock_tests / practice_workspace / coding  
- Scorecard `evaluation_status`  
- Credit atomic RPCs / gov release fail-closed  

## Types drift

| Object | In migrations | In `types.ts` |
|--------|---------------|---------------|
| `evaluation_status` on scorecards | Yes | Yes |
| `assessment_context_snapshots` | Yes | **Missing** |
| `referral_programmes` (+ related) | Yes | **Missing** |

**Action required:** Apply pending migrations in target env → `npm run supabase:gen` → commit types.

## RLS

User A/B live probes: **not executed this pass** → cannot claim RUNTIME_VERIFIED isolation.

**Final:** Schema remediation PARTIAL; types regen BLOCKED_BY_CONFIGURATION; RLS live probes BLOCKED.
