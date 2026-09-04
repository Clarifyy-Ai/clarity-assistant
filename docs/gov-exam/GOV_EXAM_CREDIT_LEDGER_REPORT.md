# Government Exam — credit ledger report

## When credits move

| Step | Charge? | Mechanism |
|------|---------|-----------|
| `check-exam-paper-availability` | Never | `billable: false`, `creditCost: 0` |
| `create-exam-paper` / topic practice | Reserve | Atomic enqueue + credit claim (`claimJobCredits`) |
| Job `completed` with paper | Finalize | Consume reserved credits |
| Job `failed_*` / `cancelled` / expire | Release | Refund / release reserved credits |
| Client poll soft-timeout (`GENERATION_STILL_RUNNING`) | **No** | Must not call cancel solely because the browser stopped polling |

## Honesty rules

- Insufficient credits → upgrade / top-up UX with real balance vs cost (`CREATE_EXAM_PAPER_CREDIT_COST`).
- Do not claim “insufficient credits” on worker/timeout failures when balance remains.
- Idempotent create replay returns the same `jobId` without double-charging.
- Hub “Resume generation” does not start a second charge.

## Audit fields

- Job `request_json.correlationId`
- `inventory_snapshot.availability_snapshot_id` when Review passed a snapshot id into Create
- Ledger / claim rows tied to `job_id` (see Edge `claimJobCredits` + migrations)

## QA proof points

- Note balance before Generate; after soft client poll exit, balance still reserved until durable terminal.
- Cancel from UI should refund when the server marks cancelled.
- Double-click Generate with same idempotency key → one job / one reserve.
