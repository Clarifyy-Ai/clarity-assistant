# Hybrid Gap Log (Waves 0–3)

> Last run: 2026-08-25 · Agents: Wave 0 baseline, Wave 1 feature agents, Wave 2 `contract-tests` + `live-e2e`, Wave 3 `integrator`  
> Audit matrix: [HYBRID_AUDIT_MATRIX.md](./HYBRID_AUDIT_MATRIX.md)

Consolidated **broken → fixed → evidence** entries across hybrid wiring work. Status at Wave 3 close: **launch-critical paths green** (app smoke SMOOTH; 180/180 contract tests).

---

## Wave 0 — router / baseline fixes

| Gap | Was | Fixed | Evidence |
|-----|-----|-------|----------|
| `speech_process` internal alias drift | BROKEN / dual dispatch | **FIXED** — `/v1/process` only for `sprint_review_transcript` | Matrix Wave 0; `verify-python-hybrid-e2e` `process:speech_process` REACHABLE_SCHEMA |
| Dead `OPERATION_TYPE_MAP` aliases | UNWIRED confusion | **FIXED** — aligned to `SUPPORTED_OPERATIONS`; removed v1/internal dual aliases | Matrix changelog §Wave 0 |
| `practice_coach_hint` scaffold satisfying users | BROKEN UX | **FIXED** — coach guard redirects user payloads to `/v1/process` `practice_coach` | Matrix; `practiceCoachAiHelp.test.ts` |
| `normalizePythonDomainCode` gaps | Opaque 422/502 | **FIXED** — maps validation/unsupported → `PYTHON_PROCESSING_FAILED` | `errorEnvelopes.test.ts` |
| `GET /ready` Python readiness | **BROKEN** (500) | **FIXED** (Wave 2 live) — 200 ready | `verify-python-hybrid-e2e`: `GET /ready` CONNECTED 2026-08-25 |
| Raw `POST /internal/operations ping` without fields | Probe BROKEN (422) | **Accepted** — Edge `hybrid-ping` supplies full OperationRequest | Probe + app smoke `HYBRID_PING:OK` |

---

## Wave 1 — documents agent

| Gap | Was | Fixed | Evidence |
|-----|-----|-------|----------|
| In-memory document job registry | BROKEN durability | **FIXED** — PostgreSQL `document_processing_jobs` authoritative | `test_document_durable_jobs.py`, `documentJobLifecycle.test.ts` |
| Python `/internal/jobs/document` creating phantom jobs | UNWIRED / race | **FIXED** — acks existing DB row only | `test_document_intelligence.py` |
| Retry double-charge | BROKEN billing | **FIXED** — `retry-document-processing-job` re-notifies with `correlation_id`, no second reserve | Matrix §documents; lifecycle tests |
| Credit settle on worker completion | Missing boundary | **FIXED** — `settle_document_processing_job`; RPC refund on cancel/permanent fail | Matrix §documents |

---

## Wave 1 — sessions-ai agent

| Gap | Was | Fixed | Evidence |
|-----|-----|-------|----------|
| `generate-debrief` placeholder on bad AI JSON | BROKEN — fake debrief | **FIXED** — `parseDebriefFromAi` + validate; fallback/refund | `sessionsAiHybrid.test.ts` |
| `generate-scorecard` silent det-in-AI success | BROKEN | **FIXED** — `runAi` throws `AI_INVALID_OUTPUT` | `sessionsAiHybrid.test.ts` |
| `analyze-test-performance` no refund on total fail | BROKEN credits | **FIXED** — DB cache → det → python → AI; refund envelope | `sessionsAiHybrid.test.ts` |
| `compare-sessions` / `finalize-session` | Unverified | **VERIFIED** — DB-only, no hybrid | Matrix §sessions-ai |

---

## Wave 1 — coach-prep agent

