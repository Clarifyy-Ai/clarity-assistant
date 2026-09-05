# CAREER PILOT — COMPLETE ENGINEERING & BUSINESS LOGIC AUDIT

**Date:** 2026-09-05  
**Scope:** Full-stack audit (business → UI → state → API → Edge → DB → RLS → AI → credits → billing → auth → security)  
**Product decision (confirmed):** Free tier = **50 credits at signup (one-time)** — no monthly reset job.

---

## Executive Summary

Career Pilot is a credit-wallet interview prep platform with **server-authoritative billing** (Postgres RPCs), **Razorpay one-time checkout** (Stripe retired), and **hybrid AI execution** (Gemini → OpenAI → Anthropic → Python → deterministic fallback). The codebase is **mature in contract tests** (~626 unit + hybrid suite) but **runtime verification gaps** remain for live AI audio, gov-exam worker deploy, and Razorpay settlement.

**This audit cycle:**
- Produced system map + feature matrix (20+ modules)
- Ran automated parity gates (billing catalog v3, hybrid contracts)
- Fixed P0 security: `questions` answer-key exposure via tightened RLS + owned review RPC
- Fixed P0 billing copy: free credits one-time (client + help migration)
- Fixed hybrid test brittleness (error envelope source contract)
- Added regression tests for copy + security migration

**Release classification:** **CONDITIONAL GO**  
Code and unit tests support production logic; **NO-GO** until environment blockers cleared (Edge redeploy, Python worker, live payment webhook, browser E2E on core flows).

---

## Architecture Map

```mermaid
flowchart TB
  User --> UI
  UI --> ZustandStores
  ZustandStores --> ApiClient
  ApiClient --> EdgeFunctions
  EdgeFunctions --> BusinessLogic
  BusinessLogic --> PostgresRPC
  PostgresRPC --> RLS
  EdgeFunctions --> HybridEngine
  HybridEngine --> AIProviders
  EdgeFunctions --> JobWorkers
  JobWorkers --> PythonService
  PostgresRPC --> Ledger
  EdgeFunctions --> Razorpay
  Ledger --> Analytics
  Analytics --> UI
```

### State ownership

| Domain | Client owner | Server source of truth |
|--------|--------------|------------------------|
| Auth/session | `authStore` (no JWT in Zustand persist) | Supabase Auth + `profiles` |
| Credits balance | `authStore.credits` (cache) | `profiles.credits` + `get_spendable_credits` RPC |
| Live session | `sessionStore` + `overlayStore` | `sessions.lifecycle_status` + RPCs |
| Mock session | `sessionStore` + `answerNextFsm` | `sessions.notes` progress + `session_answers` |
| Coach AI context | `coachStore` + `buildFeatureContext` | Frozen snapshots in session notes |
| Gov exam attempt | Test session UI | `mock_tests` + frozen snapshots |
| Payments | Settings Billing UI | `payment_orders` + Razorpay webhook |

### Credit charging patterns

| Pattern | When | Authority |
|---------|------|-----------|
| A — Client deduct | Mock session upfront | `deduct-credits` Edge → `deduct_credits_service` |
| B — Hybrid inline | Most AI features | `hybridExecute` reserve once, refund on total failure |
| C — Job reserve | Gov paper, debrief, company research | reserve/finalize/release RPCs |

---

## Complete Feature Matrix

| Feature | User Goal | Credits | Plan gate | API/Edge | DB | Status |
|---------|-----------|---------|-----------|----------|-----|--------|
| Signup/Login | Access account | — | — | Supabase Auth | `profiles` | WORKING |
| Email verify | Confirm identity | — | — | Auth + `complete_onboarding` guard | `profiles` | WORKING |
| MFA (TOTP) | Step-up security | — | — | AAL2 + `ProtectedRoute` | `profiles.mfa_*` | WORKING |
| Onboarding | Profile setup | — | — | `complete_onboarding` RPC | `profiles` | WORKING |
| Dashboard | Overview | — | — | Client | multiple | WORKING |
| Practice Coach setup | Configure session | — | Rank 0 | `start-session` | `sessions` | PARTIALLY WORKING |
| Live Copilot | Real-time coaching | 2/8/12 per action | Overlay=Pro | `generate-hint/answer`, `ai-coach-chat` | transcripts, interactions | PARTIALLY WORKING |
| Mock Interview | Simulated interview | 15+ scaled upfront | Rank 0 | `deduct-credits`, `generate-questions` | sessions, answers | WORKING |
| Prep Lab | STAR/rephrase/coding | 2–20 per tool | Rank 0 | `prep-tool`, `polish-star-section` | prep history | WORKING |
| Documents | Resume/JD storage | 8–12 parse | — | `parse-document/resume` | `documents` | WORKING |
| Answer Bank | Store answers | — | — | CRUD | `answer_bank` | WORKING |
| Gov Exams | Exam practice | 3–15 | AI fill=Pro | `create-exam-paper`, worker | gov tables | ENV DEPENDENT |
| Assessments | Template tests | varies | — | `assemble-assessment` | snapshots | PARTIALLY WORKING |
| Scorecard | Session eval | 15 | — | `generate-scorecard` | `scorecards` | WORKING |
| Debrief | Post-session analysis | 15 | — | `generate-debrief` job | debrief jobs | WORKING |
| Referrals | Earn credits | +25/+25 | — | `record-referral` | referrals | WORKING |
| Billing | Buy credits/plan | — | — | Razorpay edges | `payment_orders` | ENV DEPENDENT |
| Calendar | Sync interviews | — | Pro | OAuth callback | calendar tokens | NOT VERIFIED |
| Learning Hub | Courses | — | — | Client | learning tables | INCOMPLETE |
| Community | Q&A forum | — | — | Client | community | WORKING |
| Admin | Ops/finance | — | staff | admin edges | audit logs | PARTIALLY WORKING |
| Electron overlay | Desktop live | same as live | Pro | overlay routes | — | PARTIALLY WORKING |

