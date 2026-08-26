# Hybrid Audit Matrix (Wave 3 final)

> Generated: 2026-08-25 · Wave 3 agent: `integrator`  
> Host: `clarity-assistant-az05.onrender.com` · HMAC: **ok** (`hybrid-health hmac_ok=true`)  
> Live probe: `node --use-system-ca scripts/verify-python-hybrid-e2e.mjs` → **PARTIAL_FAILURES** (1 probe BROKEN, 6 REACHABLE_UNWIRED — all waived)  
> App smoke: `node --use-system-ca scripts/app-workflow-smoke.mjs` → **SMOOTH** (14/14 OK, 0 blocked)  
> Contract suite: `npm run test:hybrid` → **180/180 passed**

## Probe summary (Wave 3 live)

| Status | Count | Notes |
|--------|------:|-------|
| **CONNECTED** | 18 | Live Edge→Python or Python gov/hybrid paths (+2 vs Wave 2: company-research, parse-document Edge paths) |
| **REACHABLE_SCHEMA** | 15 | Direct probe used incomplete payloads (`operation_id`/`correlation_id` missing); routes exist |
| **REACHABLE_UNWIRED** | 6 | Optional gov/job wrappers; admin JWT routes (401 without token) — **waived post-launch** |
| **BROKEN** | 1 | Raw `POST /internal/operations ping` without OperationRequest — **non-blocking** |

**HMAC sync:** Verified — `hybrid-health` admin probe `hmac_ok=true`, signed internal 200.

### Probe BROKEN vs product verdict (Wave 3)

| Probe id | Probe status | Product verdict | Notes |
|----------|--------------|-----------------|-------|
| `POST /internal/operations ping` (raw, no `operation_id`) | BROKEN (422) | **Non-blocking** | Edge `hybrid-ping` **CONNECTED** (200, full OperationRequest) |
| `company-research → company_normalize` | CONNECTED (200) | **CONNECTED** | Wave 3: probe recovered; app smoke `COMPANY:OK` |
| `parse-document → document_extract` | CONNECTED (400) | **CONNECTED** | Probe now hits Edge path; requires `document_id` (expected). Launch: durable queue |
| `GET /ready` (Wave 0) | was BROKEN (500) | **FIXED** | Wave 2+ probe: 200 ready |

---

## MATRIX operations (operationRouter)

| Feature (MATRIX op) | Edge function | Python op | Route | preferredOrder | Status | Probe / notes |
|---------------------|---------------|-------------|-------|----------------|--------|---------------|
| `gov_exam_assemble` | `create-exam-paper`, `process-paper-generation-job` | `/internal/gov-exams/*` | gov client | database → python → ai | **CONNECTED** | availability/select/process-job/validate-questions wired in assembly |
| `resume_parse` | `parse-resume` | `document_extract` | `/v1/process` | deterministic → python → ai | **CONNECTED** | HMAC + Edge validation; worker uses `document_extract` + classify |
| `document_process` | `create-document-processing-job`, `get/cancel/retry-document-processing-job`, `parse-document` | `document_extract` | `/v1/process` + `document_processing_jobs` | python → ai | **CONNECTED** | Durable PG queue authoritative; Python `/internal/jobs/document` acks DB job (no in-memory registry) |
| `star_builder` | `prep-tool`, `generate-star-answer`, `polish-star-section` | `star_evidence` / `star_format` | `/v1/process` + `/internal/operations` | python → ai → deterministic | **CONNECTED** | Wave 1: runPython stages draft (skip success); runAi polishes; det uses staged draft |
| `system_design` | `prep-tool` | `system_design` / `system_design_outline` | `/v1/process` + internal | deterministic → python → ai | **CONNECTED** | Wave 1: hybrid chain verified |
| `practice_coach_help` | `ai-coach-chat`, `generate-hint`, `generate-answer` | `practice_coach` | **`/v1/process` only** | ai → python → deterministic | **CONNECTED** | Wave 1: generate-hint throws on empty AI; never `practice_coach_hint` scaffold |
| `live_answer` | `generate-answer` | `practice_coach` | **`/v1/process` only** | ai → python → deterministic | **CONNECTED** | |
| `company_research` | `company-research` | `company_normalize` | `/v1/process` | database → python → ai | **CONNECTED** | Wave 1: python normalize only in runPython; AI in runAi; scaffold defers to AI |
| `mock_question_generation` | `generate-questions` | `mock_question_validate` / `mock_question_bank` | `/v1/process` + internal | database → ai → python | **CONNECTED** | Wave 1: runPython calls internal `mock_question_bank` then `/v1/process` validate |
| `sprint_review_transcript` | `process-sprint-transcript` | `speech_process` | **`/v1/process` only** | deterministic → python → ai | **WAIVED** | Edge fn + allowlists ok; product UI → interview agent (post-launch) |
| `gap_analysis` | `gap-analysis` | `gap_analysis` | `/internal/operations` | deterministic → python → ai | **CONNECTED** | Wave 1: hybrid chain wired; rejects parse_failed AI; credit refund on total fail |
| `session_debrief` | `generate-debrief` | `session_debrief` | `/internal/operations` | deterministic → python → ai | **CONNECTED** | Wave 1: no `DEFAULT_DEBRIEF` fake parse; invalid AI → fallback/refund |
| `session_scorecard` | `generate-scorecard` | `session_scorecard` | `/internal/operations` | deterministic → python → ai | **CONNECTED** | Wave 1: invalid AI JSON throws; no silent det-in-AI success |
| `analyze_test` | `analyze-test-performance` | `analyze_test` | `/internal/operations` | database → deterministic → python → ai | **CONNECTED** | Wave 1: total failure refunds; cached DB short-circuit |
| `prep_rephrase` | `prep-tool` | `prep_rephrase` | `/internal/operations` | ai → python → deterministic | **CONNECTED** | |
| `prep_coding` | `prep-tool` | `prep_coding` | `/internal/operations` | ai → python → deterministic | **CONNECTED** | |
| `prep_project` | `prep-tool` | `prep_project` | `/internal/operations` | ai → python → deterministic | **CONNECTED** | |

