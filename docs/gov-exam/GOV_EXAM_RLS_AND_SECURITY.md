# GOV_EXAM_RLS_AND_SECURITY

## Protected resources

| Table / RPC | Owner column | Policy |
|-------------|--------------|--------|
| `gov_paper_generation_jobs` | `user_id` | Own rows only |
| `gov_generated_papers` | via job / user | Service + owner read |
| `mock_tests` | `user_id` | Own attempts |
| `test_responses` | via test | Own |
| `test_analyses` | `user_id` | Own |

Admin policies: staff role for gov admin routes under `/app/admin/gov/*`.

## Rules

- JWT is sole source of user id on all edge functions
- Browser cannot set owner, score, correct answer, credits, publication state
- User B direct URL to User A attempt/results → in-place not-found / access denied (no data leak)

## Tests

- `src/test/lib/security/rlsMatrix.test.ts` — jobs, mock_tests
- Manual: mutate IDs in URL, edge body owner fields, retry endpoints

## Migrations

See `docs/gov-exam/GOV_EXAM_MIGRATION_AND_RLS_REPORT.md`

No RLS weakening in this recovery.
