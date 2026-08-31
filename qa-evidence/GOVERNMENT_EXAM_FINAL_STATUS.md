# GOVERNMENT EXAM FINAL STATUS

PARTIALLY_COMPLETE

Code for Full Mock, Hybrid Realistic Mock, Official/Previous Year, and Custom Practice is wired in this repository. Official stays fail-closed (no AI fill). The runner uses server-authoritative `start-exam` / `save-test-answer` / `submit-test`. Live runtime on project `qzgvjrvtkwlzxpmlddkx` is **not** proven: migrations, Edge, and Python were not applied from this session (Edge upload then `TransportError`; `db push` needs the database password).

# EXAM REGISTRY

Implemented. `gov_exams`, aliases, stages, recruiting bodies, versioned pattern/syllabus, sections. Search + detail Edge functions read the registry. Frontend: MockTestHub, GovExamDetail, ExamSearchCombobox.

# SEARCH

Implemented. `search-exams` with debounce/abort/latest-wins. India profile resolved server-side (`resolveIsIndiaProfile`). Alias/partial match exists in code. **Live SEARCH proof: not run** (no deployed smoke).

# PATTERN

Implemented. Approved `gov_exam_pattern_versions` + `gov_exam_sections`. Full Mock `questionCount` = pattern `total_questions` (not clamped to Custom Practice min/max). Custom Practice uses `validateGovQuestionCount`.

# SYLLABUS

Implemented. Approved syllabus versions required on create. Missing approved syllabus → `SYLLABUS_NOT_AVAILABLE`, no charge.

# AVAILABILITY

Implemented (single snapshot). `check-exam-paper-availability` and `create-exam-paper` use the same inventory path: Python `compute_availability` when configured, otherwise Edge `countEligibleGovQuestions` (`publish_status=published`, `review_status=approved`). Snapshot persisted on the job (`inventory_snapshot`). Full Mock fail-closed when bank is short and AI fill is not allowed (`CONTENT_INSUFFICIENT`). Review vs Generate should no longer disagree on the `available` number **once deployed**.

# QUESTION BANK

Partial. Eligible questions are public + published + approved. Official/PYQ mode only accepts official_verified / approved PYQ sources. Ops historically showed partial SSC/UPSC/IBPS coverage — Custom Practice is the guaranteed playable path when Full Mock quotas are not met. **Live bank counts: not queried this session.**

# DEDUPLICATION

Implemented on the selected set. Python `validate_question_payloads` (`reject_near_duplicates=True`) + fingerprint/similarity in Edge `govPaperAssembly` / topic-practice. Deterministic, not AI-as-authority.

# QUALITY

Implemented on selected questions before persist. Python `CandidateValidator` / `score_assembled_question` + Edge `govQualityScore` / `pythonGovValidateQuestions`. Blueprint validation fails the job rather than padding invalid questions.

# BLUEPRINT

Implemented. Shared shape: Python `paper_factory.blueprint` (`EXACT_MODES` = official_previous, generated_mock) and Edge `govBlueprint`. Exact modes must fill pattern quotas or fail `CONTENT_INSUFFICIENT`. Custom Practice may reduce count.

# PAPER FACTORY

Unified. HTTP `/internal/gov-exams/process-job` and the embedded worker both call `process_gov_exam_job`. Parallel `factory.generate()` job path removed. Edge dispatch is ack-and-poll: short HTTP ping; timeout/409 keep Python owner; never tag `python_paper_factory` unless HTTP or `PAPER_FACTORY_WORKER` can claim; unreachable Python retags `edge_assembler`.

# AI

Optional fill for Realistic/Custom only. Schema → exam → topic → duplicate → quality → blueprint → persist. Never labeled Official PYQ. AI down → Python deterministic practice if mode allows. Still short → terminal `CONTENT_INSUFFICIENT` + credit release.

# PYTHON

