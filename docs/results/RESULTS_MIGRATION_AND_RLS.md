# Results — Migration and RLS

## Migrations (results provenance)

| Migration | Purpose |
|-----------|---------|
| `20260904121000_scorecards_evaluation_status.sql` | Durable evaluation_status / eligibility_reason |
| `20260904120000_get_session_history.sql` | Normalized history RPC (Approach B) |
| `20260904160000_results_provenance_hardening.sql` | History evaluation_status gate; `evaluation_input_snapshot`; coding judge columns |

## History score gate

Interview scores in `get_session_history` require:

```text
scorecards.evaluation_status = 'completed' AND overall_score IS NOT NULL
```

Otherwise `score` is null; `result_label` may show Processing / Failed / eligibility reason. Never falls back to inventing from `sessions.overall_score`.

## RLS / authority

- Scorecards: owner select; writes via service role Edge
- `test_analyses`: written by Edge finalize RPC; clients read own rows
- `coding_submissions`: insert with `score IS NULL` for clients; scored rows via service role
- History RPC: `SECURITY DEFINER`, `auth.uid()` scoped

## Attempt lifecycle

Gov/assessment completion remains single-finalize via `claim_and_complete_test` — immutable analysis after success.