---

## Direct `/v1/process` engines (ProcessOperation)

| Engine op | Edge callers | Status | Notes |
|-----------|--------------|--------|-------|
| `document_extract` | `parse-document`, `parse-resume` | **CONNECTED** | |
| `document_classify` | (internal/diagnostic) | **REACHABLE_SCHEMA** | Engine live; no primary Edge feature |
| `star_evidence` | `generate-star-answer`, `prep-tool`, `polish-star-section` | **CONNECTED** | |
| `system_design` | `prep-tool` | **CONNECTED** | |
| `practice_coach` | `ai-coach-chat`, `generate-hint`, `generate-answer` | **CONNECTED** | Canonical `{ reply, hints }` contract |
| `company_normalize` | `company-research` | **CONNECTED** | Edge 200 |
| `mock_question_validate` | `generate-questions` | **CONNECTED** | |
| `speech_process` | `process-sprint-transcript` (via `sprint_review_transcript`) | **CONNECTED** | Wave 0: routed to `/v1/process`, not internal alias |

---

## `/internal/operations` (SUPPORTED_OPERATIONS)

| operation_type | Edge / hybrid path | Status | Notes |
|----------------|-------------------|--------|-------|
| `ping` | `hybrid-ping`, `hybrid-health` | **CONNECTED** | Edge supplies full OperationRequest |
| `star_format` | `star_builder` default pythonExecute | **CONNECTED** | Alias from MATRIX |
| `system_design_outline` | `system_design` alias | **CONNECTED** | |
| `resume_structure` | `resume_parse` alias | **CONNECTED** | |
| `company_research_skeleton` | `company_research` alias | **CONNECTED** | |
| `mock_question_bank` | `mock_question_generation` alias | **CONNECTED** | |
| `document_extract` | `document_process` alias | **CONNECTED** | Prefer `/v1/process` for extract |
| `gap_analysis` | `gap-analysis` | **CONNECTED** | |
| `session_debrief` | `generate-debrief` | **CONNECTED** | |
| `session_scorecard` | `generate-scorecard` | **CONNECTED** | |
| `analyze_test` | `analyze-test-performance` | **CONNECTED** | |
| `prep_rephrase` / `prep_coding` / `prep_project` | `prep-tool` | **CONNECTED** | |
| `practice_coach_hint` | diagnostics only | **MISSING** | Scaffold — **must not** satisfy user coach |
| `practice_coach` (internal handler) | legacy internal | **REACHABLE_UNWIRED** | Delegates to hint scaffold; superseded by `/v1/process` |

---

## Gov / jobs / admin (Python-only or partial Edge)