---

## Cross-Cutting Root Causes

| ID | Root cause | Severity | Status |
|----|------------|----------|--------|
| RC-A | Stripe/Razorpay split-brain (env, legacy edges, naming) | P1 | PARTIAL — Stripe stubs fail closed; Razorpay live |
| RC-B | Duplicate credit APIs (`useCredits` vs `creditsManager`) | P2 | PARTIAL — creditsManager deprecated |
| RC-C | Marketing copy ≠ server (free monthly refresh) | P0 | **FIXED** — one-time 50 signup |
| RC-D | Session FSM fragmentation (4+ layers) | P2 | DOCUMENTED — no illegal transition fixes this cycle |
| RC-E | Code-fixed vs runtime-unverified | P1 | OPEN — needs deploy + browser E2E |
| RC-F | Types lag migrations | P2 | OPEN — regen blocked on remote migrate |
| RC-G | `questions` answer-key exposure | P0 | **FIXED** — RLS + review RPC |
| RC-H | `feature-copies/` drift risk | P3 | DOCUMENTED in docs/feature-copies/README.md |

---

## Findings (selected, full format)

### Finding SEC-001 — Published question answer keys readable via base table

**Category:** Security / RLS  
**Severity:** P0  
**Location:** `questions` RLS policy; `TestResults.tsx`  
**Current:** Authenticated users could SELECT published rows including `correct_answer`.  
**Expected:** Answer keys only after owned completed test or via admin/owner.  
**Root cause:** `questions_select` OR branch allowed public published reads on base table.  
**Fix:** Migration `20260905210000` — owner/admin only on base table; `get_owned_mock_test_question_review` RPC; TestResults uses RPC.  
**Tests:** `src/test/lib/security/questionsReviewRpc.test.ts`  
**Status:** FIXED (pending migration deploy)

### Finding BIZ-001 — Free credits documented as monthly refresh

**Category:** Business logic  
**Severity:** P0  
**Location:** `helpCatalogCopy.ts`, `billing.types.ts`, DB help articles  
**Current:** Copy claimed monthly free refresh; no cron exists.  
**Expected:** One-time 50 at signup per product decision.  
**Root cause:** Legacy Stripe-era copy not updated for Razorpay wallet model.  
**Fix:** Client copy + migration `20260905211000` + CreditBalance UI ("One-time balance").  
**Tests:** `src/test/lib/billing/freeCreditsCopy.test.ts`  
**Status:** FIXED

### Finding BIZ-002 — Free plan session limit marketing mismatch

**Category:** Business logic  
**Severity:** P2  
**Location:** `subscriptionManager.ts` PLANS.free  
**Current:** UI said "2 sessions/month"; server enforces 3/day via `check_free_tier_limits`.  
**Expected:** UI matches server enforcement.  
**Fix:** Updated to "3 sessions/day (server enforced)".  
**Status:** FIXED

### Finding BIL-001 — Stripe split-brain

**Category:** Billing  
**Severity:** P1  
**Location:** `billing.ts`, `stripe-webhook`, env STRIPE_PRICE_*  
**Current:** Stripe checkout throws; webhook never grants; env keys remain.  
**Expected:** Users never see working Stripe paths.  
**Status:** PARTIAL — fail-closed; env cleanup deferred

### Finding AI-001 — Runtime AI personalization unverified

**Category:** AI  
**Severity:** P1  
**Location:** Live Copilot, Mock, Edge functions  
**Current:** Contract tests pass; browser STT+Gemini not verified in CI.  
**Status:** NOT VERIFIED — environment dependent

### Finding OPS-001 — Edge functions not redeployed

**Category:** Deployment  
**Severity:** P1  
**Location:** Supabase Edge  
**Status:** BLOCKED — user/ops action

---

## Domain Summaries

### Authentication / MFA / Multi-tab
- Chain: Auth → verify → MFA (fail-closed TOTP) → ban → billing → onboarding → role → destination
- Multi-tab: shared localStorage JWT; tab-local vs global logout via broadcast
- Tests: `mfaGate.test`, `auth-onboarding.spec`, `auth-account.spec`
- **Status:** WORKING (code); MFA optional until user enrolls (by design)

