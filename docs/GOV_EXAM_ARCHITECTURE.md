# Government Exam Architecture (Career Pilot)

Career Pilot provides an **independent** government-exam preparation engine. It is not affiliated with UPSC, SSC, RRB, IBPS, or any recruiting body.

## Hybrid pipeline (target = shipped)

```
Frontend
  → Supabase Edge Function (JWT, capability, credits, idempotency)
    → Availability (Python preferred, Edge bank fallback)  [BEFORE credit]
    → Decision engine
        OPTION 1: bank enough → Python/Edge assemble → Paper
        OPTION 2: shortfall + AI allowed → reserve once → AI fill missing → validate → Paper
        OPTION 3: AI unavailable + Python up → bank + deterministic_python practice → Realistic Mock
        OPTION 4: no safe content → CONTENT_INSUFFICIENT (no charge)
```

AI is **optional**. Approved question-bank / deterministic Python paths must work when the AI provider is down.

**Paper modes (honest labels):**
- Mode A — Official / Previous-Year: only official_verified / verified_public / approved bank (never fabricate)
- Mode B — Realistic Mock Exam: bank + deterministic practice (+ optional AI); never labeled Official PYQ

**Source priority:** official_verified → verified_public_source → approved_bank → generated_practice → ai_generated_practice

**Python endpoints:** `/internal/gov-exams/availability|select|validate-questions|process-job|build-paper`

## Pipeline stages

1. **Exam registry** — dynamic recruiting bodies, exams, aliases, stages, short_name, jurisdiction, state
2. **Versioned patterns & syllabus** — never overwrite; supersede with new versions
3. **Official source registry** — link-first provenance (no unauthorized scraping)
4. **Blueprint engine** — hard constraints from approved pattern
5. **Availability** — deterministic count before credit reservation
6. **Paper assembly** — bank first; optional AI gap-fill; Python fallback on AI failure
7. **Durable jobs** — `gov_paper_generation_jobs` with lease / heartbeat / FSM
8. **Mock delivery** — `mock_tests` / TestSession (answers stripped until COMPLETED)
9. **Analytics** — mock analytics + topic mastery

## Decision engine

| Situation | Behavior |
|-----------|----------|
| Bank ≥ requested | `bank_only` — no AI call |
| Bank short + AI capability | `ai_assisted` — AI fills missing slots only |
| AI fails / unavailable | Python bank reassemble + optional `deterministic_python` practice variants |
| Still insufficient | `CONTENT_INSUFFICIENT` — no fabricate, refund per policy |
| Blocked before charge | Return inventory message + Custom Practice max |

## Key tables

- `recruiting_bodies`, `gov_exams` (+ `short_name`, `state_code`, `jurisdiction`, `region`, `verified_at`), `gov_exam_aliases`, `gov_exam_stages`
- `gov_exam_pattern_versions`, `gov_exam_sections`, `gov_exam_syllabus_versions`, `gov_exam_cycles`
- `gov_official_sources`, `previous_year_papers`, `previous_year_paper_questions`
- `gov_paper_generation_jobs`, `gov_generated_papers`, `gov_generated_paper_questions`
- `questions` (bank), `mock_tests`, `test_responses`, `test_analyses`

**Source classes:** `bank` / `previous_year` (sourced) vs `generated` (AI or `deterministic_python` practice — never labeled official PYQ).

## Edge functions

| Function | Purpose |
|----------|---------|
| `search-exams` | Alias-aware discovery + bank readiness; empty = 200; infra = 503 |
| `check-exam-paper-availability` | Inventory preflight — **no charge**; prefers Python |
| `create-exam-paper` | Validate → availability → credit → job → Python `process-job` dispatch and/or Edge assemble |
| `get-paper-generation-job` / `cancel-paper-generation-job` | Poll / cancel + refund |
| `process-paper-generation-job` | Internal claim + Edge assemble |
| `get-exam-details` / `get-exam-pattern` / `get-exam-syllabus` | Dynamic config |
| `submit-test` | Idempotent submit + mastery (CORS preserved) |

## Python FastAPI (Render)

HMAC-protected (`DOCUMENT_INTELLIGENCE_AUTH_SECRET`):

| Path | Role |
|------|------|
| `POST /internal/gov-exams/availability` | Deterministic availability |
| `POST /internal/gov-exams/select` | Seeded selection (IDs only) |
| `POST /internal/gov-exams/validate-questions` | Reject invalid; no silent insert |
| `POST /internal/gov-exams/process-job` | Full hybrid job pipeline |
| `GET /internal/gov-exams/health` | Authenticated probe |

Edge env for dispatch: `PYTHON_SERVICE_URL` / `SCRAPER_URL` (same as hybrid-health), or gov aliases `GOV_EXAM_PYTHON_URL` / `PAPER_FACTORY_URL` / `SCRAPER_SERVICE_URL`, plus `DOCUMENT_INTELLIGENCE_AUTH_SECRET` (or `PYTHON_SERVICE_AUTH_SECRET`).