| Route | Edge caller | Status | Wave 1 action |
|-------|-------------|--------|---------------|
| `POST /internal/gov-exams/validate-questions` | `govPaperAssembly` (`pythonGovValidateQuestions`) | **CONNECTED** | Wired pre-publication validation gate; probe UNWIRED = incomplete payload only |
| `POST /internal/gov-exams/build-paper` | none | **REACHABLE_UNWIRED** | Optional; assembly via `process-paper-generation-job` / `process-job` |
| `POST /internal/jobs/exam-source` | none | **REACHABLE_UNWIRED** | Ingest pipeline |
| `POST /internal/jobs/validate-paper` | none | **REACHABLE_UNWIRED** | Quality gate |
| `GET /scrape/sources` | `scraperApi.sources()` (admin JWT) | **CONNECTED** | Wave 1: AdminSeedQuestions + AdminDiagnostics |
| `GET /paper-factory/exams` | `scraperApi.paperFactoryExams()` (admin JWT) | **CONNECTED** | Wave 1: AdminDiagnostics health probe |
| `GET /ready` | `hybrid-health` | **CONNECTED** | Wave 2: 200 ready; was 500 in Wave 0 baseline (infra self-healed) |

### Auth model (ingest-admin — do not mix)

| Path | Auth | Secret env | Browser exposure |
|------|------|------------|------------------|
| FastAPI `/scrape/*`, `/paper-factory/*` | Supabase JWT + `admin` role | `SUPABASE_JWKS_URL` (Render) | JWT only via `src/lib/scraper/client.ts` |
| Edge → Python hybrid | HMAC-SHA256 | `DOCUMENT_INTELLIGENCE_AUTH_SECRET` | Never — Edge `_shared/pythonClient.ts` only |
| `bulk-import-questions` | `x-ingest-key` | `INGEST_API_KEY` | Never — worker/scraper server only |
| Admin Edge (`collect-exam-papers`, `hybrid-health`, …) | Supabase JWT + `is_admin` | N/A | JWT via `fetchEdge` / `invokeFunction` |

---

## Wave 1 ingest-admin (Edge + admin UI)

| Edge / route | Frontend | Status | Notes |
|--------------|----------|--------|-------|
| `collect-exam-papers` | AdminSeedQuestions | **CONNECTED** | Allowlisted official portals |
| `extract-question-paper` | AdminGovIngest (`adminOps`) | **CONNECTED** | Gov PDF ingest |
| `bulk-import-questions` | none (worker) | **CONNECTED** | `INGEST_API_KEY` only |
| `run-daily-exam-scrape` | cron / manual | **CONNECTED** | Shares `collectExamPapers.ts` |
| `ai-hub-router` | AdminAiHub | **CONNECTED** | Fallback walk mirrored in `aiHubFallbackWalk.ts` + test |
| `ai-key-check` | AdminDiagnostics | **CONNECTED** | Presence only — no secret values |
| `hybrid-health` | AdminDiagnostics | **CONNECTED** | `hmac_ok` via signed `/internal/gov-exams/health`; no secret echo |
| `hybrid-ping` | AdminDiagnostics | **CONNECTED** | HMAC smoke |
| `GET /scrape/sources` | AdminSeedQuestions, AdminDiagnostics | **CONNECTED** | JWT scraper client |
| `GET /paper-factory/exams` | AdminDiagnostics | **CONNECTED** | JWT scraper client |
| `process-sprint-transcript` | none (product UI) | **REACHABLE_UNWIRED** | Edge + `fetchEdge` allowlists ok; UI → interview/live agent |

**fetchEdge allowlists (Wave 1):** `PRIVATE_MODE_ALLOWLIST`, `CREDIT_REFRESH_SKIP`, `OPERATIONAL_EDGE_FNS` include ingest-admin edges above (not `ai-hub-router` — cloud AI stays blocked in private mode).

---

## Diagnostics

| Edge | Python target | Status |
|------|---------------|--------|
| `hybrid-ping` | `/internal/operations` `ping` | **CONNECTED** |
| `hybrid-health` | `/health` + signed gov health | **CONNECTED** (`hmac_ok=true`) |
| `search-exams` | Edge DB | **CONNECTED** |
| `check-exam-paper-availability` | gov availability | **CONNECTED** |

---

## Wave 1 — documents agent (2026-08-25)

