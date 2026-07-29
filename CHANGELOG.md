# CHANGELOG — Production Hardening Pass

Source: Clarify AI Complete Application Audit (28 July 2026) + Master Production-Readiness Implementation Prompt.

## P0 — Money / security (2026-07-28)

### P0-1 Enterprise Stripe checkout — FIXED
- Added `stripePriceIdMonthly` / `stripePriceIdYearly` to `PLANS.enterprise` from `ENV.STRIPE_PRICE_ENTERPRISE_*`.
- Documented `VITE_STRIPE_PRICE_ENTERPRISE_MONTHLY/YEARLY` in `.env.example`.
- Server allowlist already included enterprise price env keys in `billingConfig.ts`.

### P0-2 Failed invoice credit wipe — FIXED
- `invoice.payment_failed` no longer sets `profiles.credits` to an absolute free-tier value.
- Downgrade still updates plan/status only; wallet preserved.

### P0-3 Server plan gating — FIXED
- Remapped `requirePlan(..., "starter")` → `"pro"` for company-research and overlay/screenshot paths.
- Rebuilt `CAPABILITY_MIN_RANK` to match `PLANS.features` (Pro: overlay, analytics, company_research, calendar_sync; Max: priority_models).
- Added Pro gate to `sync-calendar`.
- Free-tier live answer generation remains available (limited sessions); overlay/screenshot requires Pro.

### P0-4 Uncharged AI document endpoints — FIXED
- `parse-resume`, `gap-analysis`, `parse-document` now deduct via `deductCreditsAtomic` (costs 12 / 10 / 8).
- **Decision:** first resume parse during onboarding is FREE once (`x-clarify-onboarding-parse: 1` or `onboarding_completed === false`). Subsequent parses charge `resume_analysis`.

### P0-5 Committed secrets / build artifacts — FIXED
- Removed `.env.production` from git index (`git rm --cached`); added to `.gitignore` with `release-new/` and `_asar-extract/`.
- Added tracked `.env.production.example` (placeholders only).
- **Ops follow-up:** rotate Supabase anon key in the dashboard if policy requires it after historical commit exposure.

### P0-6 Admin revenue math — FIXED
- `monthlyRevenueByPlan` now uses active/trialing subscriptions × catalog USD prices (never credit ledger counts).
- INR from `payment_orders.amount_paise` reported separately; not blended into USD MRR.

---

## P1 — User-visible bugs (2026-07-28)

| ID | Status | Notes |
|----|--------|-------|
| P1-1 | FIXED | Shared `getCurrentRoundDate` / round helpers; Interviews + InterviewDay use `next_round` |
| P1-2/3 | FIXED | Profile shows `streak_days`; badge count from gamification / `user_badges` |
| P1-4 | FIXED | `/app` catch-all `*` → NotFound inside AppShell |
| P1-5 | FIXED | AdminQuestionEditor filters via shared exam display strings |
| P1-6 | FIXED | MockSession no longer registers duplicate Ctrl+Shift+C; overlay hotkeys stay central |
| P1-7 | FIXED | SessionDetail null/undefined → "Not scored"; real 0 stays 0 |
| P1-8 | FIXED | CI `VITE_APP_ENV=development`; validate-env allowlists CI placeholders in development |
| P1-9 | FIXED | Electron `window-state` min clamp 360×320 |
| P1-10 | FIXED | Release output already `release/` (matches gitignore); no dual `release-new` builder path |

---

## P2 — Copy / consistency (2026-07-28)

| ID | Status | Notes |
|----|--------|-------|
| P2-1 | FIXED | Warm-up copy reads `WARMUP_MAX` (10) |
| P2-2 | FIXED | MockTestHub stat label/query aligned ("My uploads") |
| P2-3 | FIXED | Percentile / performance band relabeled as estimated |
| P2-4 | FIXED | Pricing / Max shows **$79**; enterprise Stripe price IDs wired (P0-1) |
| P2-5 | FIXED | StarBuilder polish cost from credit economics |
| P2-6 | FIXED | SettingsBilling usage from ledger |
| P2-7 | FIXED | India-only UI claims removed (gate stays disabled) |
| P2-8 | FIXED | Analytics no longer overwrites `total_sessions` incorrectly |
| P2-9/10 | FIXED | Onboarding mic device + anxiety prefs persisted (JSON prefs) |
| P2-11 | FIXED | Sidebar collapse transient / local-only |
| P2-12 | FIXED | Help Group Practice marked coming soon |

---

## Content / scope gaps (tracked decisions)

| Gap | Decision |
|-----|----------|
| Gov-exam question bank (~26 seeds) | **defer-with-roadmap** — populate via scraper/admin ingest |
| Mock interview TTS | **defer-with-roadmap** |
| Razorpay recurring subscriptions | **defer-with-roadmap** |
| Group practice WebRTC rooms | **descope** for now (routes already redirect) |
| Outlook Calendar | **descope** until scheduled |

---

## P3 — Dead code / wire cleanup (2026-07-28)

