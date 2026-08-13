# PRODUCTION_EVIDENCE.md

Only commands actually executed in this remediation sprint are listed. No secrets are recorded.

## Government Exam Engine pilot (2026-08-02)

| Item | Result |
|------|--------|
| Migrations `20260802120000_gov_exam_registry` + `20260802120100_gov_exam_pilot_seeds` | Applied remote HTTP 200 |
| Migration `20260802130000_gov_exam_state_psc_pilot` (APPSC Group-II Screening) | Applied remote HTTP 200 |
| Pilot exams in DB | SSC_CGL, RRB_NTPC, IBPS_PO, UPSC_CSE_PRELIMS, APPSC (state_psc) — `approved` + `is_public` |
| Paper-class UX + disclaimer unit tests | `disclaimers.test.ts` — **6 passed** |
| Gov validators / multi-agent / quality gates | Full `src/test/gov-exam` — **63 passed** |
| Edge redeploy `create-exam-paper` (quality+similarity) | Deployed `--use-api` |
| Edge deploy `reconcile-paper-quality` | Deployed `--use-api` (admin re-score) |
| Migration `20260802140000_previous_year_papers_ingestion` | Applied remote HTTP 200 |
| Edge deploy `ingest-source-document` + `list-previous-papers` | Deployed `--use-api` |
| PYQ tables verified | `previous_year_papers`, `previous_year_paper_questions`, `source_ingestion_jobs` |
| Migration `20260802130000_gov_exam_admin_rls` | Applied remote HTTP 200 |
| Admin gov console routes | `/app/admin/gov/{sources,exams,question-review,paper-review}` |
| `adminOps.test.ts` | **4 passed** |
| Migration `20260802130000_topic_mastery_adaptive` | Applied remote HTTP 200 |
| Mastery tables verified | `topic_mastery`, `exam_readiness`, `preparation_plans` |
| Edge deploy `recompute-topic-mastery` + redeploy `submit-test` / `create-exam-paper` | Deployed `--use-api` |
| Full `src/test/gov-exam` after agent merge | **63 passed** (10 files) |
| Frontend production deploy of new routes | **Pending** ops |
| OCR/PDF PYQ ingest + full bank certification | **Not complete** |

**Agent-swarm close-out release decision:** CONDITIONAL_GO_PILOT

## Remaining gaps close-out (2026-08-02 continued)

| Item | Result |
|------|--------|
| `npm run typecheck` after gov merges | **0** (fixed untyped gov tables + discriminated unions) |
| `npm run build:check` | **0** (Vite production build + dist env verify) |
| Migrations `20260802150000_*` (bank readiness, OCR extract, translations) | Applied remote HTTP 200 |
| Frontend host deploy (Lovable/production URL) | **External ops** — build verified locally only |
| Edge deploy `extract-question-paper` + redeploy `search-exams` / `ingest-source-document` | Deployed `--use-api` |
| Full `src/test/gov-exam` after remaining close-out | **89 passed** (13 files) |
| Admin routes | `/app/admin/gov/ingest`, `/app/admin/gov/translations` present |
| Migration `20260802160000_gov_exam_bank_readiness` (RPC/view) | Applied remote HTTP 200 |
| Redeploy `search-exams` + `create-exam-paper` (verified-bank gate) | Deployed `--use-api` |
| Live full-sim ready packs | **0** (SSC 20/100, UPSC 23/100, IBPS 18/100 partial) |
| Migration `20260802170000_gov_exam_registry_extensions` | Applied remote HTTP 200 |
| New EFs: get-exam-details/pattern/syllabus, analyze-paper-trends, cancel-paper-generation-job, report-question | Deployed `--use-api` |
| Full `src/test/gov-exam` | **92 passed** (14 files) |
| Honest release | **CONDITIONAL_GO_PILOT** — engine live; 0 full-sim certified packs; FE host deploy external |
| Migration `20260802180000_gov_paper_generation_job_leases` | Applied remote HTTP 200 |
| Async paper pipeline: `create-exam-paper` + `process-paper-generation-job` + get/cancel | Deployed `--use-api` |
| `generate-topic-practice` | Deployed (topic practice UI wired) |
| Edge deploy `--use-api` | `create-exam-paper`, `get-paper-generation-job`, `search-exams` — Deployed |
| Unit tests | `src/test/gov-exam/blueprintEngine.test.ts` — **6 passed** |
| Docs | `docs/GOV_EXAM_ARCHITECTURE.md`, `EXAM_SOURCE_POLICY.md`, `QUESTION_GENERATION_PIPELINE.md`, `QUESTION_QUALITY_STANDARD.md`, `EXAM_PACK_CERTIFICATION.md`, `MOCK_TEST_UAT.md` |
| Full PYQ OCR ingest / multi-agent gen / admin review console | **Not shipped** — bank-first assembly only |
| Exam pack bank certification (exact 100Q coverage) | **Not certified** — custom practice path available; full sim fails closed |
| Frontend production deploy | **Pending** ops (code in repo) |