File: `scraper/app/gov_exams/engine.py`  
Purpose: single hybrid processor (bank → optional AI → deterministic practice → validate → persist)  
Endpoint: used by POST `/internal/gov-exams/process-job`  
Caller: FastAPI route + embedded worker  
Deployment: `clarity-scraper` (`render.yaml`, `PAPER_FACTORY_EMBEDDED_WORKER=true`)  
Render: **not shipped this session**  
Business Runtime: `/internal/gov-exams/process-job` (not `/health`)  
Status: code complete; live `[GOV_EXAM] completed` log **not captured**

File: `scraper/app/paper_factory/worker.py`  
Purpose: claim next `gov_paper_generation_jobs` row and run `process_gov_exam_job`  
Endpoint: embedded loop, not HTTP  
Caller: Render web process when `PAPER_FACTORY_EMBEDDED_WORKER=true`  
Deployment: same scraper service  
Render: **not shipped**  
Business Runtime: DB lease + engine  
Status: credits stripped; no `refund_credits`

File: `scraper/app/routes/gov_exams.py`  
Purpose: availability, select, validate-questions, process-job (claim + background), build-paper  
Endpoint: `/internal/gov-exams/*`  
Caller: Edge `pythonGovExamClient`  
Deployment: same scraper  
Status: process-job returns `accepted=true` immediately

File: `scraper/app/gov_exams/availability.py`  
Purpose: canonical availability snapshot  
Endpoint: `/internal/gov-exams/availability`  
Caller: Edge check + create  
Status: code complete

# EDGE FUNCTIONS

Function: `create-exam-paper`  
Purpose: idempotent job insert, availability, reserve credits, ack Python or Edge assemble  
Caller: `GenerateGovPaper`  
Database: `gov_paper_generation_jobs`, `reserve_gov_paper_credits`  
Python: `pythonGovProcessJob` ack-and-poll  
AI: only if plan allows  
Credits: reserve after insert; never `credits_charged` before reserve  
Status: code complete; **not redeployed** (FunctionsApiTransportError)

Function: `check-exam-paper-availability`  
Purpose: same availability number as create; `can_full_mock` / `can_custom_practice`  
Caller: generate Review UI  
Database: inventory RPC/count  
Python: preferred when configured  
Credits: none  
Status: code complete; **not redeployed**

Function: `get-paper-generation-job`  
Purpose: owner poll; finalize on completed; release on failed/cancelled  
Caller: `pollPaperJobUntilTerminal`  
Credits: finalize/release RPCs  
Status: code complete; **not redeployed**

Function: `process-paper-generation-job`  
Purpose: one owner nudge / Edge assemble claim  
Caller: poller (max one nudge) + Retry  
Status: code complete; **not redeployed**

Function: `cancel-paper-generation-job`  
Purpose: cancel + `release_gov_paper_credits`  
Caller: generate UI  
Status: code complete; **not redeployed**

Function: `generate-topic-practice`  
Purpose: topic set from published+approved bank; reserve/finalize/release  
Caller: topic practice UI  
Status: bank filter unified to `publish_status`/`review_status`; **not redeployed**

Function: `start-exam-attempt`  
Purpose: server `started_at`/`expires_at`; India gate only when `config.gov_exam_id`  
Caller: `TestSession.handleStartTest`  
Status: new; deploy upload started then **FunctionsApiTransportError**

Function: `save-attempt-answer`  
Purpose: versioned autosave + mark-for-review; stale skip; `ATTEMPT_EXPIRED` / `SUBMISSION_CONFLICT`  
Caller: `TestSession.saveResponses`  
Status: new; **not deployed**

Function: `extract-question-paper`  
Purpose: admin PDF/OCR ingest; heavy PDF → 202 queued + `waitUntil`; `is_public=false`, `needs_review`  
Caller: AdminGovIngest  
Status: async path in code; **not redeployed**