### DELETE

| Target | Decision |
|--------|----------|
| Edge `ai-feedback` | **DELETE** — unused; scorecard uses `useScorecard` + `generate-debrief`. Removed from allowlists / `pre-deploy-check` / `config.toml` as applicable |
| Edge `validate-api-key` | **DELETE** — BYOK path retired with SettingsBYOK |
| Edge `end-session`, `save-answer`, `save-transcript` | **DELETE** — live path uses direct DB writes; `sessions.ts` keeps `startSession` only |
| Edge `generate-practice-questions` | **DELETE** — zero `src/` callers |
| Edge `billing-status` | **DELETE** — unused; SettingsBilling already has plan/credits; no wire |
| `SettingsCredits` / `SettingsSubscription` / `SettingsBYOK` | **DELETE** — superseded by SettingsBilling / Models |
| `DesktopOnlyGate.tsx` | **DELETE** — unused |
| `useDeepgramStream.ts` | **DELETE** — live path uses `DeepgramStreamClient` via `useAudioSession`; `TranscriptSegment` inlined in `useSpeakerDiarization` |
| `submit_test_atomic` / `acquire_submit_lock` | **DELETE** — migration `20260728132533_drop_unused_submit_rpcs.sql` (`DROP FUNCTION IF EXISTS`) |
| `electron/preload.ts` | **DELETE** — runtime uses `preload.cjs` only |
| `_asar-extract/` | **DELETE** — build extraction artifact |
| Server `credits_10` pack | **DELETE** — not sold on frontend; removed from `CREDIT_PACK_CATALOG`, validators, tests |
| `scripts/archive/*` | **DELETE** — one-off MCP deploy helpers |

### WIRE / CLEANUP

| Item | Decision |
|------|----------|
| `auto_deduct_credits` admin toggle | **DELETE UI** — removed from AdminBillingSettings; DB column retained (no migration) |
| Empty `#topbar-breadcrumb` | **DELETE** — unused slot/`id` removed from AppTopBar |
| `Rephraser.tsx` | **WIRE** — sets `error` on failure + error card UI; still offers offline alternatives |
| `@ts-nocheck` on AdminSeedQuestions / AdminQuestionEditor / AdminLiveChat | **WIRE** — removed; types cast via `unknown` where needed |
| `prettier-plugin-tailwindcss` + `@hookform/resolvers` | **WIRE** — deps installed; prettier config lists plugin; Login/Signup use `zodResolver` + `useForm` (CSRF retained) |
| Answer Bank “Generate with AI” | **WIRE** — Add-answer modal calls `prep-tool` (`star_method`), user reviews, saves to `answer_bank` (`source: prep_lab`) |
| `apiEndpoints` / EDGE allowlists | **CLEAN** — deleted names scrubbed from `EDGE_FUNCTIONS`, capability + rateLimit maps |

### Files touched (P3, non-exhaustive)

- Deleted: listed edge function dirs; dead settings/gate/hook/preload/archive artifacts
- Updated: `AnswerBank.tsx`, `Rephraser.tsx`, `AdminBillingSettings.tsx`, `AppTopBar.tsx`, admin seed/editor/live-chat, `Login.tsx` / `Signup.tsx`, `_shared/billingCatalog.ts` / `validators.ts` / `rateLimit.ts` / `requireCapability.ts`, `paymentSchemas.ts`, `useSpeakerDiarization.ts`, `CHANGELOG.md`

---

## P4 — Production hardening (2026-07-28)

### P4-1 Rate limits — FIXED
- Confirmed / added distributed `enforceRateLimitAsync` / `check_rate_limit` on: `select-test-questions`, `parse-question-pdf`, `analyze-test-performance`, `collect-exam-papers`, `razorpay-create-order`, `send-email`, `schedule-interview`, `sync-calendar`, `record-referral`, `disconnect-calendar`.
- Presets: AI/PDF ~5/min (`AI_GENERATION`), email 10/min (`EMAIL_ACTION`), payment 10/min (`PAYMENT_ACTION`), calendar/session 20/min, referral 10/min.

### P4-2 Refunds — FIXED
- `stripe-webhook`: handles `charge.refunded` — flags profile/subscription as refunded; claws back credits **only** when wallet balance ≥ originally granted amount (ledger lookup); never blindly zeroes wallet.
- `razorpay-webhook`: handles `refund.processed` / `refund.created` / `payment.refunded` — sets `payment_orders.status='refunded'` + same conditional clawback.
- Unit tests: `stripeWebhookLogic.test.ts`, `razorpayWebhookLogic.test.ts`.

### P4-3 Sentry in edge — FIXED (minimal)
- `reportEdgeError` in `_shared/errors.ts`: optional HTTPS POST to Sentry store API when `SENTRY_DSN` is set; otherwise structured `level=error` log with `sentry_ready` flag + `requestId`.
- Wired into `stripe-webhook` and `razorpay-webhook` catch paths. Logger errors also emit `sentry_ready`.