**Gov-exam release decision:** CONDITIONAL_GO_PILOT

## Government Exam production evidence + light monitoring (2026-08-02)

| Item | Result |
|------|--------|
| Release decision | **CONDITIONAL_GO_PILOT** — not GO for all exams |
| Full-sim ready packs | **0** (see `docs/EXAM_PACK_CERTIFICATION.md` / bank readiness) |
| Engine + admin + ingest + mastery + validators | Live (migrations applied; EFs deployed earlier this sprint) |
| FE host production deploy | **External ops** — local `build:check` only |
| Monitoring doc | `docs/GOV_EXAM_MONITORING.md` (observe-today vs deferred) |
| Ops snapshot script | `scripts/gov-exam-ops-snapshot.mjs` (Management API preferred; service-role REST fallback) |
| Similarity | Lexical n-gram/Jaccard primary; optional `cosineSimilarity` / `combineScores` offline-ready (no external embed API calls) |
| Similarity unit tests | `src/test/gov-exam/similarity.test.ts` — **8 passed** |
| Ops snapshot run | See below |

### Ops snapshot run

`node scripts/gov-exam-ops-snapshot.mjs` — exit 0  
Mode: **service_role_rest** (`SUPABASE_ACCESS_TOKEN` absent in session; Management API path preferred when PAT is set)  
`generated_at=2026-08-01T22:52:08.410Z` · `project_ref=qzgvjrvtkwlzxpmlddkx`

```
## gov_exams by review_state
[{ "review_state": "approved", "count": 5 }]

## gov_paper_generation_jobs by status (last 7 days)
(no jobs in last 7 days)

## bank readiness summary
APPSC_GROUP2         empty    0/150   full_sim=false
IBPS_PO              partial 18/100   full_sim=false
RRB_NTPC             empty    0/100   full_sim=false
SSC_CGL              partial 20/100   full_sim=false
UPSC_CSE_PRELIMS     partial 23/100   full_sim=false
summary: 5 exam(s); 0 full-sim ready

## question_translations by review_state
(empty table)  count=0

## content_quality_incidents (open + by status)
open_or_triaging=0
(empty table)  count=0

## source_ingestion_jobs by status
(empty table)  count=0

## human review backlog (lightweight)
questions_needs_review=0; previous_papers_not_approved=0
```

Honest takeaway: registry approved for **5** pilot exams; **0** full-simulation-ready packs; no paper/ingest job traffic in last 7d; translation/ingest/incident queues empty.

## Remaining gates close-out (2026-08-02 late)

| Item | Result |
|------|--------|
| OverlayWindow layout geometry | docked/sidebar/compact snap + drag lock; desktop resize |
| `npm run electron:smoke:static` | PASS (9 checks) |
| `npm run rls:spot-check` | PASS — RLS on + policies for sessions/transcripts/profiles/credit_transactions |
| Typecheck cleanup | ProgressBar import, Card `id`, Tooltip alias, hint_style, onboarding patch |
| `npm run typecheck` | **0** (clean) |
| Stripe live | Still **ABSENT** on edge secrets — NOT_DEPLOYED for checkout GO |
| Interactive Windows UAT | Still blocked (no GUI session) |

**Release decision remains:** CONDITIONAL_GO_CLOSED_BETA

## Overlay UAT + closed-beta gates sprint (2026-08-02 evening)

| Item | Result |
|------|--------|
| Session pipeline state wired to store/UI | `session_pipeline_state` + `OverlayListeningIndicator` labels/recovery |
| Live fingerprint dedupe + hint idempotency | `useLiveCopilot` + `Idempotency-Key` on `generate-hint` |
| Always-on-top / presentation-safe / layout dims | Overlay settings + Electron IPC (defaults privacy-first) |
| Remappable hotkeys → Electron | `overlay:sync-global-shortcuts` + `OverlayKeyboardHandler` |
| STAR/technical/coding frameworks | `responseFormatters.ts` action rail (no invented stories) |
| Migration `revoke_deduct_credits` | Applied remote HTTP 200; `authenticated` EXECUTE = **false**, `service_role` = **true** |
| Migration BYOK null | Applied remote HTTP 200 |
| Edge Functions redeployed | generate-hint, deduct-credits, create-checkout, stripe-webhook, generate-answer, generate-debrief, start-session, analytics-dashboard, ping, ai-coach-chat, deepgram-token |
| Stripe edge secrets | **ABSENT** (STRIPE_SECRET_KEY / WEBHOOK_SECRET / PRICE_*) — live checkout not verified |
| Unit tests | 30 files / **249** passed |
| Windows Electron interactive UAT | **NOT executed** (build artifact only) |