Function: `submit-test`  
Purpose: server scoring, duplicate submit replay  
Caller: TestSession  
Status: existing; not re-proven live

Function: `search-exams` / `get-exam-details` / `get-exam-pattern` / `get-exam-syllabus`  
Purpose: registry discovery  
Status: existing; live proof not run

# GENERATION JOB

State machine: queued → leased/selecting/generating/validating/assembling → completed | failed_retryable | failed_permanent | cancelled | expired  
Lease: `govPaperJobLease`; Python-owned jobs not skipped forever; reclaim + release credits if no heartbeat  
Heartbeat: Python worker / process-job background  
Retry: `failed_retryable` keeps idempotency key; `failed_permanent` mints a new key  
Cancellation: Edge cancel + credit release  
Idempotency: unique `(user_id, idempotency_key)`; create 409/unique → replay 202, no second reservation  
Polling: 2s→15s backoff, JOB_POLL, 8 transient 429/409/5xx, stop on terminal including `failed_retryable`, one nudge max

# CREDITS

Reservation: `reserve_gov_paper_credits` after job insert (`credits_reserved`, `credits_charged=0`)  
Finalization: `finalize_gov_paper_credits` on completed + `mock_test_id`  
Refund: `release_gov_paper_credits` on fail/cancel/create catch — **Python never calls `refund_credits`**  
Duplicate protection: unique idempotency + reserve RPC claim flags  
**Live RPC evidence: not captured** (migrations not applied)

# RUNNER

Timer: server `started_at` / `expires_at` via `start-exam-attempt` (client no longer writes the clock)  
Palette: unanswered / answered / marked / answered+marked / current; restored from `test_responses` including `answer_version`  
Autosave: `save-attempt-answer` with versions; local recovery fallback on failure  
Review: mark-for-review in the same save payload  
Submit: existing `submit-test` + auto-submit on expiry  
Scoring: server-side  
Start Exam: navigates when `status=completed` and `mock_test_id` exists even if Full Mock count is short of pattern (toast, still start)

# RESULTS

Persistence: `mock_tests` + scored responses via submit-test  
History: existing mock-test history routes  
Analytics: unchanged (rank gated on cohort size)

# ADMIN

Ingest: `source_ingestion_jobs` queued first  
PDF: heavy base64 / storage-path PDFs return 202 + background `waitUntil`  
OCR: Gemini then Python `document_extract` fallback; still unpublished  
Question Review: AdminGovQuestionReview APPROVE/REJECT/FLAG/PUBLISH via server + RLS  
Paper Review: existing AdminGovPaperReview  
Publication: never auto-publish OCR (`auto_publish: false`)  
Audit: job metadata stores parser version, confidence, `needs_review`

# DATABASE

Tables: `gov_exams`, jobs, generated papers, `mock_tests`, `test_responses` (`answer_version`), `source_ingestion_jobs`  
RPCs: `reserve_gov_paper_credits` / `finalize_gov_paper_credits` / `release_gov_paper_credits` (migration `20260831120000`)  
RLS: freeze migration `20260831150000_gov_exam_freeze_start_rls.sql` (owner SELECT; writes via Edge) — **unapplied**  
Migrations: listed below; **db push blocked on database password prompt**  
Constraints: expanded job status check `20260831140000_gov_paper_job_status_check_expand.sql`  
Indexes: claimable job index `20260831151000` (timestamp split to avoid colliding with freeze)

# SECURITY

JWT: start/save/create/get/cancel verify_jwt true  
RLS: owner isolation intended; User A/B **not live-tested this session**  
Ownership: Edge filters `user_id = auth.uid()` / service role after authenticateRequest  
Admin: extract requires `requireAdmin`  
Python authentication: existing internal secret / JWKS path in scraper client

# DEPLOYMENT

