# Government Exam — generation and worker report

## Durable job model

- Create reserves credits and enqueues `gov_paper_generation_jobs` (idempotent via `idempotencyKey`).
- Client stores `{ jobId, examId, userId, config }` in `localStorage` (`saveActivePaperJob`).
- Generate page restores from `?jobId=` or stored job and polls `get-paper-generation-job`.
- Hub surfaces an in-flight job banner → `/app/mock-test/generate?jobId=…`.

## Poll honesty (client)

| Event | Behavior |
|-------|----------|
| Durable terminal (`completed` / `failed_*` / `cancelled`) | Trust server; navigate or show Retry |
| Client wall-clock / max polls | Soft exit with `GENERATION_STILL_RUNNING` — **keep last non-terminal status** |
| Soft exit | No `failed_retryable` invention; **do not** cancel job / refund credits |
| UI | “Continue waiting” resumes polling |

Only durable job status may imply credit finalization or permanent fail.

## Availability snapshot

1. `check-exam-paper-availability` returns `availabilitySnapshotId` (= request `correlationId`) plus `inventorySource` (`python_authoritative` preferred when healthy, else `canonical_rpc`).
2. Generate Review shows inventory source + short snapshot id.
3. `create-exam-paper` accepts `availabilitySnapshotId` and stamps it on `inventory_snapshot` as `availability_snapshot_id` / `review_snapshot_id` so Review and Generate cite the same preflight.

Create still re-counts inventory at enqueue time (authoritative for charge); the snapshot id is the shared audit link between the two screens.

## Progress %

Show numeric progress only when the job reports measurable progress. Otherwise use indeterminate stage labels from `PAPER_JOB_STAGE_LABEL` / UI FSM (`QUEUED` → `GENERATING` → `VALIDATING` → `READY`).

## Worker / Edge notes

- Prefer Python availability + paper factory when configured and healthy.
- Edge assembler is the fast path / fallback; UI must not show contradictory bank counts between Review and Generate for the same snapshot.
- Undeployed Edge/Python is a **Blocked** environment issue (blackbox BLK-EDGE), not a product Fail for “page opened”.
