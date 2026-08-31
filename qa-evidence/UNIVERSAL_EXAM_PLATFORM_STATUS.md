# COMPLETE EXAM PLATFORM STATUS

PARTIALLY_COMPLETE

The hybrid engine is config-driven (registry + pattern + syllabus + bank + Python + Edge + optional AI). It is not an `if exam == SSC` system. JEE / NEET / HPCL / PSU are now registry configuration routed onto the same generate path as SSC. Live apply of the new seed, Edge/Python deploy, and SEARCH→SIT→SUBMIT proof were out of scope for this session.

## EXAM REGISTRY

COMPLETE in code. Canonical table remains `gov_exams` (used by frontend, Edge, Python, admin). New seed adds academic/professional families and exams: `JEE_MAIN`, `JEE_ADV`, `NEET`, `HPCL_ENGINEER`, `PSU`. Not applied to live DB.

## PATTERN ENGINE

COMPLETE. Versioned `gov_exam_pattern_versions` + `gov_exam_sections`. Full Mock uses pattern `total_questions`. Academic/professional practice patterns included in the new seed (verify on official sites).

## SYLLABUS ENGINE

COMPLETE. Versioned `gov_exam_syllabus_versions.topics_json`. Historical papers stay on the version frozen at generation.

## QUESTION BANK

COMPLETE as a universal bank (`questions` with exam_type / provenance / review / publish / fingerprints / generated flags). Coverage is content-limited: Full Mock for large papers still fail-closed when the eligible bank is short.

## PYTHON ENGINE

Files: `scraper/app/gov_exams/engine.py`, `repair.py`, `slot_fill.py`, `availability.py`, `validator.py`, `paper_factory/*`
Services: FastAPI `clarity-scraper` (`/internal/gov-exams/*`)
Endpoints: availability, select (IDs only), validate-questions, process-job, build-paper
Paper generation: `process_gov_exam_job` (worker + HTTP). `PaperFactory.generate()` shares slot-fill + `repair_paper`.
Deterministic generation: `generate_practice_variants` / `_fill_deterministic_slots` (practice-labelled, never official)
Validation: `validate_question_payloads` + `validate_assembled_paper`
Dedup: deterministic fingerprints / near-duplicate reject
Quality: `CandidateValidator` / `score_assembled_question`
Deployment: not shipped this session
Business runtime: local pytest proves a real `PaperResult` (count, sections, mix, fail-closed). Live Render process-job log not captured this session.

## EDGE ENGINE

Functions: create-exam-paper, check-exam-paper-availability, get/cancel/process-paper-generation-job, search-exams, get-exam-details/pattern/syllabus, generate-topic-practice, select-test-questions (CUSTOM), start-exam, save-test-answer, submit-test, extract-question-paper
Auth: JWT (user) / HMAC (Python)
Orchestration: availability → entitlement → reserve → job → Python or Edge assemble → validate → persist → finalize
Credits: reserve / finalize / release RPCs (Edge-owned)
Idempotency: job idempotency key; 409 replay
Python: HMAC `pythonGovProcessJob` ack-and-poll
AI: gap-fill only when mode/plan allows

## AI

Providers: Gemini/OpenAI on Edge and Python
Features: slot gap-fill after bank, schema + exam + topic + dedup + quality + blueprint
Fallback: Python deterministic when permitted; else `CONTENT_INSUFFICIENT`
Validation: never persist raw AI as official

## HYBRID EXECUTION

Question Bank: slot-aware fill (section + topic + difficulty)
Python: blueprint, selection, deterministic fill, repair, validate, persist
AI: remaining slots only
Fallback: bank → AI → deterministic → truthful terminal failure. No fake padding.

## GENERATION JOBS

States: queued → leased/selecting/generating/validating/assembling → completed | failed_retryable | failed_permanent | cancelled
Lease: claim + extend
Heartbeat: `repo.heartbeat` during AI `generate_for_slots`
Retry / cancellation / stale recovery: existing worker + Edge
Idempotency: create-exam-paper
Polling: `pollPaperJobUntilTerminal` stops on terminal; UI stages IDLE→CHECKING→QUEUED→GENERATING→VALIDATING→READY

## PAPER

Blueprint: deterministic `build_blueprint` from pattern/syllabus
Selection: `fill_bank_into_slots` (never dump leftovers into default_section)
Validation: question payloads + assembled paper; `repair_paper` bounded rounds
Persistence: `publish_paper` + `snapshot_json` provenance
Versioning: pattern / syllabus / blueprint / quality / scoring versions on paper

## RUNNER

Timer: server `started_at` / `expires_at` via start-exam
Palette / answers / autosave / review / submit: existing start-exam, save-test-answer, submit-test
Not re-proven live this session

## SCORING

COMPLETE in code. Config-driven marks + negative marking via submit-test. Not exam-hardcoded.

## RESULTS

COMPLETE in code. `mock_tests` + `test_analyses`; duplicate submit replays existing result.

## ADMIN