Frontend: code in this working tree; production frontend **not gated on this session's deploy**  
Edge: `npx supabase@latest functions deploy start-exam save-test-answer submit-test create-exam-paper check-exam-paper-availability get-paper-generation-job process-paper-generation-job --use-api --project-ref qzgvjrvtkwlzxpmlddkx` → `TransportError` after asset upload  
Python: Render `clarity-scraper` **not shipped**  
Workers: embedded paper factory flag already in `render.yaml`; host not updated  
Database: `npx supabase db push --dry-run` stopped at `Enter your database password`  
Cron: `send-interview-reminders` unrelated; paper jobs are lease/nudge not cron

# ACTUAL RUNTIME EVIDENCE

None for SEARCH → GENERATE → SIT → SUBMIT on the linked project. Last QA pack `qa-evidence/30-08-2026-remediation.md` remains **NO_GO** until migrations + Edge + Python produce one completed paper.

Unit/contract evidence from this session (local):

```
npx vitest run src/test/lib/gov-exam src/test/lib/edge/govExamCreditContracts.test.ts src/test/lib/edge/govExamQualityFallback.test.ts
```

Result: **15 files, 115 tests, exit 0** (plus credit contracts re-run **9 tests, exit 0** after start-exam-attempt assertions).

```
cd scraper && python -m pytest tests/test_paper_credit_compensation.py -q
```

Result: **6 passed, exit 0**.

# PYTHON/RENDER EVIDENCE

No Render log line `[GOV_EXAM] completed`. No business POST `/internal/gov-exams/process-job` against production. `/health` was not used as a completion signal.

# EDGE EVIDENCE

Deploy of `start-exam` + `save-test-answer` + generation/submit functions uploaded assets then failed: `TransportError`. Functions are not live.

# DATABASE EVIDENCE

`db push` required the remote database password interactively and could not complete unattended. Unapplied (this session): `20260831120000`, `20260831130000`, `20260831140000` (status check + interview timezone), `20260831150000` freeze, `20260831151000` answer_version index.

# CREDIT EVIDENCE

Contract tests assert create/topic-practice call `reservePaperJobCredits` after inventory, not `deductCreditsAtomic` at enqueue. Python tests assert no `_compensate` / `refund_credits`. **No live reserve/finalize/release row** was inspected.

# FILES CHANGED

Gov-exam primary (this plan):

- `scraper/app/gov_exams/engine.py`, `availability.py`, `schemas.py`, `routes/gov_exams.py`
- `scraper/app/paper_factory/worker.py`, `repository.py`, `blueprint.py`
- `scraper/tests/test_paper_credit_compensation.py`
- `supabase/functions/create-exam-paper/index.ts`
- `supabase/functions/check-exam-paper-availability/index.ts`
- `supabase/functions/get-paper-generation-job/index.ts`
- `supabase/functions/process-paper-generation-job/index.ts`
- `supabase/functions/cancel-paper-generation-job/index.ts`
- `supabase/functions/generate-topic-practice/index.ts`
- `supabase/functions/extract-question-paper/index.ts`
- `supabase/functions/start-exam-attempt/index.ts` (new)
- `supabase/functions/save-attempt-answer/index.ts` (new)
- `supabase/functions/_shared/pythonGovExamClient.ts`, `claimJobCredits.ts`, `govPaperAssembly.ts`, `govPaperJobLease.ts`
- `src/pages/app/mock-test/GenerateGovPaper.tsx`, `TestSession.tsx`
- `src/lib/gov-exam/api.ts`, `pollPaperJob.ts`, `examOperationErrors.ts`, `adminOps.ts`
- `src/lib/network/fetchEdge.ts`, `src/lib/api/functions.ts`, `supabase/config.toml`
- `src/pages/app/admin/AdminGovIngest.tsx`
- `src/test/lib/gov-exam/pollPaperJob.test.ts`, `examOperationErrors.test.ts`
- `src/test/lib/edge/govExamQualityFallback.test.ts`, `govExamCreditContracts.test.ts`