### P4-5 Baseline recovery migration — FIXED (pragmatic)
- Added `20260728180000_baseline_recovery_missing_tables.sql` with `CREATE TABLE IF NOT EXISTS` + RLS for: `interviews`, `admin_audit_log`, `model_cost_logs`, `session_ai_interactions`, `achievements`, `user_achievements` (shapes from `types.ts`).
- **Decision:** full recovery of historical policy order still requires a staging dump; this migration makes tables exist for new environments going forward.
- **Deferred** (staging dump required for exact DDL): `answers`, `debriefs`, `transcripts`, `rooms`, `companies`, `model_pricing`.

### P4-6 Code signing — DEFERRED
- Unsigned Windows binaries — deferred pending EV/OV code-signing certificate.
- `signAndEditExecutable` remains `false` in package.json until secrets/cert available.

### P4-7 Session expiry — FIXED
- `SessionTimeoutBanner`: when timer hits 0, force `signOut()` and redirect to `/login` with `state.from` (pathname) for post-login return.

### Security batch
| ID | Status | Notes |
|----|--------|-------|
| M1 | FIXED | Removed `x-byok-*` handling from `utils.ts` / `gemini.ts` / CORS; callers no longer accept client API keys |
| M2 | FIXED | `parse-document` Gemini key moved from query string to `x-goog-api-key` header |
| M4 | DEFERRED | `deduct_credits` RPC uses `auth.uid()` (no `p_user_id`); cannot call from service-role Edge for arbitrary users without signature change. JS `.gte("credits", amount)` path retained with comment |
| M5 | FIXED | Unit test documents `bulk_update_users` requires admin SQL gate + client guard |
| M6 | NOTED | `billing_settings` SELECT for authenticated left open (prices not secret); further restriction deferred |
| M8 | FIXED | Migration revokes authenticated INSERT on `user_achievements` / `model_cost_logs` |

---

## Final verification checklist (2026-07-28)

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS (after SessionDetail ProgressBar color narrowing) |
| `npm run test:run` | PASS — 27 files / 232 tests |
| `npm run build` | PASS |
| `npm run validate-env` | PASS (warnings only for short/placeholder keys) |
| P0 money paths | Covered by billing unit tests; live Stripe/Razorpay sandbox manual |
| Dead edge functions | Removed from working tree (ai-feedback, validate-api-key, end-session, save-answer, save-transcript, billing-status, generate-practice-questions) |
| Secrets / artifacts | `.env.production` + `release-new/` gitignored; `.env.production.example` tracked |
| Copy honesty | Pricing $79, warm-up/`WARMUP_MAX`, India-only claims stripped, Group Practice coming soon |
| Deferred | M4 deduct RPC signature; P4-6 code signing; full baseline DDL dump; content gaps above |

---

## Launch gap matrix (2026-07-29)

Launch-fixes pass: gap UI, MobileNav, admin honesty, prefs enforcement, resume versions, gov MCQ seed expansion, Excel hire pack.

| Category | Items |
|----------|--------|
| **Blocking launch (product honesty)** | Razorpay is one-time Order only (copy must say so); unsigned Windows SmartScreen without EV/OV cert; apply migration `20260729120000_expand_gov_exam_mcq_seeds` before claiming full mocks |
| **Blocked on secrets / ops** | Google Calendar OAuth (`BUG-OPEN-03`); Resend for reminders (`BUG-OPEN-26`); Gemini/allowlists for collect/PDF (`BUG-OPEN-17`); anon key rotation in Dashboard (`BUG-OPEN-30`); code signing / auto-update trust (`BUG-OPEN-18/19`) |
| **Missing / descope** | Outlook Calendar; WebRTC rooms; Push; Mock TTS; Razorpay Subscriptions; real stealth evasion |
| **Fixed this pass** | OPEN-02 bank expansion; OPEN-05 gap UI; OPEN-06 version history; OPEN-08 email prefs gated; OPEN-10 MobileNav; OPEN-12 model costs read-only; OPEN-13 Support→Live Chat; OPEN-14 QA checklist honesty; OPEN-24 analytics opt-out + honesty |

### Phase A code
- JDDetail: resume picker + `gap-analysis` edge + 402 handling
- ResumeDetail: read-only `resume_versions` list
- MobileNav: `/app/usage`, `/app/interview-day`
- AdminModelCosts: read-only `AI_CREDIT_COSTS` (no fake Save)
- AdminSupport: deep link to Live Chat
- AdminQAChecklist: local-only banner
- SettingsNotifications honesty + `send-email` pref gate
- SettingsPrivacy: PostHog opt-out + honesty labels

### Phase B content
- New migration seeds ~80 MCQs across JEE / NEET / UPSC / SSC / Banking (idempotent)

### Phase C–E QA pack
- Regenerated `Clarify_AI_QA_Workbook_FULL.xlsx` with Credentials, Environments (+ secrets checklist), Module Playbooks, Launch Status, Smoke Pack; Feature Inventory Route/Deep Link/How-it-works columns; Fixed/Open/Blocked synced
