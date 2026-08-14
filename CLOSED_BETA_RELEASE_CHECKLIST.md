# CLOSED_BETA_RELEASE_CHECKLIST.md

## Code

- [x] Builds pass (`npm run build`) — Evidence: PRODUCTION_EVIDENCE.md 2026-08-13 `build:check` exit 0
- [x] Tests pass (`npm run test:run`) — Evidence: 60 files / 442 tests (2026-08-13)
- [x] Typecheck passes — Evidence: `tsc --noEmit` exit 0 (2026-08-13)
- [x] `scan:secrets` — Evidence: exit 0 (1366 files); wired in CI
- [x] Additive migration `20260813100000_account_deletion_and_gap_analyses.sql` applied remotely — RLS spot-check 2026-08-13
- [x] Redeploy Aug 13 Edge Functions (`delete-account`, `analytics-dashboard`, `gap-analysis`, `select-test-questions`, plus parse/prep/send-email/submit-test/search-exams/checkout/portal/ping/stripe-webhook) — Management API 201 ACTIVE
- [x] Regenerated `src/integrations/supabase/types.ts` from live project (includes `account_deletion_operations`, `gap_analyses`, `profiles.region`)
- [x] Electron build passes (`npm run electron:build`) — Evidence: exit 0
- [x] Release copy gates pass — Evidence: `npm run release:gates` exit 0
- [x] Security gates pass — Evidence: `npm run release:security-gates` exit 0
- [x] Billing catalog parity — Evidence: `npm run billing:parity` exit 0 (FE/BE `starter` rank = 1)
- [x] Playwright QA redirects + remaining paths — Evidence: 14 passed (`e2e/qa-legacy-routes.spec.ts`, `e2e/qa-remaining.spec.ts`)
- [x] AI capability gates — Evidence: `npm run release:capability-gates` (15 functions, 2026-08-13)
- [x] Migrations applied remotely (incl. `20260727010000_revoke_deduct_credits_authenticated.sql`) — Evidence: PRODUCTION_EVIDENCE 2026-08-02 evening
- [x] Edge Functions redeployed (billing, AI, rateLimit shared) — 11 functions via `--use-api`
- [x] RLS spot-check on sessions/session_transcripts/profiles/credit_transactions (`npm run rls:spot-check`) — full cross-user matrix still deferred
- [x] Credits verified on deployed DB (authenticated EXECUTE on `deduct_credits` = false)
- [ ] Billing idempotency verified live (Stripe/Razorpay) — Stripe secrets ABSENT on edge
- [x] Plan normalization verified (`planCatalog.test.ts`)
- [ ] Admin authorization runtime tests
- [x] Rooms removed from pages (redirects remain) — duplicate top-level route removed
- [x] BYOK remnants removed from authStore (DB null migration applied 2026-08-02)
- [x] Charging EFs use deductCreditsAtomic + idempotency (local code)
- [x] Razorpay grant-before-paid + catalog credits (local; Vitest 5)
- [x] bulk-import-questions hardened (zod/RL/fail-closed)
- [x] LazyMotion on GovExams + MockTestHub
- [x] CSP script unsafe-inline removed (style retained)

## Operations

- [ ] Production Supabase project confirmed by ops
- [ ] Stripe live key configured
- [ ] Stripe live webhook secret configured
- [ ] Stripe production price IDs configured
- [ ] Razorpay production key configured (if enabled) — currently optional_absent locally
- [ ] Razorpay webhook secret configured (if enabled)
- [ ] Allowed origins / PUBLIC_URL configured
- [ ] Monitoring configured (log drain + alerts)
- [ ] Alerts tested
- [ ] Backup verified
- [ ] Rollback prepared (see RUNBOOK.md)
- [ ] Support channel prepared

## Desktop / Overlay

- [x] Responsible-use + visibility acknowledgments required before Start (`PreSessionSetupWizard`)
- [x] Overlay state machine documented + wired to status UI
- [x] Always-on-top default off (opt-in) + settings toggle
- [x] Presentation-safe opt-in with honest limitations copy
- [x] Live hint path uses session+question idempotency keys + fingerprint dedupe
- [x] Remappable hotkeys sync to Electron global shortcuts (code)
- [x] Windows static Electron smoke (`npm run electron:smoke:static`) — interactive mic/meeting UAT still open
- [ ] macOS shortcut smoke test
- [ ] Permission prompts verified (interactive)
- [x] Shortcut collision behavior (non-fatal notify) — code path present
- [x] Exit cleanup — `globalShortcut.unregisterAll` on will-quit
- [ ] Signing/notarization checked
- [ ] Auto-update behavior checked

## Product honesty

- [x] Consumer interview-prep positioning
- [x] No HRIS claims
- [x] No org/tenant claims as product surface
- [x] No SSO/SCIM/SAML claims
- [x] No seat-management claims in pricing copy (Max tier)
- [x] Enterprise tier accurately described as Max / high-credit consumer
- [x] Rooms absent from nav / pages
- [x] No false unlimited claims in PricingCard / formatCredits
- [x] Gov exams: independent-platform disclaimer + no “predicted/leaked” paper claims
- [x] Gov exam packs not claimed as “all Indian exams” (pilot registry only)

## Government exam pilot

**Release decision: CONDITIONAL_GO_PILOT** — not GO for all exams. Engine + admin + ingest + mastery + validators live; **0** full-sim ready packs; FE host deploy external; no automated gov alert routing.

- [x] Registry + pattern/syllabus versions + official source links (migrations applied) — **5** approved pilot exams
- [x] Gov edge set deployed: `search-exams`, `create-exam-paper`, `get-paper-generation-job`, `reconcile-paper-quality`, `ingest-source-document`, `list-previous-papers`, `extract-question-paper`, `recompute-topic-mastery`, `report-question` (+ `submit-test` mastery hook)
- [x] Search-first hub + generate stepper (code)
- [x] Admin content-review console (`/app/admin/gov/*`) + admin RLS
- [x] Previous-year paper schema + admin JSON ingest + PDF extract path (OCR unpublished until review)
- [x] Adaptive mastery tables + submit-test / adaptive soft-rank
- [x] Validators + quality score + reconcile-paper-quality (lexical similarity primary; embedding cosine helpers optional/offline)
- [x] State PSC pilot pack (APPSC Group-II Screening)
- [x] Bank readiness reporting (honest: **0** packs ready for full sim — SSC 20/100, UPSC 23/100, IBPS 18/100, APPSC 0/150, RRB 0/100 as of ops snapshot 2026-08-02)
- [x] Hindi translation review UI + `question_translations` (table empty; not pack-certified)
- [x] Light monitoring doc + ops snapshot (`docs/GOV_EXAM_MONITORING.md`, `scripts/gov-exam-ops-snapshot.mjs`) — includes incidents/ingest; alerts/drain still external
- [x] Frontend production **build** verified (`build:check`) — host deploy still external ops
- [ ] Certified question-bank coverage for full-pattern simulations (**none ready yet**)
- [ ] Expert-approved Hindi packs
- [ ] Frontend host production release (Lovable/ops)
- [ ] Automated alert routing for generation / ingest / quality-incident jobs