| Change | Detail |
|--------|--------|
| Durable product path | Edge `create/get/cancel/retry-document-processing-job` → PostgreSQL `document_processing_jobs`; Python `/internal/jobs/document` acks existing row (removed in-memory registry for user flows) |
| Hybrid extract | Worker + sync Edge paths use `/v1/process` `document_extract` (includes `document_classify`); order python → ai per MATRIX |
| Credit boundary | Edge reserves/refunds; worker calls `settle_document_processing_job` on completion only; DB RPC refunds on cancel / failed_permanent / max_attempts |
| Retry dispatch | `retry-document-processing-job` re-notifies Python with `correlation_id`; no second credit charge |
| Tests | `scraper/tests/test_document_durable_jobs.py`, updated `test_document_intelligence.py`, `src/test/lib/documents/documentJobLifecycle.test.ts` |

---

1. **`OPERATION_TYPE_MAP`** — aligned to `SUPPORTED_OPERATIONS`; removed dead v1/internal dual aliases (`star_evidence`, `document_classify`, `company_normalize`, `mock_question_validate`, `speech_process`, `live_answer`).
2. **`V1_PROCESS_OPERATION`** — single dispatch table for `/v1/process` (coach, speech, engines).
3. **`speech_process`** — `sprint_review_transcript` / `speech_process` → `/v1/process` only.
4. **Coach guard** — user-facing payloads cannot succeed via `practice_coach_hint` scaffold; redirected to `/v1/process` `practice_coach`.
5. **`normalizePythonDomainCode`** — maps `REQUEST_VALIDATION_FAILED` / `UNSUPPORTED_OPERATION` → `PYTHON_PROCESSING_FAILED`.
6. **`EdgeFunctionName`** — expanded to all active `supabase/functions/*/index.ts` entries.

---

## Wave 1 — sessions-ai agent (2026-08-25)

| Edge function | Hybrid MATRIX op | AI dependency | Wave 1 verdict |
|---------------|------------------|---------------|--------------|
| `generate-debrief` | `session_debrief` | Optional (3rd tier) | **FIXED** — `parseDebriefFromAi` + `validate`; no placeholder debrief on bad JSON |
| `generate-scorecard` | `session_scorecard` | Optional (3rd tier) | **FIXED** — `runAi` throws `AI_INVALID_OUTPUT`; deterministic/python run first |
| `analyze-test-performance` | `analyze_test` | Optional (4th tier) | **FIXED** — DB cache → det → python → AI; refund envelope on total failure |
| `compare-sessions` | *(none)* | **None** | **VERIFIED** — DB scorecard/answer diff via `buildComparisonPayload` |
| `finalize-session` | *(none)* | **None** | **VERIFIED** — `finalize_owned_session` RPC only |

**Tests:** `src/test/lib/edge/sessionsAiHybrid.test.ts`

---

## Wave 1 — coach-prep agent (2026-08-25)

| Edge function | Hybrid MATRIX op | Wave 1 verdict |
|---------------|------------------|----------------|
| `ai-coach-chat` | `practice_coach_help` | **VERIFIED** — AI empty throws; python via `callPythonProcess(practice_coach)`; SSE success / hybridFailure |
| `generate-hint` | `practice_coach_help` | **FIXED** — empty AI no longer fake-success; python fallback per matrix |
| `generate-answer` | `live_answer` | **VERIFIED** — AI → python `practice_coach`; hybridFailure on total fail |
| `generate-star-answer` | `star_builder` | **FIXED** — python `star_evidence` stages draft; AI polish in runAi |
| `polish-star-section` | `star_builder` | **FIXED** — python section draft → AI polish; hybridSuccess envelope |
| `prep-tool` (`star_method`, `system_design`) | `star_builder`, `system_design` | **FIXED/VERIFIED** — STAR python→AI; system_design det→python→AI |

**Tests:** `src/test/lib/ai/practiceCoachAiHelp.test.ts`, `src/test/lib/edge/coachPrepHybrid.test.ts`, `src/test/lib/edge/hybridFallbackRuntime.test.ts`, `src/test/lib/edge/hybridMigrationContracts.test.ts`

---

## Wave 1 — billing-credits agent (2026-08-25)