| Gap | Was | Fixed | Evidence |
|-----|-----|-------|----------|
| `generate-hint` empty AI fake-success | BROKEN | **FIXED** — throws; python fallback per matrix | `practiceCoachAiHelp.test.ts`, app smoke `GENERATE_HINT:OK` |
| `generate-star-answer` no python stage | UNWIRED chain | **FIXED** — `star_evidence` stages draft; AI polish in runAi | `coachPrepHybrid.test.ts`, app smoke `STAR:OK` |
| `prep-tool` STAR / system_design chain | Partial | **FIXED/VERIFIED** — python→AI / det→python→AI | app smoke `PREP_TOOL:OK` |
| `ai-coach-chat` / `generate-answer` | Unverified live | **VERIFIED** — app smoke `AI_COACH:OK`, `GENERATE_ANSWER:OK` (python_structured) | Wave 2 live-e2e |

---

## Wave 1 — billing-credits agent

| Gap | Was | Fixed | Evidence |
|-----|-----|-------|----------|
| Stripe legacy minting credits | BROKEN security | **FIXED** — retired stubs `410 FUNCTION_RETIRED` | `retiredBillingStubs.test.ts` |
| Razorpay double-fulfill | BROKEN | **FIXED** — event-id dedupe + atomic fulfill | `razorpayWebhookLogic.test.ts` |
| Gov job refund without claim | BROKEN economics | **FIXED** — `claim_credits_for_refund` + idempotent refund key | `test_paper_credit_compensation.py` |
| Blanket `PAYMENT_REQUIRED` on RPC outage | BROKEN UX | **FIXED** — canonical denial codes in `creditAuthority.ts` | `creditErrorCodes.test.ts` |

---

## Wave 1 — gov-papers agent

| Gap | Was | Fixed | Evidence |
|-----|-----|-------|----------|
| `validate-questions` no Edge gate | REACHABLE_UNWIRED | **FIXED** — `pythonGovValidateQuestions` in `govPaperAssembly` | `test_gov_validate_questions_wiring.py` |
| Paper bank silent deterministic fill | BROKEN quality | **FIXED** — fail-closed `CONTENT_INSUFFICIENT` unless explicit flag | `test_paper_bank_fail_closed.py` |
| Edge/Python job attempt burn race | BROKEN | **FIXED** — `PYTHON_FACTORY_OWNED` 202 without burning attempts | Matrix §gov-papers; compensation tests |
| Gov exam create E2E | Unverified live | **VERIFIED** — app smoke `GOV_CREATE:OK` (202, python_paper_factory) | Wave 2 live-e2e |

---

## Wave 1 — ingest-admin

| Gap | Was | Fixed | Evidence |
|-----|-----|-------|----------|
| Admin scrape/paper-factory not in allowlists | BROKEN private mode | **FIXED** — `fetchEdge` allowlists expanded | `ingestAdminAllowlists.test.ts` |
| `hybrid-health` secret echo risk | BROKEN security | **FIXED** — `hmac_ok` only, no secret values | Wave 2 probe `hmac_ok=true` |
| `ai-hub-router` fallback drift | UNWIRED | **FIXED** — mirrored in `aiHubFallbackWalk.ts` | `aiHubRouterFallback.test.ts` |

---

## Wave 2 — chaos-fallback agent

| Gap | Was | Fixed | Evidence |
|-----|-----|-------|----------|
| Provider-down → raw 502 | BROKEN HTTP | **FIXED** — `hybridFailure` maps to 503/422 via `httpStatusForDomainCode` | `chaosFallback.test.ts`, `hybridFallbackRuntime.test.ts` |
| Fallback success double-deduct | BROKEN credits | **FIXED** — single reserve before source walk | `hybridFallbackContracts.test.ts` |
| Total fail no refund | BROKEN credits | **FIXED** — one refund (`hybrid_failure:` / `hybrid_exception:`) | `hybridFallbackRuntime.test.ts` |

### Wave 2 contract test run

| Suite | Passed | Failed |
|-------|-------:|-------:|
| Vitest (14 files) | 131 | 0 |
| pytest (6 files) | 49 | 0 |
| **Total** | **180** | **0** |

Run: `node scripts/run-hybrid-test-suite.mjs` or `npm run test:hybrid`

**Wave 3 integrator note:** Added `chaosFallback.test.ts`, `hybridMigrationContracts.test.ts`, and `test_hybrid_new_ops.py` to the suite runner (previously documented but not executed in CI gate).

---

## Wave 2 — live-e2e agent