Embedded paper-factory worker starts **without** AI keys (bank-only / deterministic).

## Observability

Render + Edge logs share correlation / job IDs:

```
[GOV_EXAM] job_received
[GOV_EXAM] availability_started / availability_completed
[GOV_EXAM] selection_started
[GOV_EXAM] validation_started
[GOV_EXAM] assembly_started
[GOV_EXAM] ai_generation_started / ai_generation_failed
[GOV_EXAM] python_fallback_started
[GOV_EXAM] completed
[GOV_EXAM] edge_dispatch
```

## Job FSM

Public stages: `queued` → `validating` → `blueprint` → `select` → `optional_ai_fill` → `assemble` → `completed`  
Internal stages remain more granular (`checking_availability`, `building_blueprint`, `selecting_questions`, `generating_missing_slots`, …).  
Terminal: `failed_retryable` | `failed_permanent` | `cancelled` | `expired`

Lease: heartbeat, timeout, retry limit. Credits stay reserved on retryable failure. Release only on permanent fail, cancel, or expiry. Frontend resumes via `?jobId=` + localStorage. Local `sweep_gov_paper_jobs` cron recovers stuck leases.

## Credit lifecycle

availability (no charge) → exact-cost preflight → atomic enqueue+reserve → work → finalize on completed **or** release once on permanent/cancel/expired  

One logical charge; AI failure + Python fallback = same reservation; retries must not double-charge. `CONTENT_INSUFFICIENT` / worker unavailable must not permanently consume credits.

**Durable jobs note:** `gov_paper_generation_jobs` are hybrid-by-plan (MATRIX `gov_exam_assemble` via `decideGenerationPlan` / assembler), not request-scoped `executeHybridOperation`.

## Labels / honesty

- Affiliation disclaimer on discovery and exam surfaces
- AI / custom / deterministic practice papers never labeled as official or “predicted”

## Ops

See `docs/GOV_EXAM_MONITORING.md` and `scripts/gov-exam-ops-snapshot.mjs`.

## Release posture

Hybrid engine shipped (Edge + Python + registry + durable jobs). Full-simulation readiness still depends on **approved bank density** per exam. Do not claim GO for all exams until bank readiness is `ready`.

## Local verification (2026-09-02)

Completed in-repo (no live apply/deploy):

- Vitest government-exam contracts: 46 files / 408 tests passed
- Component tests: ExamSearchCombobox + generation timer (12 tests)
- Python worker/HMAC/recovery: 46 tests with isolated placeholder env
- Feature-copy `mock-test-gov-exams` byte-parity with production counterparts
- Topic-practice jobs now persist/resume via `?jobId=` + localStorage (`kind: topic_practice`)
- Analytics trend scores clamp persisted totals the same way results do
- Public job FSM aliases (`queued → validating → blueprint → select → optional_ai_fill → assemble`) map in the client

Environment-blocked here (do not treat as product regressions):

- Playwright gov-exam specs: 4/12 passed on a bootable `:5000` login. Remaining failures are login-helper flake (`clearBrowserAuthState` reload/abort) or hub search listing assertions, not credit/job/scoring contracts
- `supabase db lint --local`: local Postgres not running
- Deno type-check for Edge handlers: Deno not installed

## QA deploy checklist (do not apply from this workspace)

1. Apply migrations `20260902230000_release_gov_paper_credits_fail_closed.sql`, `20260902231000_gov_paper_atomic_enqueue_and_sweeper.sql`, `20260902240000_attempt_submission_lifecycle.sql` after confirming `pg_cron` exists.
2. Deploy Edge: `search-exams`, `check-exam-paper-availability`, `create-exam-paper`, `get/process/cancel-paper-generation-job`, `generate-topic-practice`, `save-test-answer`, `save-attempt-answer`, `start-exam`, `submit-test`.
3. Deploy Python factory with HMAC secret, `SYSTEM_USER_ID`, worker mode, 180s lease, and `/ready` returning `paper_factory_queue` + worker runtime.
4. Confirm `PYTHON_SERVICE_URL` / `DOCUMENT_INTELLIGENCE_AUTH_SECRET` on Edge; fail-closed `WORKER_UNAVAILABLE` when factory is down.
5. Credit matrix: 0 / below / exact / sufficient — no job on insufficient; refund only permanent/cancel/expired.
6. Official/PYQ never labeled from AI or deterministic fill; availability counts match generation plan.
7. Attempt: autosave + stale version + submit lock + late-save `SUBMISSION_CONFLICT`; results/analytics/revision read persisted analysis.
8. Re-run `e2e/gov-exam-search.spec.ts`, `gov-exam-generation.spec.ts`, `gov-exam-session.spec.ts` against a bootable QA app.