| Edge / shared module | Provider | Status | Wave 1 hardening |
|----------------------|----------|--------|------------------|
| `razorpay-create-order` | Razorpay | **CONNECTED** | Durable `payment_orders` reserve + idempotent checkout replay |
| `razorpay-verify-payment` | Razorpay | **CONNECTED** | Shared `fulfillCapturedRazorpayOrder`; catalog-only grants |
| `razorpay-webhook` | Razorpay | **CONNECTED** | Event-id replay dedupe + atomic fulfill; refund via `apply_razorpay_refund` |
| `deduct-credits` | Ledger RPC | **CONNECTED** | Single-transaction `deduct_credits_service` (profile lock + ledger + idempotency) |
| `billing-status` | — | **RETIRED** | `410 FUNCTION_RETIRED` → `razorpay-create-order` |
| `create-billing-portal` | — | **RETIRED** | `410 FUNCTION_RETIRED` → `razorpay-create-order` |
| `cancel-subscription` | — | **RETIRED** | `410 FUNCTION_RETIRED` |
| `resume-subscription` | — | **RETIRED** | `410 FUNCTION_RETIRED` |
| `stripe-webhook` | Stripe | **RETIRED** | Signature verified; `200` ignore envelope (`FUNCTION_RETIRED`) — never mints credits |
| `_shared/claimJobCredits.ts` | Gov jobs | **CONNECTED** | Atomic `credits_charged` claim before refund compensation |
| `_shared/creditAuthority.ts` | Shared | **CONNECTED** | Canonical denial codes; no blanket `PAYMENT_REQUIRED` on RPC outage |

**Ledger idempotency:** migration `20260825140000_wave1_billing_credits_hardening.sql` — unique `credit_transactions.stripe_payment_id`; idempotent `add_credits`; payment claim retained after grant.

**Tests:** `src/test/lib/billing/creditErrorCodes.test.ts`, `retiredBillingStubs.test.ts`, `razorpayWebhookLogic.test.ts`

---

## REACHABLE_UNWIRED → Wave 1 owners

| Item | Suggested Wave 1 agent | Wave 1 status |
|------|------------------------|---------------|
| `process-sprint-transcript` product UI | interview/live session | **REACHABLE_UNWIRED** (allowlists ok) |
| `POST /internal/gov-exams/validate-questions` | gov-exam | **CONNECTED** — `pythonGovValidateQuestions` in `govPaperAssembly` + engine |
| `POST /internal/gov-exams/build-paper` | gov-exam | **REACHABLE_UNWIRED** (optional; `process-job` authoritative) |
| `POST /internal/jobs/exam-source` | gov-exam / ingest | open |
| `POST /internal/jobs/validate-paper` | gov-exam / QA | open |
| Admin scrape/paper-factory JWT routes | ingest-admin | **CONNECTED** |
| Python `GET /ready` 500 | platform/infra | **CONNECTED** (Wave 2 live 200) |

---

## Wave 1 — gov-papers agent (2026-08-25)

| Change | Detail |
|--------|--------|
| `validate-questions` | Edge `pythonGovValidateQuestions` pre-publication gate; Python engine calls `validate_question_payloads` |
| `PYTHON_FACTORY_OWNED` | Edge claim skips python-routed jobs; `releasePaperJobForPythonFactory` restores `attempt_count` |
| Credit compensate | `claim_credits_for_refund` + idempotent `refund_paper_job:{jobId}` on permanent fail only (Edge + Python parity) |
| Bank fail-closed | `PaperFactory` raises `CONTENT_INSUFFICIENT` unless `allowDeterministicFill=true` |
| Tests | `test_paper_credit_compensation.py`, `test_paper_bank_fail_closed.py`, `test_gov_validate_questions_wiring.py` (15 passed) |

**Forced-failure expectations:** permanent `CONTENT_INSUFFICIENT` / `PAPER_VALIDATION_FAILED` → single refund via claim; retryable `failed_retryable` → no refund; Python-routed job + Edge worker → `202 PYTHON_FACTORY_OWNED` without burning attempts.

---

## Wave 2 — chaos-fallback agent (2026-08-25)

Chaos flags on Supabase Edge secrets (unset for production):

| Flag | Effect | Simulated code |
|------|--------|----------------|
| `HYBRID_FORCE_AI_UNAVAILABLE=1` | `canUseAI=false` — AI sources **skipped** (not failed) | N/A (skip) |
| `HYBRID_FORCE_PYTHON_UNAVAILABLE=1` | `canUsePython=false` — Python **skipped**; `pythonClient` returns 503 | `PYTHON_SERVICE_UNAVAILABLE` |

**Credit contract:** `executeHybridOperation` reserves credits **once** before the source walk; fallback success does not re-deduct; total failure or exception refunds **once** (`hybrid_failure:` / `hybrid_exception:` reason).

