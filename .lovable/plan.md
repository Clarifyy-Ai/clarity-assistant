# Universal Hybrid Exam Platform — Audit + Completion Plan

## What already exists (verified in this project)

The hybrid engine described in your prompt is **largely built**, but only the "gov exam" branch uses it end to end.

- **Registry is already universal despite its name.** `gov_exams` holds `UPSC_CSE_PRELIMS, SSC_CGL, IBPS_PO, RRB_NTPC, TSPSC_GROUP2, APPSC_GROUP2, JEE_MAIN, JEE_ADV, NEET, HPCL_ENGINEER, PSU` with family/jurisdiction/aliases/stages.
- **Pattern + syllabus versioning:** `gov_exam_pattern_versions`, `gov_exam_sections`, `gov_exam_syllabus_versions`, `gov_exam_cycles`.
- **Durable jobs, fully specified:** `gov_paper_generation_jobs` has lease, heartbeat, attempt_count, retryable, idempotency_key, credit reserve/finalize/release, blueprint_json, inventory snapshot, random_seed.
- **Python engine is real:** `scraper/app/gov_exams/*` (availability, selection, deterministic_generate, slot_fill, validator, auto_approval, repair) plus `paper_factory/*` (blueprint, generator, validate, worker).
- **Edge orchestration:** `check-exam-paper-availability`, `create-exam-paper`, `process-paper-generation-job`, `get-/cancel-paper-generation-job`, `submit-test`.
- **Runner/scoring:** `mock_tests` has server `started_at` / `expires_at`; `submit-test` scores server-side.

## The real gap

There are **two divergent paper pipelines**:

```text
A. Gov path   : GovExamDetail -> check-availability -> create-exam-paper -> durable job
                -> Python/bank/AI -> validate -> paper -> TestSession
B. Generic path: TestConfigure -> select-test-questions -> create-test -> TestSession
```

Path B (used by every non-gov exam config, custom practice, and Exam Papers) is
request-scoped: no availability preflight before charge, no durable job, no blueprint
object, no operation idempotency, no 409-returns-existing, no cancel/resume, no
pattern/syllabus binding, and no paper-level final validation. That is why "some exams
work and others don't" and why refresh/double-click can misbehave.

## Plan — component by component

Each step is independently shippable. Guardrail for all steps: **do not modify the
working gov path's behavior, credit semantics, or the Python service contract**; the
generic path is migrated onto the same engine rather than a second engine being written.

### 1. Universal exam resolution (frontend + edge shared)
Replace the free-text `questions.exam_type` label matching in
`src/lib/mock-test/examTypes.ts` with resolution against the registry (code + aliases +
`legacy_exam_type`). One resolver module, reused by edge via `_shared`. No new hardcoded
`if exam ==` branches.

### 2. Universal availability preflight for path B
`TestConfigure` calls `check-exam-paper-availability` (Python preferred, edge bank
fallback) before any credit action, and renders requested/eligible/available/missing +
`can_full_exam` / `can_custom_exam`, exactly like the gov detail page. No charge when
`CONTENT_INSUFFICIENT`.

### 3. Route path B through the durable job engine
`create-exam-paper` becomes the single paper-creation entry point for all modes
(`OFFICIAL`, `FULL_MOCK`, `CUSTOM_PRACTICE`, `HYBRID`, `AI_PRACTICE`). `select-test-questions`
is kept but demoted to an internal selection step invoked by the job worker, so bank ->
Python -> AI gap-fill -> Python validation is identical for every exam. `create-test`
stays as the attempt/paper persistence step called by the worker.

### 4. Idempotency, 409 and 429 discipline
Client sends a stable `operation_id` per Generate click (persisted in localStorage with
the exam+config hash). Edge returns the **existing** job on duplicate (409 semantics) and
propagates `Retry-After` on 429. `pollPaperJob` already backs off — extend it to path B
and stop on all four terminal states.

### 5. Blueprint binding for every exam
Every job stores `blueprint_json` derived from the exam's active pattern version
(sections, subject/topic/difficulty quotas, marks, negative marks, language) and a
deterministic seed. Final paper is rejected if the blueprint's hard constraints are
unmet — no silent short papers.

### 6. Runner, timer, autosave parity
`TestSession` reads `started_at`/`expires_at` from the server for both paths, autosaves via
`save-attempt-answer` keyed on `(attempt_id, question_id)`, persists the four review
states, and re-hydrates on refresh from server state only.

### 7. Submission + scoring from configuration
`submit-test` takes marks/negative marks/section rules from the pattern version rather
than the request config, records `scoring_version`, and returns the existing result on a
duplicate submit.

### 8. Verification pass
For each registry exam: availability -> generate -> paper -> runner -> submit -> result,
plus the four negative cases (AI down, Python down, double Generate, refresh mid-job) and
a User A/User B isolation probe. Results captured in `docs/audit/`.

## Technical notes

- No new tables are required for steps 1-4; `gov_paper_generation_jobs` already carries
  everything needed and is exam-agnostic. Step 5 may add a `blueprint_version` column and
  step 7 a `scoring_version` column on `mock_tests`.
- Python contract (`/internal/gov-exams/*`) is unchanged; only more callers.
- Credits stay edge/database-owned: reserve -> process -> finalize/refund once. Python never
  mutates credits.

## Suggested order to execute

Steps 1-2 first (cheap, immediately fixes "no questions available" confusion), then 3-4
(the core unification), then 5-7, then 8.

Tell me if you want all eight in one pass, or step 1-2 shipped and reviewed first.
