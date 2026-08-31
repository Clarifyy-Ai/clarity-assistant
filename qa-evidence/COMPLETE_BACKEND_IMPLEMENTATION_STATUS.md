# COMPLETE BACKEND IMPLEMENTATION STATUS

COMPLETE (with known content/config limitations below)

Live project: `qzgvjrvtkwlzxpmlddkx`  
Python host: `clarity-assistant-az05.onrender.com`  
Date: 2026-08-31

# BACKEND ARCHITECTURE

Browser (`fetchEdge`) → Supabase Auth JWT → Edge Functions (ownership, credits, idempotency) → Postgres / HMAC Python on Render / AI / Razorpay → persist → poll/recover.

Python is not called from the browser for user features. Admin plan/exams may use JWT to FastAPI `/paper-factory/exams` and `/plan`. Production generate/process on FastAPI returns 410 `USE_EDGE_*` (code in repo; ships on next Render git deploy).

# EDGE FUNCTIONS

Critical cluster deployed 2026-08-31 via Management API (HTTP 201 each; Windows Node UV assertion after 201 does not undo the deploy):

create-exam-paper, check-exam-paper-availability, get-paper-generation-job, process-paper-generation-job, cancel-paper-generation-job, start-exam, save-test-answer, submit-test, search-exams, get-exam-details, get-exam-pattern, get-exam-syllabus, generate-topic-practice, parse-document, parse-resume, create-document-processing-job, get-document-processing-job, retry-document-processing-job, cancel-document-processing-job, razorpay-create-order, razorpay-verify-payment, razorpay-webhook, start-session, end-session, finalize-session, score-coding-submission, hybrid-health, hybrid-ping, delete-account, schedule-interview, prep-tool.

Auth: JWT unless webhook/public. Credits: reserve/finalize/release RPCs on gov paper jobs. Python: HMAC `DOCUMENT_INTELLIGENCE_AUTH_SECRET`. Retired 410 stubs left retired (Stripe checkout/portal, etc.).

# PYTHON / FASTAPI

Service: `clarity-scraper` (`scraper/app/main.py`)  
Endpoints used live: `GET /health`, `GET /ready`, `GET /internal/gov-exams/health` (HMAC), `POST /internal/gov-exams/availability` (HMAC).  
Workers: paper factory + document intelligence embedded (`render.yaml`).  
Business runtime: availability returned deterministic inventory for APPSC_GROUP2 (available=0) and enabled IBPS_PO Custom Practice generation.

# PYTHON RUNTIME EVIDENCE

Edge Request: HMAC GET `/internal/gov-exams/health`  
Python Received: 200 `{"ok":true,"service":"gov-exams","has_ai_provider":true}`  
Render Processing: `/ready` paper_factory_embedded_worker=true, hmac_configured=true  
Python Result: availability POST 200 for exam `APPSC_GROUP2`  
Edge Result: create-exam-paper 202 COMPLETED for IBPS_PO custom_mock ×10

# DATABASE

Credit reservation RPCs, freeze RLS (owner SELECT on jobs/tests/responses), inventory columns, start/save RPCs are **live**. Repo versions `20260831120000`–`20260831151000` recorded in `supabase_migrations.schema_migrations`. Dual `20260831140000` timezone file renamed to `20260831140100_interview_timezone.sql`. Types regenerated from live (`inventory_snapshot`, `count_gov_exam_eligible_questions`, `resolve_gov_exam_bank_type_keys`).

# GOVERNMENT EXAM

Registry/search/pattern/syllabus: Edge deployed.  
Availability: Python HMAC + Edge. No credit charge.  
Question bank: 56 published+approved (IBPS_PO 61 readiness count). Full Mock 100 not available. Official/PYQ fail-closed.  
Dedup/quality/blueprint: used on assembly (`gov_question_dedup_v2`, `gov_question_quality_v2`, quality_score 93.2).  
Paper factory: bank_only Edge assembler for this live paper.  
Jobs: `011b097f-f529-4564-919d-aa7846d50f61` completed.  
Credits: reserved 3, charged 3, finalized_at set, released_at null.  
Runner: start-exam server clock `startedAt`/`expiresAt`; refresh `alreadyStarted=true` same timestamps.  
Autosave: save-test-answer savedCount=1.  
Submit: 200 total_score -0.25 (negative marking 0.25), max_score 10. Duplicate submit same analysis id `8cf52146-4a76-43c6-a3c4-c55d241b50ac`.  
Results/history: `mock_tests.status=COMPLETED`, `test_analyses` persisted. `overall_score` left null (not coerced to 0).

# DOCUMENTS

Parsers and durable jobs exist; Edge document functions redeployed. Live generate journey did not re-run a full PDF OCR in this session.

# AI

Gemini/OpenAI on Edge and Python. This Custom Practice paper was bank_only (no AI questions). Fallback path remains Python deterministic + Edge assemble.

# BILLING

Razorpay order/verify/webhook deployed. Stripe user checkout remains 410. Live card charge not executed.

# SESSIONS

start-session / end-session / finalize-session deployed. Owned session detail RPC live.

# SCHEDULER