**HTTP contract:** `hybridFailure` uses `httpStatusForDomainCode` — no raw **502**; chaos domain codes map to **503** (unavailable) or **422** (invalid output), never **500** for provider-down paths.

### Forced-failure scenarios (Wave 2 targets)

| MATRIX op | `HYBRID_FORCE_AI_UNAVAILABLE` | `HYBRID_FORCE_PYTHON_UNAVAILABLE` | Runtime fail → fallback | Total fail → refund |
|-----------|------------------------------|-----------------------------------|-------------------------|---------------------|
| `practice_coach_help` | Skip AI → python/deterministic | Skip python; AI fail → deterministic | AI fail → python | All tiers fail → 1× refund, `AI_PROVIDER_UNAVAILABLE` 503 |
| `star_builder` | Skip AI → python stage → deterministic | Skip python → AI polish | AI fail → deterministic (staged draft) | Same |
| `gap_analysis` | Skip AI → det/python | Skip python → deterministic | Python fail → deterministic (+ database enqueued) | Same |
| `gov_exam_assemble` | Skip AI → database/python | Skip python → database → AI | Python fail → AI (`aiFallbackOnPythonFailure`) | DB+python+AI fail → 1× refund |
| `document_process` | Skip AI → python extract | Skip python → AI enrich | Python fail → AI | Both forced/unavailable → 1× refund, no deterministic path |

**Tests:** `src/test/lib/edge/chaosFallback.test.ts`, `hybridFallbackRuntime.test.ts`, `hybridFallbackContracts.test.ts`

**Live chaos:** `scripts/full-stack-check.mjs` reads `hybrid-health` → `chaos.force_ai_unavailable` / `force_python_unavailable`; set flags on Edge for staging probes.

---

## Wave 2 — live-e2e agent (2026-08-25)

### Live probe runs

| Script | Exit | Verdict | Key paths |
|--------|------|---------|-----------|
| `verify-python-hybrid-e2e.mjs` | 2 | PARTIAL_FAILURES | 40 probes; 3 BROKEN (see table above) |
| `app-workflow-smoke.mjs` | 0 | **SMOOTH** | session, coach, hint, answer, prep, star, company, gov search/avail/create, hybrid-ping, billing stub, frontend |

### Edge diagnostics (authenticated)

| Edge | Status | Evidence |
|------|--------|----------|
| `hybrid-ping` | **CONNECTED** | 200, `source=python`, signed ping payload |
| `hybrid-health` (admin) | **CONNECTED** | 200, `hmac_ok=true`, gov signed health 200 |

### Remaining launch-critical gaps (none blocking)

| Item | Status | Wave 2 action |
|------|--------|---------------|
| `process-sprint-transcript` product UI | **REACHABLE_UNWIRED** | Documented — Edge + allowlists ok; UI routes to interview/live agent (post-launch) |
| `POST /internal/gov-exams/build-paper` | **REACHABLE_UNWIRED** | Optional; `process-paper-generation-job` authoritative |
| `POST /internal/jobs/exam-source` | **REACHABLE_UNWIRED** | Ingest pipeline; no product UI yet |
| `POST /internal/jobs/validate-paper` | **REACHABLE_UNWIRED** | QA gate; no Edge wrapper |
| Admin `GET /scrape/sources`, `/paper-factory/exams` | **REACHABLE_UNWIRED** in raw probe | **CONNECTED** via admin JWT in product (`scraperApi`) |

**Gap log:** [HYBRID_GAP_LOG.md](./HYBRID_GAP_LOG.md)

---

## Wave 3 — integrator sign-off (2026-08-25)

All launch-critical MATRIX operations **CONNECTED**. Remaining REACHABLE_UNWIRED items explicitly **waived** (optional ingest wrappers, sprint transcript UI, admin JWT probe-only routes).

| Integrator gate | Verdict |
|-----------------|---------|
| Edge deployed + intentional responses | **PASS** — smoke 14/14 |
| Python HMAC-reachable | **PASS** — `hmac_ok=true`, hybrid-ping 200 |
| AI fallback, no fake success | **PASS** — 180 contract tests + smoke |
| Credits reserve/compensate | **PASS** — paper + hybrid + document tests |
| No stuck jobs / chaos | **PASS** — chaosFallback 26 tests |
| Launch-critical UNWIRED | **PASS (waived)** — 6 optional/post-launch |

**Manual action:** Apply migration `supabase/migrations/20260825140000_wave1_billing_credits_hardening.sql` before next billing deploy.