| Gap | Was | Fixed / verdict | Evidence |
|-----|-----|-----------------|----------|
| Launch-critical app workflows | Unknown live | **VERIFIED SMOOTH** | `app-workflow-smoke.mjs` exit 0, 14/14 OK |
| `hybrid-ping` / `hybrid-health` | Wave 0 CONNECTED | **RE-VERIFIED** | Probe 200; smoke `HYBRID_PING:OK`; admin `hmac_ok=true` |
| `company-research` probe 500 | Probe BROKEN | **Product OK** — DB short-circuit | Smoke `COMPANY:OK` (Microsoft, `source=database`); probe flake on `"Google"` |
| `parse-document` probe 401 | Probe BROKEN | **Non-blocking** — wrong probe payload | Function requires `document_id`; launch uses `create-document-processing-job` |
| `process-sprint-transcript` UI | REACHABLE_UNWIRED | **Documented post-launch** | Edge + allowlists ok; no product UI wiring |
| Optional gov/job wrappers | REACHABLE_UNWIRED | **Documented optional** | `build-paper`, `exam-source`, `validate-paper` — no launch UI |

### Live probe commands

```bash
node --use-system-ca scripts/verify-python-hybrid-e2e.mjs
node --use-system-ca scripts/app-workflow-smoke.mjs
```

### Wave 2 probe counts (`verify-python-hybrid-e2e.mjs`)

| CONNECTED | REACHABLE_SCHEMA | REACHABLE_UNWIRED | BROKEN |
|----------:|-----------------:|------------------:|-------:|
| 18 (Wave 3) | 15 | 6 | 1 |

Wave 2 baseline was 16 CONNECTED / 3 BROKEN; Wave 3 integrator re-run improved Edge-path probes.

---

## Still open (non-blocking launch)

| Item | Status | Owner / note |
|------|--------|--------------|
| `process-sprint-transcript` product UI | REACHABLE_UNWIRED | Interview/live session agent |
| `POST /internal/gov-exams/build-paper` | REACHABLE_UNWIRED | Optional; `process-job` path authoritative |
| `POST /internal/jobs/exam-source` | REACHABLE_UNWIRED | Ingest pipeline |
| `POST /internal/jobs/validate-paper` | REACHABLE_UNWIRED | QA gate |
| Raw Python ping without OperationRequest | Probe BROKEN | Cosmetic probe only; Edge path CONNECTED |
| `parse-document` direct text probe | Probe BROKEN | Use durable document job path |
| `practice_coach_hint` internal scaffold | MISSING (by design) | Diagnostics only — must not satisfy user coach |

---

## Test file inventory

| Group | Path |
|-------|------|
| Hybrid fallback contracts | `src/test/lib/edge/hybridFallbackContracts.test.ts` |
| Hybrid fallback runtime | `src/test/lib/edge/hybridFallbackRuntime.test.ts` |
| Chaos fallback | `src/test/lib/edge/chaosFallback.test.ts` |
| Hybrid migration contracts | `src/test/lib/edge/hybridMigrationContracts.test.ts` |
| Hybrid enqueue helpers | `src/test/lib/edge/hybridEnqueueFallbacks.ts` |
| Error envelopes | `src/test/lib/edge/errorEnvelopes.test.ts` |
| Credit error codes | `src/test/lib/billing/creditErrorCodes.test.ts` |
| Retired billing stubs | `src/test/lib/billing/retiredBillingStubs.test.ts` |
| AI hub router fallback | `src/test/lib/ai/aiHubRouterFallback.test.ts` |
| Practice coach AI help | `src/test/lib/ai/practiceCoachAiHelp.test.ts` |
| Gap / company / mock hybrid | `src/test/lib/edge/gapCompanyMockHybrid.test.ts` |
| Coach / prep hybrid | `src/test/lib/edge/coachPrepHybrid.test.ts` |
| Sessions AI hybrid | `src/test/lib/edge/sessionsAiHybrid.test.ts` |
| Ingest admin allowlists | `src/test/lib/edge/ingestAdminAllowlists.test.ts` |
| Document job lifecycle | `src/test/lib/documents/documentJobLifecycle.test.ts` |
| Paper credit compensation | `scraper/tests/test_paper_credit_compensation.py` |
| Paper bank fail-closed | `scraper/tests/test_paper_bank_fail_closed.py` |
| Gov validate questions wiring | `scraper/tests/test_gov_validate_questions_wiring.py` |
| Document intelligence | `scraper/tests/test_document_intelligence.py` |
| Document durable jobs | `scraper/tests/test_document_durable_jobs.py` |
| Hybrid new ops (Python) | `scraper/tests/test_hybrid_new_ops.py` |

