# Government Exam — migration and RLS report

## Attempt / results ownership

- `mock_tests`, `test_responses`, `test_analyses` are user-scoped via RLS (`user_id = auth.uid()`).
- Client loads always add `.eq("user_id", user.id)` as defense in depth; cross-user deep links show in-place not-found.

## Generation jobs

- `gov_paper_generation_jobs` owned by creating user; Edge functions use service role with explicit user checks on claim/get/cancel.
- Credit claim / refund tied to `job_id` (see `claimJobCredits` shared helper).

## Session History

- Migration `supabase/migrations/20260904120000_get_session_history.sql` exposes `get_session_history` RPC.
- Government attempts map to `detail_route = /app/mock-test/results/<id>` (assessments keep `/app/assessments/...`).
- **Deploy note:** RPC must be applied on the target Supabase project for live Session History.

## Inventory / papers

- Eligible inventory RPCs / views remain the source for availability counts.
- Frozen paper questions use playable/snapshot tables so attempt scoring does not depend on live bank edits.

## Ops checklist

1. Confirm gov exam migrations applied (registry, jobs, papers, inventory).
2. Confirm `get_session_history` present and granted to authenticated.
3. Confirm Edge functions deployed: `check-exam-paper-availability`, `create-exam-paper`, `get-paper-generation-job`, `start-exam`, `save-test-answer`, `submit-test`.
4. Confirm Python worker health when `python_authoritative` is expected.