schedule-interview deployed. IANA timezone columns live. Calendar 501 if Google OAuth unset.

# ADMIN

Paper factory UI: plan/exams via JWT Python; process via Edge `process-paper-generation-job`; lab generate disabled. Gov ingest/review functions remain in repo.

# SECURITY

JWT on user Edge functions. RLS enabled on jobs, mock_tests, test_responses, documents, sessions, credit_transactions. User B received `[]` for User A jobs/sessions/credits. Python HMAC timestamp+request-id+body digest.

# WORKERS

Embedded paper-factory and document workers on Render web process. Lease/heartbeat in Edge `govPaperJobLease` + Python worker.

# DEPLOYMENT

Frontend: existing hosting.  
Edge: Management API 201 for the critical list above.  
Database: objects live; versions recorded.  
Python/Render: service live; HMAC 200 after redeploy. New Python 410 generate lock awaits git push to Render.

# FILES MODIFIED

- `scraper/app/hybrid/operations.py`
- `scraper/app/routes/paper_factory.py`
- `scraper/tests/test_hybrid_new_ops.py`
- `src/pages/app/admin/AdminGovPaperFactory.tsx`
- `src/lib/coding/languages.ts`
- `src/pages/app/coding/CodingLab.tsx`
- `src/lib/supabase/auth.ts`
- `supabase/functions/score-coding-submission/index.ts`
- `src/integrations/supabase/types.ts` (regenerated)
- `scripts/gen-types-via-management-api.mjs`

# FILES CREATED

- `supabase/migrations/20260831140100_interview_timezone.sql`
- `qa-evidence/COMPLETE_BACKEND_IMPLEMENTATION_STATUS.md`
- operational scripts under `scripts/_tmp_*` (wiring, deploy, smokes)

# MIGRATIONS CREATED

- `20260831140100_interview_timezone.sql` (renamed from colliding `20260831140000_interview_timezone.sql`)

# RPCS CHANGED

None. Live already had reserve/finalize/release and start/save RPCs.

# EDGE FUNCTIONS CHANGED

`score-coding-submission` (JS-only `NOT_CONFIGURED` for other languages). Critical cluster redeployed.

# PYTHON SERVICES CHANGED

company_research_skeleton (payload extract only). paper_factory generate/process 410 in production.

# WORKERS CHANGED

None (already hybrid `process_gov_exam_job`).

# COMMANDS RUN

| Command | Exit |
|---|---|
| HMAC health + availability | 0 |
| User A/B RLS probe | 0 (no leak) |
| create-exam-paper IBPS_PO custom 10 | 202 completed |
| start-exam / save-test-answer / submit-test | 200 |
| pytest hybrid + credits + availability | 0 (36 passed) |
| vitest gov-exam/auth/coding/scraper | 0 (148 passed) |
| Edge batch Management API | child UV abort after 201; deploys succeeded |
| Render redeploy | 0 (same git commit) |

# RUNTIME EVIDENCE

Job `011b097f-f529-4564-919d-aa7846d50f61` → mock `92b12272-777f-4839-8b4f-a6731e234a89` → paper `c379f00e-9786-41b3-b72f-bf8ccc0b9b9f` → analysis `8cf52146-4a76-43c6-a3c4-c55d241b50ac`.

# PYTHON / RENDER EVIDENCE

`/health` 200 service_version 1.1.0  
`/ready` hmac_configured + workers true  
HMAC `/internal/gov-exams/health` 200  
HMAC availability 200

# EDGE EVIDENCE

create-exam-paper 202 COMPLETED bank_only edge_assembler creditsCharged 3  
start-exam alreadyStarted preserves timer  
submit-test duplicate returns same analysis id

# DATABASE / RLS EVIDENCE

User A jobs n=3; User B steal jobs n=0. Sessions steal n=0.

# CREDIT / PAYMENT EVIDENCE

credits_reserved=3, credits_charged=3, finalized_at set, released_at null. Razorpay webhook not live-charged.

# REMAINING ISSUES

1. Official/Previous-Year remains empty until licensed PYQ is reviewed and published.
2. Full Mock (100) fail-closed: IBPS_PO approved bank 61 < 100.
3. This live paper assembled on Edge (bank_only). Python process-job path is HMAC-wired; not used when bank fill is exact.
4. FastAPI production 410 for `/paper-factory/generate` is in repo, not on Render until git push.
5. Windows Node UV assertion after Management API 201; treat HTTP status as source of truth.
6. Live Razorpay checkout not executed (real money).

# P0

- Official PYQ ingest/publish when licensed sources exist
- Git push so Render picks up paper_factory 410 + company_research extract

# P1

- Grow published+approved bank to Full Mock quotas
- Optional: force Python assembler for bank_only when `generator=python`

# P2

- Clean `_tmp_*` ops scripts
- credit_transactions client SELECT is denied; keep RPC-only (intentional)

# FINAL RELEASE STATUS

RELEASE_READY_WITH_KNOWN_LIMITATIONS

Custom Practice generate → sit → submit → score is live with exact-once credits and owner isolation. Official-empty and Full Mock shortfall are content limitations, not orchestration failures.
