# Session History — Migration and RLS

## Migration

File: `supabase/migrations/20260904120000_get_session_history.sql`

- Additive indexes on `sessions`, `mock_tests`, `practice_workspace_sessions`, `coding_submissions`
- `SECURITY DEFINER` function `get_session_history(...)` returns jsonb envelope
- `REVOKE` from `PUBLIC`/`anon`; `GRANT EXECUTE` to `authenticated`
- Owner filter: `auth.uid()` only (client cannot pass another user id)
- Soft-delete: `sessions.deleted_at IS NULL`
- Scores: left joins; **never** `COALESCE(score, 0)` for display fields

## RLS

Base table RLS unchanged. The RPC is DEFINER and must only select rows where `user_id = auth.uid()`.

Isolation expectations:

| Case | Expected |
|------|----------|
| User A lists history | Only A’s rows |
| User B opens A’s `/app/sessions/:id` | `get_owned_session_detail` NOT_FOUND |
| Tampered cursor | `INVALID_CURSOR` or empty next page for own data only |
| Logged out | `NOT_AUTHENTICATED` envelope |

## Rollback

`DROP FUNCTION public.get_session_history(...);` and drop the four indexes if needed. No data mutation.
