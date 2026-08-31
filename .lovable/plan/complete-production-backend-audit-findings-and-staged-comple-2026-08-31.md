# Complete Production Backend — Audit Findings and Staged Completion Plan

## What the audit found (evidence, not assumptions)

- **91 Edge Functions** exist, covering auth-adjacent flows, credits, documents, gov exams, billing (Razorpay + Stripe), sessions, admin, AI. Zero `TODO`/`FIXME`/"not implemented" markers in edge code.
- **Python/FastAPI** (`scraper/app`) exposes 28 routes: availability, `/build-paper`, `/select`, `/plan`, `/validate-questions`, `/jobs/document`, `/jobs/exam-source`, `/jobs/validate-paper`, job lease/process/cancel/pause/resume, `/health`, `/ready`, `/metrics`. 14 placeholder-ish markers remain to triage.
- **Edge → Python** goes through `_shared/pythonClient.ts` with `PYTHON_SERVICE_URL`/`SCRAPER_URL` + `PYTHON_SERVICE_AUTH_SECRET` (HMAC), plus a `HYBRID_FORCE_PYTHON_UNAVAILABLE` kill switch and `hybridExecute.ts` fallback router. Architecture matches the required Browser → Edge → Python shape.
- **Gov exam platform** already has registry, versioned patterns/syllabi, durable `gov_paper_generation_jobs`, blueprint/paper factory, deterministic dedup/quality, auto-approval rule engine with idempotent events and admin audit.
- `hybrid-health` correctly rejects unauthenticated calls (`401 AUTH_INVALID`) — so runtime business-health evidence needs an authenticated session, not an anon curl.
- 19 `localhost` references remain in `src/` (mostly dev-only paths) — each needs classification before removal.

Conclusion: the backend is **not** a greenfield build. It is largely built. What is missing is *verified completeness* per component. A single sweeping rewrite would risk the working gov-exam path, which your guardrails forbid.

## How this will be executed

Component-by-component, each shipped and verified independently, existing working features untouched. Each stage ends with real runtime evidence (authenticated edge call → DB row → response), not a compile pass.

### Stage 1 — Runtime truth baseline
Authenticated probes of `hybrid-health`, `health`, `ping`, `hybrid-ping`; confirm `PYTHON_SERVICE_URL` + HMAC secret are set and Render is reachable; record which Python business endpoints answer a real request (not `/health`). Produce the definitive live/dead map for the 91 edge functions and 28 Python routes.

### Stage 2 — Python business layer
Triage the 14 placeholder markers; complete typed request/response models, HMAC replay protection (timestamp + request id + body), correlation/operation IDs, timeouts, structured errors on every business route. No fake `return {"success": True}`.

### Stage 3 — Gov exam end-to-end certification
Run the full journey against production data: search → availability (free, no AI) → generate (idempotent operation id, 409 on duplicate, bounded 429 retry) → validation → paper → attempt → server timer → autosave → submit → scoring → result → history → refresh recovery at each step. Fix only what fails.

### Stage 4 — Documents / Resume / JD
Real PDF, DOCX, TXT and scanned-PDF uploads through Edge → Python → OCR → persistence; verify corrupt/empty/oversized/cancel/retry paths and that selected Resume/JD reaches Practice Coach context.

### Stage 5 — Credits, billing, webhooks
Verify reserve → finalize → compensate is exactly-once under duplicate submit and failed generation; Razorpay signature verification, webhook replay protection, one payment → one fulfillment; ledger has no negative balance path.

### Stage 6 — Sessions, live copilot, mock, scheduler, notifications, settings
Persistence and refresh recovery for each; `NOT_CONFIGURED` returned truthfully where calendar/notification providers are absent.

### Stage 7 — Admin, storage, RLS isolation
User A vs User B vs admin vs moderator checks on every owned table; private bucket signed-URL/expiry checks; admin writes persist, audit, and propagate.

### Stage 8 — Hardening sweep
Request-storm/polling/duplicate-mutation root causes, production `localhost` removal, unified error model, observability fields, then the final acceptance-gate report in your requested format.

## Technical notes
- Additive migrations only; applied migration history is never rewritten.
- No new Playwright/Cypress/test infrastructure; verification uses existing commands, real workflows, network/console/DB/deployment evidence.
- The gov-exam path stays working throughout; the generic exam path converges onto it rather than being duplicated.

## What I need from you
Confirm the stage order, or name the stage to start with. I will not run all eight in one pass — that is how working features get broken.