**Release decision:** CONDITIONAL_GO_CLOSED_BETA — overlay integration + credit RPC lock + EF redeploy done; Stripe live secrets and interactive Windows smoke remain open.

### Commands (2026-08-02 evening)

| Command | Exit | Result |
|---------|------|--------|
| `node scripts/apply-sql-migration.mjs …revoke_deduct…` | 0 | status 200 |
| `node scripts/apply-sql-migration.mjs …null_legacy_byok…` | 0 | status 200 |
| Database privilege probe `has_function_privilege(authenticated, deduct_credits…)` | 0 | `auth_can_execute:false` |
| `supabase functions deploy … --use-api` (11 functions) | 0 | Deployed |
| `npm run billing:parity` | 0 | OK |
| `npm run test:run` | 0 | 249 passed |
| `npm run electron:build` | 0 | Vite Electron target built (`chunk-overlay-*.js` emitted) |
| Edge secrets inventory (names only) | 0 | Stripe absent; Gemini/Deepgram/OpenAI present |
| `tsc --noEmit` | non-zero | Pre-existing app TS errors remain (MockSession ProgressBar, onboarding types); baseUrl restored |

## Overlay consent + state machine sprint (2026-08-02)

| Item | Result |
|------|--------|
| Responsible-use notice + Start gate | Implemented in `PreSessionSetupWizard` + `responsibleUseConsent.ts` |
| Overlay state machine | `overlaySessionStates.ts` + `docs/OVERLAY_STATE_MACHINE.md` |
| Architecture / UAT docs | `docs/OVERLAY_ARCHITECTURE.md`, `docs/OVERLAY_UAT.md` |
| Always-on-top default | Electron + window manager now opt-in (default off) |
| Unit tests | `src/test/lib/overlay/responsibleUseConsent.test.ts` (see command log below) |

**Honest release posture:** CONDITIONAL_GO_CLOSED_BETA — overlay consent/security defaults improved; full desktop UAT, macOS/Linux smoke, remote RLS matrix, and live billing secrets remain external/ops-gated. Not 10k-user certified. Not Enterprise SSO.

### Commands (2026-08-02)

| Command | Exit | Result |
|---------|------|--------|
| `npm run test:run -- src/test/lib/overlay/responsibleUseConsent.test.ts src/test/lib/ai/questionDetection.test.ts` | 0 | 2 files / 11 tests passed |
| Hint idempotency wiring | — | `useSessionOrchestrator` → `generateHint` + `hintIdempotencyKey(session, question)` |
| `creditsManager.refreshCredits` SELECT-only sync restored | — | Fixes `refreshFromStore is not a function` regression; refund-and-sync tests green |
| `npm run test:run` (full suite, 2026-08-02) | 0 | 29 files / 243 tests passed |

**Baseline:** branch `main`, commit `26b3a27fa23bfbd149e7fd0dfbf7a5500e5a3a1f` (uncommitted local changes present)  
**Environment:** Windows 10, Node v24.16.0, npm 11.13.0  
**Supabase project ref (from `.temp/project-ref`):** `qzgvjrvtkwlzxpmlddkx`  
**Date:** 2026-07-27

## Phase 0 — Baseline verification

| Command | Exit | Result |
|---------|------|--------|
| `npm run release:gates` | 0 | OK: release-copy gates passed |
| `npm run release:security-gates` | 0 | OK: release security gates passed |
| `npm run release:capability-gates` | 0 | OK: capability gates wired for 16 AI functions |
| `npm run billing:parity` | 0 | OK: billing catalog parity passed |
| `npm run billing:preflight` | 0 | development; all billing vars optional_absent locally |
| `npm run test:run` | 0 | Test Files 22 passed / Tests 204 passed |
| `npm run lint` | 0 | Warnings only (no errors) |
| `npm run typecheck` | 0 | Pass (TS5090 fixed via `baseUrl: "."` in tsconfig.app.json) |
| `npm run build` | 0 | Vite production web build completed |
| `npm run electron:build` | 0 | Electron-target Vite build completed |
| `npx supabase db push --dry-run` | 1 | Password auth failed — remote DB credentials not available in this session |

## Migrations

| Migration | Local file review | Applied to remote? |
|-----------|-------------------|-------------------|
| `20260727010000_revoke_deduct_credits_authenticated.sql` | REVOKE from PUBLIC/anon/authenticated; GRANT service_role only | **NO** — `db push` blocked (no DB password) |
| `20260727010001_null_legacy_byok_columns.sql` | Conditional null of legacy BYOK columns | **NO** — same |

## Edge Function deployments

