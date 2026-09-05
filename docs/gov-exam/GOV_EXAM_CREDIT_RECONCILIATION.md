# GOV_EXAM_CREDIT_RECONCILIATION

## Flow

```
Validate configuration
  → check availability (billable: false)
  → enqueue_gov_paper_job (atomic deduct + insert job, credits_reserved)
  → Execute job
  → completed → finalize_gov_paper_credits (poll side-effect)
  → failed_permanent / cancelled / expired → release_gov_paper_credits (fail-closed)
```

## RPCs

| RPC | Purpose |
|-----|---------|
| `get_spendable_credits` | Preflight |
| `enqueue_gov_paper_job` | Reserve + insert (idempotent key) |
| `finalize_gov_paper_credits` | On completed |
| `release_gov_paper_credits` | Refund on terminal failure |
| `sweep_gov_paper_jobs` | Cron stuck-job expiry + refund |

## Never charge for

- Search, exam details, availability check
- Invalid configuration / exam not found
- Official/PYQ content insufficiency (blocked before enqueue)
- Duplicate generate (same idempotency key → replay)
- Polling, refresh, 404/409/429/5xx on read paths
- Cancelled / validation-failed / worker timeout (refund attempted)
- Client poll soft timeout (`GENERATION_STILL_RUNNING`)

## Client gate

`govExamCreditGate.ts` — block Generate before job creation when balance unknown or insufficient.

Cost: `creditCost("create_mock_test")` from server catalogue.

## Verification

- `src/test/lib/edge/govExamCreditContracts.test.ts`
- `scraper/tests/test_paper_credit_compensation.py`
- `claimJobCredits.ts` — all refunds via `release_gov_paper_credits`

See: `docs/gov-exam/GOV_EXAM_CREDIT_LEDGER_REPORT.md`
