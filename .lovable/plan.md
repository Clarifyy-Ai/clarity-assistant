
# Gov Exam Scraper — Integration & Hardening Plan

Per your standing preference, this is an audit-first, component-scoped plan. I will NOT change `ExamPapers.tsx`, `TestSession.tsx`, the existing `bulk-import-questions` edge function, or the working `questions`/`exam_papers` read paths. Each phase below is a separate approval gate — confirm which phases to execute, in what order.

---

## Phase 0 — Decisions needed from you (blockers)

1. **Where will FastAPI actually run?** Lovable's sandbox cannot host a long-running Python service. Options:
   - (a) You self-host (Fly.io / Render / your VPS) and give me the public URL → I set `VITE_SCRAPER_URL`.
   - (b) Drop FastAPI; move scraping into a Supabase Edge Function (Deno) that calls into `bulk-import-questions`. Simpler, no second service, but no OCR/pdf2image.
   - (c) Keep FastAPI as a one-shot CLI run locally by an admin; remove the web-trigger UI entirely.
2. **Auth model for the scraper endpoint:** verify Supabase JWT + check `user_roles.role='admin'` (current design), or a shared `INGEST_API_KEY` only? JWT+admin is correct; confirming before I wire it.
3. **Scope of this turn:** P0 only (wiring + schema + CORS), or also P1 (UPSC answer-key parser)? Recommend P0 first, ship, then P1.

---

## Phase 1 (P0) — DB schema (migration, isolated)

New tables only — does NOT touch `exam_papers`, `questions`, or any read path:

- `public.scrape_jobs` (id, exam_type, year_from, year_to, status, progress jsonb, logs jsonb, created_by, timestamps)
- `public.scrape_ingested` (source_url unique, file_hash, paper_id fk, job_id fk, ingested_at) — replaces the `scrape_failures` "INGESTED:" marker hack
- `public.scrape_failures` (id, job_id, source_url, status_code, error, created_at) — clean version, drop misuse
- `public.exam_images` (id, paper_id fk, question_id fk nullable, storage_path, public_url, alt_text, timestamps)
- Unique index on `questions (exam_type, source_year, md5(question_text))` to block duplicates
- GRANTs: `service_role` ALL; `authenticated` SELECT gated by `has_role(auth.uid(),'admin')` RLS
- RLS: admin-only read/write on all four tables

## Phase 2 (P0) — FastAPI CORS + JWT-only auth contract

Files: `scraper/app/main.py`, `scraper/app/core/security.py`, `scraper/app/core/config.py`

- Add `CORSMiddleware` allowing preview + published Lovable origins (env-configurable list).
- Confirm `verify_supabase_jwt` enforces `user_roles.role='admin'` via service-role client.
- Validate required env at startup; fail fast with clear message.

## Phase 3 (P0) — Frontend wiring (admin-only, additive)

New files only; legacy `collect-exam-papers` button stays as fallback until you confirm removal:

- `.env.example`: add `VITE_SCRAPER_URL`
- `src/lib/scraper/client.ts`: `startJob`, `getJob`, `pauseJob`, `resumeJob`, `cancelJob` — pass `Authorization: Bearer ${session.access_token}`
- `src/hooks/useScrapeJob.ts`: polls `/scrape/{id}` every 2s while `running|queued|paused`
- `src/pages/app/admin/AdminSeedQuestions.tsx`: add a new "FastAPI Scraper" card next to (not replacing) existing controls — exam picker, year range, Start, progress bar, pause/resume/cancel, last 20 log lines, error retry. Hidden unless `useAuth().isAdmin`.

## Phase 4 (P1) — UPSC parser correctness (separate turn)

- Fetch matching Answer Key PDF, parse `1.(b) 2.(c)…` grid, map by index.
- Tighten question regex; reject stems <20 chars or with <4 distinct options.
- Mark paper `partial` instead of inserting wrong answers on failure.

## Phase 5 (P1) — Storage layer fixes

- Use new `scrape_ingested` table for idempotency (drop `INGESTED:` marker).
- Update `total_questions` on re-ingest.
- Insert into `exam_images` (now exists post-Phase 1); stop swallowing errors silently.

## Phase 6 (P2) — Worker hardening

- Persist `JobHandle` snapshots to `scrape_jobs` on every progress tick.
- Pipe pipeline structlog events into `log_buffer` so `/scrape/{id}.logs` is non-empty.
- Register additional sources (SSC/IBPS) as no-op stubs returning a clear "not implemented" error instead of 500.

## Phase 7 (P3) — Container (only if you self-host FastAPI)

- Add `poppler-utils` + `tesseract-ocr` to `scraper/Dockerfile`.
- Document required env vars in `scraper/README.md`.

---

## Guardrails (will not change)

- `src/pages/app/mock-test/ExamPapers.tsx`
- `src/pages/app/mock-test/TestSession.tsx` and orchestrator hook
- `supabase/functions/bulk-import-questions/*`
- `questions` / `exam_papers` table shape (only adding an index)
- The legacy `collect-exam-papers` button (kept until you say remove)

## My recommendation

Answer the three questions in Phase 0, then I execute **Phase 1 → 2 → 3** in one focused turn (DB migration + CORS + admin UI wiring). Phases 4–7 in follow-up turns so each stays reviewable.