The git working tree also contains unrelated in-progress files (billing, auth, scheduler, sessions). Those are not claimed as gov-exam runtime proof.

# MIGRATIONS CREATED

- `supabase/migrations/20260831120000_gov_paper_job_credit_reservation.sql`
- `supabase/migrations/20260831140000_gov_paper_job_status_check_expand.sql`
- `supabase/migrations/20260831150000_gov_exam_freeze_start_rls.sql`
- `supabase/migrations/20260831151000_attempt_answer_version_and_claim_index.sql`

(Also present, other workstreams: `20260831130000_owned_session_detail.sql`, `20260831140000_interview_timezone.sql`.)

# EDGE FUNCTIONS CHANGED

create-exam-paper, check-exam-paper-availability, get-paper-generation-job, process-paper-generation-job, start-exam (client start path; DB clock via `start_owned_mock_test` with service-role fallback), save-test-answer (stale `client_updated_at` + `ATTEMPT_EXPIRED`), submit-test (snapshot scoring). `start-exam-attempt` / `save-attempt-answer` remain as compatibility functions; TestSession calls `start-exam` / `save-test-answer`.

# PYTHON FILES CHANGED

engine.py, worker.py, repository.py, routes/gov_exams.py, schemas.py, availability.py, blueprint.py, credit compensation tests.

# WORKERS CHANGED

`paper_factory.worker` now only runs `process_gov_exam_job`. Embedded worker flag already `true` in `render.yaml`.

# COMMANDS RUN

| Command | Exit |
|---|---|
| `python -m pytest tests/test_paper_factory.py tests/test_gov_availability.py tests/test_paper_bank_fail_closed.py tests/test_paper_credit_compensation.py tests/test_gov_validate_questions_wiring.py -q` (scraper) | 0 (75 passed) |
| `npx vitest run src/test/lib/gov-exam src/test/lib/edge/govExamCreditContracts.test.ts src/test/lib/edge/govExamQualityFallback.test.ts` | 0 (116 tests) |
| `npx playwright test e2e/gov-exam-session.spec.ts` | 0 (mocked Edge/DB session: start, answer, mark, submit) |
| `npx supabase db push --dry-run` | blocked — password prompt |
| `npx supabase@latest functions deploy start-exam save-test-answer submit-test create-exam-paper check-exam-paper-availability get-paper-generation-job process-paper-generation-job --use-api --project-ref qzgvjrvtkwlzxpmlddkx` | 1 — TransportError after asset upload |

# REMAINING ISSUES

1. Migrations not applied on `qzgvjrvtkwlzxpmlddkx` (credit reservation, job status including `checking_availability`, freeze snapshot, start/save RPCs, RLS lockdown).
2. Edge functions not live (`TransportError` / `FunctionsApiTransportError`). `start-exam` / `save-test-answer` 404 until deploy succeeds.
3. Python scraper/worker not shipped to Render — no `[GOV_EXAM] completed` business log.
4. No live SEARCH → GENERATE → SIT → SUBMIT paper. No credit RPC row proof. No User A/B isolation proof.
5. Official/Previous-Year remains empty/fail-closed until licensed ingest + review publishes PYQ.
6. Dual `20260831140000_*` prefixes left as-is (Supabase may apply in filename order).
7. `generate-topic-practice` is still a second assembly path; not the main factory.
8. Playwright session e2e is mocked. It does not prove production Python/Edge/DB.

# RELEASE STATUS

RELEASE_BLOCKED

Not RELEASE_READY_WITH_KNOWN_LIMITATIONS: that label requires a real Custom/Full Mock paper on the live stack. Official-empty is an accepted limitation **after** that paper exists.

To unblock: apply the migrations above, deploy the Edge list, ship `clarity-scraper` with `PAPER_FACTORY_EMBEDDED_WORKER=true`, then run the 32-step live journey plus AI-down / Python-down / 429 / 409 / refresh / User B.