### Credits / Billing
- Authority: Postgres RPCs > Edge `resolveActionCost` > client preflight
- Catalog: `credit_catalog_v3`, 24 keys, parity scripts pass
- Razorpay: create → pay → verify + webhook → idempotent fulfill
- **Status:** WORKING (code); live webhook NOT VERIFIED

### AI Architecture
- All LLM server-side via `hybridExecute`
- Single charge; refund on total failure
- Context: `buildFeatureContext` + `assertContextForOperation`
- **Status:** WORKING (code); recent context fixes landed 2026-09-05

### Government Exams
- Official/PYQ from verified inventory; AI gap-fill gated Pro
- Credit reserve/finalize on paper jobs
- **Status:** ENVIRONMENT DEPENDENT (worker + migrations)

### RLS / Security
- Broad tenant isolation via `auth.uid()`
- Promo: `get_public_promo_offers` RPC (safe fields); table admin-only
- **Status:** IMPROVED (questions fix); live RLS spot-check needs QA credentials

---

## Test Architecture

| Layer | Coverage | Gap |
|-------|----------|-----|
| Unit (Vitest) | ~626 files | Runtime AI/audio |
| Hybrid contracts | 147+131 tests | Live provider |
| Python contracts | 47 tests | Deployed worker |
| E2E (Playwright) | ~57 specs | Full matrix deferred |
| RLS live | `rls-spot-check.mjs` | Needs SUPABASE_ACCESS_TOKEN |

**Added this cycle:** `freeCreditsCopy.test.ts`, `questionsReviewRpc.test.ts`

---

## Scores (0–10)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Business Logic | 7 | Free credit contradiction fixed |
| Data Engineering | 7 | Strong ledger; session FSM split |
| Database / RLS | 8 | Questions fix; broad RLS |
| Backend / Edge | 8 | Hybrid mature |
| Frontend | 7 | Billing copy aligned |
| API | 8 | Typed errors |
| Authentication | 8 | Fail-closed MFA |
| MFA | 8 | TOTP + recovery |
| Sessions | 7 | Multi-FSM |
| AI | 7 | Context fixed; runtime unverified |
| Personalization | 7 | Contract enforced |
| Credits | 8 | Server authoritative |
| Billing | 7 | Razorpay live; Stripe drift |
| Referrals | 8 | Idempotent RPC |
| Security | 8 | P0 questions fixed |
| Performance | 7 | Some duplicate fetches |
| Scalability | 7 | Job queues for long work |
| Testing | 7 | High unit; low live E2E |
| Observability | 7 | correlation_id in Edge |
| Maintainability | 6 | feature-copies drift risk |
| **Overall** | **7.4** | **CONDITIONAL GO** |

---

## Release Classification

### Per feature (summary)
- **WORKING:** Auth, Mock (code), Prep Lab, Referrals, Answer Bank, Documents (core)
- **PARTIALLY WORKING:** Live Copilot, Assessments, Admin, Electron
- **ENVIRONMENT DEPENDENT:** Gov Exams, Billing settlement, Edge AI keys
- **NOT VERIFIED:** Browser E2E on live audio, Razorpay production webhook
- **INCOMPLETE:** Learning Hub content, Group Practice (retired rooms)

### Final verdict: **CONDITIONAL GO**

**Clear before full GO:**
1. Apply migrations (`20260905210000`, `20260905211000`, pending assessment/referral)
2. Deploy Edge functions (AI + Razorpay)
3. Verify Python worker + gov exam path
4. Live RLS spot-check (User A/B)
5. Browser verification: Live Copilot, Mock voice, Billing test checkout

**NO-GO triggers (none confirmed in code review):**
- Cross-user data leak
- Payment double-grant
- Auth/MFA bypass
- Credit double-charge without idempotency

---

## Fixes Applied (2026-09-05)

| Wave | Item | Files |
|------|------|-------|
| P0 Security | Questions RLS tighten + review RPC | migration, TestResults.tsx |
| P0 Billing | Free credits one-time copy | billing.types, helpCatalogCopy, CreditBalance, subscriptionManager, help migration |
| P2 | Error envelope test brittleness | errorEnvelopes.test.ts |
| P2 | creditsManager deprecation note | creditsManager.ts |
| Tests | Copy + security regression | freeCreditsCopy.test.ts, questionsReviewRpc.test.ts |

---

## Environment Verification Checklist

- [ ] `supabase db push` on target project
- [ ] `supabase functions deploy` (generate-hint, generate-answer, generate-questions, prep-tool, razorpay-*)
- [ ] Python/Render worker health + HMAC
- [ ] Razorpay test webhook → credits granted once
- [ ] Live Gemini + Deepgram session in browser
- [ ] Gov exam: generate → submit → results
- [ ] RLS spot-check with QA users

---

*Canonical audit document. Prior audits: AI_LOGIC_AUDIT_2026-09-05, FEATURE_AUDIT_2026-09-05, CAREER_PILOT_CREDIT_AND_BILLING_RECONCILIATION.*