Ingestion: extract-question-paper (PDF/OCR/text) → `is_public=false`, `needs_review`
OCR: existing document intelligence / Gemini PDF path; failure is terminal/retryable, not fabricated questions
Review: existing Q Review admin
Auto-approval: deterministic `gov_exams/auto_approval.py` + `evaluate-auto-approval` (eligible content only)
Publication: separate from auto-approval

## SECURITY

JWT: Edge user functions
RLS: jobs / tests / responses / credits (prior session evidence: User B `[]` for User A)
Ownership: job + paper + attempt owner checks
Admin: requireAdmin on ingest
Python authentication: HMAC timestamp + body digest

## CREDITS

Reserve → process → finalize; failure → release once. Python does not mutate credits.

## DEPLOYMENT

Frontend: existing hosting
Edge: not redeployed this session
Python: not shipped this session
Database: new seed migration **not applied**
Workers: embedded paper-factory worker (Render config exists)
Cron: existing daily scrape (out of scope)

## RUNTIME EVIDENCE

Local only this session:
- pytest paper engine / factory / fail-closed / answer-map / auto-approval: **92 passed**
- vitest paperJobStatus / extract / examTypes / search families / select-test-questions contract: **57 passed**
Live SEARCH→SIT→SUBMIT and Render process-job: **not run** (explicitly out of scope).

## PYTHON/RENDER EVIDENCE

Not captured this session. Prior evidence (separate session): HMAC health 200; availability POST; IBPS_PO custom 10 completed. New `repair_paper` / academic registry code is not on Render until git deploy.

## FILES CHANGED (this session)

- `scraper/app/gov_exams/repair.py` — `repair_paper()` orchestrator
- `scraper/app/gov_exams/engine.py` — repair_paper; first stage `checking_availability`; AI heartbeat before repair
- `scraper/app/paper_factory/factory.py` — keep leftovers; repair after assemble
- `scraper/tests/test_gov_paper_engine.py` — 24/25 leftover + det repair tests
- `supabase/migrations/20260831180000_academic_professional_exam_registry.sql`
- `supabase/functions/_shared/govExamSearch.ts` — academic / professional families
- `supabase/functions/_shared/pdfQuestionExtract.ts` — no guessed answer letter
- `supabase/functions/select-test-questions/index.ts` — pythonGovValidateQuestions
- `supabase/functions/extract-question-paper/index.ts` — needs_review default when questions processed
- `src/lib/mock-test/examTypes.ts` — `registryCodeForConfigId`
- `src/lib/gov-exam/paperJobStatus.ts` — validating → VALIDATING
- `src/lib/gov-exam/extractQuestionPaper.ts` — parsePlainTextMcqs no guess
- `src/pages/app/mock-test/MockTestHub.tsx` — generate?code= for registry exams
- `src/pages/app/mock-test/TestConfigure.tsx` — getExamDetails redirect
- `src/pages/app/mock-test/GenerateGovPaper.tsx` — hydrate from code
- tests: `examTypes.test.ts`, `paperJobStatus.test.ts`, `extractQuestionPaper.test.ts`, `searchExamsContract.test.ts`, `govExamQualityFallback.test.ts`

Prior uncommitted stack (already in tree): slot_fill, provenance snapshot, process-job ack `success=False`, heartbeat, generate-topic-practice inventory+validate, auto-approval.

## MIGRATIONS

- `20260831180000_academic_professional_exam_registry.sql` (seed only; not applied)

No new columns. Provenance remains on existing `snapshot_json` / `source_mix`.

## EDGE FUNCTIONS CHANGED

- `select-test-questions`
- `extract-question-paper`
- `_shared/govExamSearch.ts`
- `_shared/pdfQuestionExtract.ts`
- (prior) `generate-topic-practice`

## PYTHON FILES CHANGED

- `gov_exams/repair.py`, `engine.py`
- `paper_factory/factory.py`
- (prior) `slot_fill.py`, `schemas.py`, `repository.py`, `models.py`, `routes/gov_exams.py`

## WORKERS CHANGED

None structurally. Embedded worker still calls `process_gov_exam_job` (now with repair_paper).

## REMAINING ISSUES

1. Academic/professional seed is **not applied** to live DB. Until then, hub `?code=JEE_MAIN` will not auto-select; configure falls back to the wizard.
2. No Edge / Python / frontend deploy this session.
3. TSPSC is still unregistered (`registryCodeForConfigId` → null).
4. CUSTOM / Quick Drill still uses `select-test-questions` (now Python-validated), not the durable job factory.
5. Full Mock remains fail-closed when the eligible bank cannot fill the pattern.
6. Factory leftover repair is skipped on the no-AI/no-det fail-closed path (intentional).
7. If Python validate HTTP fails, select-test-questions / topic-practice keep the current set (fail-open on transport).
8. Browser E2E of hub → generate was not run (no browser tools in this session).

## RELEASE STATUS

RELEASE_READY_WITH_KNOWN_LIMITATIONS