**None executed this sprint.** Remote deploy requires Supabase CLI auth + project access. Functions with changed `_shared` modules (non-exhaustive): create-checkout, stripe-webhook, razorpay-create-order, razorpay-webhook, ping, ai-feedback, analytics-dashboard, generate-answer, generate-hint, generate-debrief, ai-coach-chat, prep-tool, gap-analysis, generate-questions, generate-practice-questions, generate-star-answer, polish-star-section, company-research, parse-resume, parse-document, analyze-test-performance, parse-question-pdf, export-user-data, delete-account, deepgram-token.

## Smoke / integration tests not executed

- Electron Windows/macOS platform smoke (`docs/ELECTRON_SMOKE_CHECKLIST.md`)
- Live Stripe/Razorpay webhook integration against production/staging
- RLS integration tests against remote Postgres
- Load tests (closed-beta scale targets)
- Monitoring alert delivery
- Backup restore exercise

## Known gaps (honest)

- Production billing secrets not validated (`APP_ENV=production` preflight not run with live vars)
- `deduct_credits` client RPC block not proven on deployed database
- Full Deno webhook concurrency matrix not in CI (Vitest product-rule guards only)
- Playwright E2E not re-run locally this session (CI job configured)
- Database.ts decomposition: map only, no module extraction

## Sprint 0 agent P0 batch (2026-07-27 evening)

| Command | Exit | Result |
|---------|------|--------|
| `npm run release:gates` | 0 | OK |
| `npm run release:security-gates` | 0 | OK |
| `npm run release:capability-gates` | 0 | OK (16 AI) |
| `npm run billing:parity` | 0 | OK |
| `npm run test:run -- src/test/lib/billing` | 0 | 6 files / 33 tests (incl. 5 Razorpay logic) |
| `npm run typecheck` | 0 | OK |

### Code landed (not deployed)
- All charging EFs → `deductCreditsAtomic` + `refundCredits`
- Razorpay catalog grants + grant-before-paid + idempotency
- bulk-import-questions zod/RL/fail-closed key
- LazyMotion GovExams/MockTestHub; rooms route dedupe; calendar 501 honesty
- CSP: no script unsafe-inline; utils.deductCredits → atomic
- Ban: authStore sign-out; requireAuth fail-closed on lookup errors

## 2026-08-13 remaining QA plan (local)

**Branch/commit:** `main` `6e627554` (working tree dirty with this sprint; not committed)  
**Environment:** Windows 10, Node local, Supabase CLI v1.226.4 (not logged in; `SUPABASE_ACCESS_TOKEN` unset)

| Command | Exit | Result |
|---------|------|--------|
| `npm run typecheck` | **0** | Pass |
| `npx eslint . --quiet` | **0** | 0 errors (warnings remain; ignored `.deploy-payloads` / `node_modules_mcp`) |
| `npm run test:run` | **0** | 60 files / 442 tests |
| `npm run release:gates` | **0** | OK |
| `npm run release:security-gates` | **0** | OK |
| `npm run scan:secrets` | **0** | 1366 files |
| `npm run billing:parity` | **0** | After aligning FE `PLAN_RANK.starter` to BE `1` |
| `npm run release:capability-gates` | **0** | 15 AI functions |
| `npx playwright test e2e/qa-legacy-routes.spec.ts e2e/qa-remaining.spec.ts` | **0** | 14 passed |
| `npm run build:check` | **0** | Vite prod build + dist bake-in |
| `npx supabase functions deploy delete-account --use-api` | **1** | CLI v1.226.4: unknown flag `--use-api`; Access token not provided |
| `npm run rls:spot-check` | not run | Needs `SUPABASE_ACCESS_TOKEN`; User A/B keys wired in script |

### Code landed (not deployed)

- Canonical `/app/debriefs`; `/app/rooms*` → Dashboard toast; onboarding → Dashboard
- Analytics `not_scored` (never coerce to 0); durable `account_deletion_operations`; `gap_analyses`; `profiles.region`
- India region restored; full-mock fail-closed; Admin Access Denied copy
- Unit + Playwright coverage for redirects, palette, Access Denied, Interview Day web CTA

### Remote ops still required

- Apply `supabase/migrations/20260813100000_account_deletion_and_gap_analyses.sql`
- Redeploy changed EFs (`delete-account`, `analytics-dashboard`, `gap-analysis`, `select-test-questions`, plus `_shared` importers) after `npx supabase login`
- Frontend host production release
- QA password rotation + MFA; Stripe/Resend/Site URL (no localhost in prod)

**Release decision remains CONDITIONAL_GO_CLOSED_BETA / NO_GO for full production** until those ops complete. Never claim `IMPLEMENTED_AND_RUNTIME_VERIFIED` from this session.