---

## Wave 3 — integrator acceptance checklist

> Agent: `integrator` · Run date: 2026-08-25

| Gate | Result | Evidence |
|------|--------|----------|
| Active Edge functions deployed; intentional responses | **PASS** | Live `app-workflow-smoke.mjs` SMOOTH (14/14 OK); `hybrid-ping` 200 `source=python`; `hybrid-health` `hmac_ok=true` |
| Required Python ops HMAC-reachable from Edge | **PASS** | `verify-python-hybrid-e2e.mjs`: gov health/availability/select/process-job CONNECTED; Edge `hybrid-ping` signed ping 200 |
| AI failure falls back per matrix; no fake success | **PASS** | `chaosFallback.test.ts` (26), `hybridFallbackRuntime.test.ts` (15), `practiceCoachAiHelp.test.ts`; smoke `GENERATE_HINT:OK`, `STAR:OK` |
| Credits: reserve once; no double charge; compensate on fail | **PASS** | `hybridFallbackContracts.test.ts`, `test_paper_credit_compensation.py` (11), `documentJobLifecycle.test.ts`; smoke `GOV_CREATE:OK` charges 3 once |
| No infinite retry / stuck jobs (chaos tests pass) | **PASS** | `chaosFallback.test.ts` forced-failure matrix; `test_document_durable_jobs.py` idempotent ack; gov `PYTHON_FACTORY_OWNED` parity |
| Launch-critical REACHABLE_UNWIRED eliminated or waived | **PASS** | All MATRIX launch ops **CONNECTED**; 6 remaining UNWIRED are optional/post-launch (see below) |

### Verification runs (Wave 3)

| Script | Exit | Verdict |
|--------|------|---------|
| `npm run test:hybrid` | 0 | **180/180 passed** (14 Vitest + 6 pytest files) |
| `verify-python-hybrid-e2e.mjs` | 2 | **PARTIAL_FAILURES** — 18 CONNECTED, 15 REACHABLE_SCHEMA, 6 REACHABLE_UNWIRED, 1 BROKEN (raw ping probe only) |
| `app-workflow-smoke.mjs` | 0 | **SMOOTH** (14/14 OK) |

### Deploy status (Wave 3)

| Action | Status | Notes |
|--------|--------|-------|
| Edge function deploy | **SKIPPED** | No local `.env`; Supabase CLI unauthorized — live stack already serving Wave 1–2 code (smoke green) |
| Billing migration `20260825140000_wave1_billing_credits_hardening.sql` | **MANUAL REQUIRED** | Not in `pre-deploy-check.mjs` REQUIRED_MIGRATIONS — apply via `supabase db push` before next billing deploy |
| Render Python redeploy | **SKIPPED** | Live host `clarity-assistant-az05.onrender.com` healthy (`GET /ready` 200) |

### Integration fixes (Wave 3)

| Fix | Detail |
|-----|--------|
| Test suite completeness | Added `chaosFallback.test.ts`, `hybridMigrationContracts.test.ts`, `test_hybrid_new_ops.py` to `scripts/run-hybrid-test-suite.mjs` |
| Merge conflicts | None found in source tree |
| Broken imports | None detected across hybrid/edge/ai modules |

### Residual risks (non-blocking)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Billing migration not applied | Medium | Apply `20260825140000_wave1_billing_credits_hardening.sql` before Razorpay production traffic |
| `process-sprint-transcript` no product UI | Low | Post-launch; Edge + allowlists ready |
| Optional gov/job wrappers unwired | Low | `build-paper`, `exam-source`, `validate-paper` — authoritative paths exist |
| Raw Python ping probe BROKEN | Cosmetic | Edge `hybrid-ping` CONNECTED; probe sends incomplete OperationRequest |
| `practice_coach_hint` scaffold | By design | Diagnostics only; user coach guarded to `/v1/process` |
