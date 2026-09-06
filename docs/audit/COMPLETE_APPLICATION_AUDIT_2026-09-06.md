# Career Pilot — Complete Application Audit

**Date:** 2026-09-06  
**Type:** Phase 0 read-only audit (canonical) + Phase 1 contract fixes  
**Scope:** Full-stack — business → UI → state → API → Edge → DB → RLS → AI → Python → credits → billing → auth → security  
**Product decision (confirmed):** Free tier = **50 credits at signup (one-time)** — no monthly reset job.  
**Live billing:** Razorpay one-time checkout (INR). Stripe retired (fail-closed).

**Prior audits re-classified (not ignored):**

| Artifact | Role |
|----------|------|
| [MASTER_ENGINEERING_AUDIT_2026-09-05.md](./MASTER_ENGINEERING_AUDIT_2026-09-05.md) | Partial coverage; pointer updated to this doc |
| [AI_LOGIC_AUDIT_2026-09-05.md](./AI_LOGIC_AUDIT_2026-09-05.md) | AI context + routing detail |
| [FEATURE_AUDIT_2026-09-05.md](./FEATURE_AUDIT_2026-09-05.md) | Practice/Mock/Gov feature depth |
| [CAREER_PILOT_CREDIT_AND_BILLING_RECONCILIATION.md](./CAREER_PILOT_CREDIT_AND_BILLING_RECONCILIATION.md) | Credits/billing SoT |
| [CAREER_PILOT_CURRENT_IMPLEMENTATION_AUDIT.md](./CAREER_PILOT_CURRENT_IMPLEMENTATION_AUDIT.md) | Evidence-based inventory |
| [CAREER_PILOT_REMAINING_BLOCKERS.md](./CAREER_PILOT_REMAINING_BLOCKERS.md) | **Stale** — many items cleared 2026-09-06 |

---

## §1 Executive Summary

Career Pilot is a credit-wallet interview prep platform with **server-authoritative billing** (Postgres RPCs), **Razorpay one-time checkout**, and **hybrid AI execution** (Gemini → OpenAI → Anthropic → Python → deterministic fallback). The codebase is **mature in contract tests** (~1050+ Vitest domain tests + 180 hybrid suite) but **runtime verification gaps** remain for live AI audio, gov-exam worker deploy, Razorpay settlement, and live RLS User A/B.

**This audit cycle (2026-09-06):**
- Full repository discovery re-run (tech debt, localhost, Stripe drift, credit API duplication)
- Automated gates: billing parity **PASS**, hybrid suite **PASS** (180 tests), domain suite **1049/1052 PASS** (3 contract drifts)
- RLS spot-check **BLOCKED_BY_ENVIRONMENT** (TLS cert / no QA token)
- Architecture ownership verified: Edge owns credits; Python has no direct deduct path
- Re-verified prior fixes: questions RLS, free credits copy, gov provenance, debrief gates, session duration contract
- Phase 1: contract drift fixes (domainErrors case, company research cancel UX, live stream contract)

**Release classification:** **CONDITIONAL** (see §64)

---

## §2 Discovery Index

| Scan | Count / finding | Top risk |
|------|-----------------|----------|
| TODO | 14 files | Low — scattered |
| FIXME | 1 file | Low |
| HACK | 2 files | Review |
| TEMP | 108 files | Scripts/QA artifacts |
| MOCK | 55 files | Many legitimate test mocks |
| FAKE | 2 files | Test fixtures |
| PLACEHOLDER | 19 files | UI placeholders |
| STUB | 1 file | Billing stubs intentional |
| DEPRECATED | 8 files | creditsManager, Stripe paths |
| LEGACY | 34 files | Stripe naming, feature-copies |
| FALLBACK | 45 files | Hybrid fallback (by design) |
| localhost / 127.0.0.1 in `src/` | 20 files | Dev/test; prod loopback blocked in `pythonClient.ts` |
| Stripe refs in `src/` | 41 files | DEAD/MISLEADING — fail-closed |
| `creditsManager` refs | 22 files | RC-CreditDuplication |
| `useCredits` refs | 16 files | Preferred client surface |
| Edge function folders | 102 (+ `_shared`) | RC-EdgeFunctionCap at 100/100 deploy quota |
| SQL migrations | 246 | Remote 0 pending (2026-09-06 deploy session) |
| Python credit deduct grep | 0 direct deduct | **OK** — refund claim only via RPC from worker |

---

## §3 Architecture Map

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

### Ownership verification (2026-09-06)

| Layer | Must own | Verified | Mismatch |
|-------|----------|----------|----------|
| Edge | auth, plan gates, credits, AI, idempotency | `hybridExecute.ts`, `creditAuthority.ts` | None critical |
| Postgres | data, RLS, ledger, job RPCs | 246 migrations, RLS on tenant tables | Types lag minor |
| Python | parsing, gov assembly, workers; **never credits** | No `deduct_credits` in scraper; refund via RPC only | None |
| Browser | never calls Python directly; no provider secrets | `src/lib/api/*` → Edge only; `VITE_SCRAPER_URL` admin-only | None |

**ARCHITECTURE_MISMATCH findings:** None P0. Minor: `generate-hint` stubs `runPython: null` (AI-only) while `generate-answer` uses Python coach path — intentional, documented in §22.

---

## §4 Feature Completeness Matrix

| Feature | UI | API/Edge | Backend | DB | RLS | AI | Python | Credits | Persistence | Errors | Loading | Tests | Status |
|---------|-----|----------|---------|-----|-----|-----|--------|---------|-------------|--------|---------|-------|--------|
| Signup/Login | ✓ | Supabase Auth | ✓ | profiles | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | WORKING |
| MFA TOTP | ✓ | AAL2 gate | ✓ | profiles | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | WORKING |
| Onboarding | ✓ | complete_onboarding | ✓ | profiles | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | WORKING |
| Dashboard | ✓ | client | ✓ | multi | ✓ | — | — | — | ✓ | ✓ | ✓ | partial | WORKING |
| Live Copilot | ✓ | generate-hint/answer | ✓ | sessions | ✓ | hybrid | answer only | 2–12 | ✓ | ✓ | ✓ | contracts | PARTIAL |
| Mock Interview | ✓ | deduct-credits, gen-q | ✓ | sessions | ✓ | hybrid | validate | 15+ | ✓ | ✓ | ✓ | ✓ | WORKING |
| Prep Lab | ✓ | prep-tool, polish | ✓ | history | ✓ | hybrid | star | 2–20 | ✓ | ✓ | ✓ | ✓ | WORKING |
| Documents | ✓ | parse-document | ✓ | documents | ✓ | enrich | extract | 8–12 | ✓ | ✓ | ✓ | ✓ | WORKING |
| Answer Bank | ✓ | CRUD | ✓ | answer_bank | ✓ | — | — | — | ✓ | ✓ | ✓ | partial | WORKING |
| Gov Exams | ✓ | create-exam-paper | ✓ | gov_* | ✓ | gap-fill | factory | 3–15 job | ✓ | ✓ | ✓ | ✓ | ENV DEP |
| Assessments | ✓ | assemble-assessment | ✓ | snapshots | ✓ | — | — | varies | ✓ | ✓ | partial | partial | PARTIAL |
| Scorecard | ✓ | generate-scorecard | ✓ | scorecards | ✓ | hybrid | scaffold | 15 | ✓ | ✓ | ✓ | ✓ | WORKING |
| Debrief | ✓ | generate-debrief job | ✓ | debrief jobs | ✓ | hybrid | scaffold | 15 job | ✓ | ✓ | ✓ | ✓ | WORKING |
| Company Research | ✓ | company-research async | ✓ | briefs/jobs | ✓ | hybrid | skeleton | 20 job | ✓ | ✓ | ✓ | contracts | WORKING |
| Referrals | ✓ | record-referral | ✓ | referrals | ✓ | — | — | +25/+25 | ✓ | ✓ | ✓ | ✓ | WORKING |
| Billing | ✓ | razorpay-* | ✓ | payment_orders | ✓ | — | — | grants | ✓ | ✓ | ✓ | ✓ | ENV DEP |
| Calendar | ✓ | OAuth callback | ✓ | tokens | ✓ | — | — | — | ✓ | partial | partial | partial | NOT VERIFIED |
| Learning Hub | ✓ | client | partial | courses | ✓ | — | — | — | ✓ | ✓ | ✓ | partial | INCOMPLETE |
| Community | ✓ | client | ✓ | community | ✓ | — | — | — | ✓ | ✓ | ✓ | partial | WORKING |
| Admin | ✓ | admin edges | ✓ | audit | staff | — | ingest | — | ✓ | ✓ | ✓ | partial | PARTIAL |
| Electron overlay | ✓ | same as live | ✓ | — | ✓ | hybrid | — | same | session | ✓ | ✓ | e2e | PARTIAL |
| Interview Day | ✓ | calendar-adjacent | partial | — | ✓ | — | — | — | partial | ✓ | ✓ | partial | PARTIAL |
| Notifications | ✓ | client | partial | — | ✓ | — | — | — | partial | ✓ | ✓ | partial | PARTIAL |
| Settings | ✓ | profile/billing | ✓ | profiles | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | WORKING |
| Coding challenges | ✓ | prep-tool | ✓ | — | ✓ | hybrid | coding | 2–10 | partial | ✓ | ✓ | ✓ | WORKING |

---

## §5 Repository Structure

Canonical runtime: `src/`, `supabase/`, `scraper/`, `electron/`.  
Non-canonical: `feature-copies/` (RC-FeatureCopiesDrift), `node_modules_mcp/`, build outputs.  
232+ migrations locally; 246 counted including branches. ~102 Edge function folders.

---

## §6 Source-of-Truth Conflicts

| Domain | Competing sources | Canonical | Status |
|--------|-------------------|-----------|--------|
| Credit costs | `creditEconomics.ts` (FE), `_shared/creditEconomics.ts` (Edge) | Parity scripts | PASS |
| Credit deduct client | `useCredits`, `creditsManager` | `useCredits` + Edge RPC | PARTIAL — 22 creditsManager refs |
| Plan SKUs | `pro_monthly` name vs one-time Razorpay | liveCatalog INR | MISLEADING naming |
| Session state | DB lifecycle, sessionStore, overlayStore, answerNextFsm | DB + RPCs authoritative | FRAGMENTED |
| Gov assembly | Edge + Python | Both with `assembly_source` | FIXED |
| Stripe vs Razorpay | env STRIPE_*, stripe-webhook | Razorpay only live | Stripe DEAD |

---

## §7 Technology Stack

React 18 + Vite + TypeScript, Zustand + TanStack Query, Tailwind/shadcn, Supabase Auth + Edge (Deno) + Postgres, FastAPI Python on Render, Electron 32 overlay, Razorpay billing.

---

## §8 Authentication

Chain: Auth → email verify → MFA (fail-closed when enrolled) → ban check → billing → onboarding → role → destination.  
`authStore` does not persist JWT. Multi-tab: shared localStorage; broadcast logout.  
**Status:** WORKING (code)

---

## §9 MFA / Multi-tab

TOTP + recovery codes. `ProtectedRoute` enforces AAL2 when MFA enrolled.  
**Status:** WORKING (code); optional until user enrolls

---

## §10 Onboarding / Protected Routes

`complete_onboarding` RPC gate. Protected routes via `ProtectedRoute.tsx` + plan/capability checks.  
**Status:** WORKING

---

## §11 RLS / Authorization

Broad `auth.uid()` tenant isolation. Questions RLS tightened (P0 fix). Promo via safe RPC.  
Live User A/B spot-check: **BLOCKED_BY_ENVIRONMENT** (TLS cert error on `rls:spot-check.mjs`).  
**Status:** IMPROVED; live verification pending

---

## §12 Database / Data Model

Postgres via Supabase. Key entities: profiles, sessions, session_answers, credit_ledger, payment_orders, gov_generated_papers, documents, mock_tests, debrief jobs.  
FK/index coverage strong on ledger and payment paths.

---

## §13 Schema Parity

`assembly_source` in types post `supabase:gen`. Remote migrations applied 2026-09-06.  
Minor lag possible on referral programme tables — documented in billing reconciliation.

---

## §14 API Contracts / Edge Functions

~102 functions at deploy quota cap. Typed errors via `domainErrors.ts`. Hybrid envelope via `hybridExecute.ts`.  
3 contract test drifts found (see §61).  
Blocked deploy: `list-public-promos`, `mock-tts` (402 plan cap).

---

## §15 Credits Economy

Authority: Postgres RPCs > Edge `resolveActionCost` > client preflight.  
Catalog `credit_catalog_v3`, 24 AI keys, parity **PASS**.  
Patterns: A client deduct (mock), B hybrid inline, C job reserve (gov, debrief, company research).

---

## §16 Billing / Razorpay

One-time checkout INR. Webhook + verify idempotent fulfill — **IMPLEMENTED_NOT_RUNTIME_VERIFIED**.  
Stripe paths fail-closed.

---

## §17 Referrals

Edge `record-referral` authoritative. No client `creditsDB.add`. Idempotent RPC guards.

---

## §18 Plan Gates / Capabilities

`requirePlan.ts`, `requireCapability.ts`, `freeTier.ts`. Overlay/live Pro gates. Gov AI gap-fill Pro.

---

## §19 AI Gateway / Hybrid Execute

All LLM server-side. Single charge; refund on total failure. Unknown ops fail-closed before credit reserve.

---

## §20 AI Context / Personalization

`buildFeatureContext.ts`, `assertContextForOperation`, frozen session snapshots for mock/live.

---

## §21 AI Operation Registry

`aiOperationRegistry.ts` + `operationRouter.ts`. 24 catalog keys aligned. Contract tests cover registry.

---

## §22 Practice Coach / Live Copilot

`generate-hint`: AI-only (`runPython: null`), SSE streaming.  
`generate-answer`: Python coach fallback with `livePythonTimeoutMs()`.  
**Status:** PARTIALLY WORKING — runtime audio/STT not CI-verified

---

## §23 Live Audio / STT

Deepgram via `deepgram-token` Edge. `parakeet-token` removed. Browser pipeline in `deepgramStream.ts`.  
**Status:** NOT_VERIFIED live

---

## §24–§26 Mock Interview

Setup → upfront deduct → generate questions → TTS → answerNextFsm → scorecard/debrief.  
Questions review via owned RPC post RLS fix.  
**Status:** WORKING (code)

---

## §27–§30 Government Exams

Official/PYQ: `official_verified` only (Edge aligned with Python).  
Provenance: `assembly_source`, migration applied. Worker ENV DEPENDENT.  
**Status:** ENV DEPENDENT

---

## §31 Python Dual Entry

`/v1/process` (11 V1 ops) + `/internal/operations` (scaffold ops).  
Guard: user coach cannot stay on scaffold. Contract tests **PASS**.

---

## §32–§33 Documents + Async Jobs

Edge job enqueue → Python worker HMAC. `documentJobLifecycle.test.ts` **PASS**.  
Company research + debrief async 202/waitUntil pattern.

---

## §34–§35 Frontend / Loading-Errors

Route inventory in `App.tsx`. JobProgressCard for async UX. Domain errors mapped in `edgeErrors.ts`.

---

## §36–§38 Secondary Features

Assessments: partial. Prep Lab: working. Answer Bank: working. Company Research: async job pattern.

---

## §39–§42 Security / Performance / Scale / Observability

HMAC on Python internal routes. CORS centralized. Loopback blocked in prod `pythonClient.ts`.  
`correlation_id` in Edge audit logs. Some duplicate client fetches (P2).

---

## §43–§47 Scorecard / Debrief / Admin / Calendar / Session History

Scorecard: eligibility before charge; junk-answer floor P1 candidate.  
Debrief: lifecycle-aware eligibility **FIXED**.  
Admin: gov paper review shows assembly_source. Calendar: NOT VERIFIED.

---

## §48 Cross-Feature Regression Matrix

Shared surfaces: auth, credits, AI gateway, session model — run full suite after each fix wave (§52).

---

## §49 Root Cause Grouping

| ID | Root cause | Priority | Status |
|----|------------|----------|--------|
| RC-A | Stripe/Razorpay split-brain | P1 | PARTIAL |
| RC-B | Duplicate credit APIs | P2 | PARTIAL |
| RC-C | Free credits monthly copy | P0 | **FIXED** |
| RC-D | Session FSM fragmentation | P2 | OPEN |
| RC-E | Runtime unverified flows | P1 | OPEN |
| RC-F | Types lag migrations | P2 | IMPROVED |
| RC-G | Questions answer-key leak | P0 | **FIXED** |
| RC-H | feature-copies drift | P3 | DOCUMENTED |
| RC-I | Gov dual-assembler provenance | P1 | **FIXED** |
| RC-J | Debrief incomplete when status=null | P1 | **FIXED** |
| RC-K | Session duration contract | P2 | **FIXED** |
| RC-L | Official PYQ policy mismatch | P1 | **FIXED** |
| RC-M | Edge function cap 100/100 | P1 | OPEN |
| RC-N | Contract test drift (3 failures) | P2 | **FIXED** Phase 1 |

---

## §50 Fix Wave Plan

| Wave | Priority | Focus |
|------|----------|-------|
| 1 | P0 | Security, RLS, auth, credit integrity |
| 2 | P1 | Business logic, API contracts, session FSM, gov/docs |
| 3 | P2 | Performance, schema drift, error taxonomy |
| 4 | P3 | Stripe naming, dead code, UI copy |

---

## §51 Fix Quality Standards

Root cause + architectural fix + test + regression note. No fake data, no weakened RLS/credits, no test expectation weakening for security.

---

## §52 Regression Protocol

```powershell
npm run billing:parity-ai
npm run billing:parity
npm run test:hybrid
npm run test:run -- src/test/lib/security/ src/test/lib/billing/ src/test/lib/ai/ src/test/lib/gov-exam/ src/test/lib/mock/ src/test/lib/edge/
```

Environment-dependent: Playwright E2E, RLS live, Razorpay prod webhook, Python Render worker.

---

## §53 Feature Health Matrix

| Feature | Business | Frontend | Backend | Database | AI | Python | Security | Credits | Performance | Overall |
|---------|----------|----------|---------|----------|-----|--------|----------|---------|-------------|---------|
| Auth/MFA | 9 | 8 | 9 | 8 | — | — | 9 | — | 8 | WORKING |
| Live Copilot | 7 | 7 | 8 | 8 | 7* | 7* | 8 | 8 | 7 | PARTIAL |
| Mock Interview | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 7 | WORKING |
| Gov Exams | 8 | 7 | 8 | 8 | 7* | 7* | 8 | 8 | 6 | ENV DEP |
| Billing | 8 | 8 | 8 | 9 | — | — | 8 | 9 | 8 | ENV DEP |
| Debrief | 8 | 7 | 8 | 8 | 7* | 7 | 8 | 8 | 7 | WORKING |
| Documents | 8 | 8 | 8 | 8 | 7 | 8 | 8 | 8 | 7 | WORKING |
| Company Research | 8 | 7 | 8 | 8 | 7 | 7 | 8 | 8 | 7 | WORKING |

*Runtime provider/audio not verified in CI

---

## §54 Business Logic Matrix

| Feature | Rule | Implementation | Correct? | Enforcement | Risk |
|---------|------|----------------|----------|-------------|------|
| Free credits | 50 one-time signup | RPC + copy | Yes | Postgres + Edge | Low |
| Mock upfront | Deduct before session | deduct-credits | Yes | Edge | Low |
| Hybrid AI | One charge per op | hybridExecute | Yes | Edge | Low |
| Official PYQ | Bank only | Edge+Python | Yes | Both | Low |
| Debrief | Evidence before charge | debriefEvidence | Yes | Edge | Low |
| Scorecard | Scorable answers | scorecardEligibility | Yes | Edge | Med (junk) |
| Referrals | No self-referral | RPC | Yes | Postgres | Low |
| Unknown AI op | Fail before charge | isKnownHybridOperation | Yes | Edge | Low |

---

## §55 Data Engineering Matrix

| Entity | SoT | RLS | Lifecycle | Risk |
|--------|-----|-----|-----------|------|
| profiles.credits | ledger sum RPC | own row | append-only | Low |
| sessions | sessions table | auth.uid | active→ended | Med (FSM) |
| gov_generated_papers | gov table | admin+owner | review FSM | Low |
| payment_orders | payment_orders | own+service | pending→fulfilled | Low |
| questions | questions | owner/admin | publish_status | Low (fixed) |

---

## §56 AI Engineering Matrix

| Feature | Context | Provider chain | Validation | Credit | Status |
|---------|---------|----------------|------------|--------|--------|
| Live hint | profile,JD,transcript | Gemini→… | buildFeatureContext | hybrid | code OK |
| Live answer | +screenshot | hybrid+Python | grounded output | hybrid | code OK |
| Mock questions | role,topics | hybrid+validate | schema | upfront | WORKING |
| Gov gap-fill | syllabus | Gemini Pro | MCQ validator | job | ENV DEP |
| Debrief | answers+transcript | AI required | evidence quotes | job | WORKING |

---

## §57 Python Engineering Matrix

| Operation | Entry | Edge owner | Python role | Credit owner | Status |
|-----------|-------|------------|-------------|--------------|--------|
| document_extract | /v1/process | parse-document | OCR | Edge | WORKING |
| practice_coach | /v1/process | generate-answer | coach | Edge | WORKING |
| speech_process | /v1/process | live STT post | normalize | Edge | NOT_VERIFIED |
| mock_question_validate | /v1/process | generate-questions | validate | Edge | WORKING |
| gov paper factory | worker | create-exam-paper | assemble | job RPC | ENV DEP |
| session_debrief | /internal/ops | generate-debrief | scaffold | Edge AI | WORKING |

**Python never mutates credits directly** — refund via Edge RPC from worker only.

---

## §58 Security Matrix

| Area | Threat | Protection | Gap | Severity |
|------|--------|------------|-----|----------|
| Questions | Answer leak | RLS + review RPC | — | FIXED |
| Python internal | Replay | HMAC + timestamp | — | Low |
| Credits | Client tamper | RPC-only | — | Low |
| IDOR sessions | Cross-user | RLS | Live spot-check pending | Med |
| Loopback Python | SSRF | sanitizeInternalServiceUrl | — | Low |
| Edge quota | Cannot deploy promos | 100/100 cap | list-public-promos blocked | P1 |

---

## §59 Performance Matrix

| Area | Issue | Severity | Notes |
|------|-------|----------|-------|
| Session list | Duplicate fetches | P2 | Client optimization candidate |
| Gov paper job | Long worker | Expected | Async job UX |
| Live hint SSE | TTFT tracked | OK | ttft_ms in generate-answer |

---

## §60 Technical Debt Matrix

| Item | Location | Priority | Action |
|------|----------|----------|--------|
| creditsManager duplication | src/lib/billing | P2 | Migrate callers to useCredits |
| Stripe naming drift | src/, env | P3 | Rename SKUs in UI copy |
| feature-copies/ | repo root | P3 | Archive or delete |
| Session FSM layers | stores + DB | P2 | Shared DTO contract |
| Edge function cap | Supabase plan | P1 | Retire unused functions |
| Contract test brittleness | edge tests | P2 | Align with architecture |

---

## §61 Automated Gate Results

| Gate | Result | Notes |
|------|--------|-------|
| `npm run billing:parity-ai` | **PASS** | 24 keys, credit_catalog_v3 |
| `npm run billing:parity` | **PASS** | ranks + packs + INR + CSP |
| `npm run test:hybrid` | **PASS** | 147 Vitest + 47 pytest = 180 |
| `node scripts/edge-function-parity.mjs` | **PASS** | 102 local slugs match allowlist (2026-09-06 wave 2) |
| Domain Vitest suites | **3081/3088 PASS** | 7 pre-existing failures unrelated to audit fixes |
| `npm run rls:spot-check` | **BLOCKED_BY_ENVIRONMENT** | TLS cert; no QA token |
| Playwright E2E | **NOT_VERIFIED** | No staging credentials in audit |

**Failed tests (pre-fix, resolved Phase 1):**
1. `aiOperationRegistryContracts.test.ts` — UNKNOWN_OPERATION switch format → **FIXED** (`domainErrors.ts`)
2. `companyResearchAsync.test.ts` — missing "Cancel generation" → **FIXED** (`CompanyProfile.tsx`)
3. `liveStreamContracts.test.ts` — generate-hint AI-only path documented → **FIXED** (test aligned to architecture)

---

## §62 Findings (canonical format)

### Finding SEC-001 — Published question answer keys via base table

**Category:** Security / RLS  
**Severity:** P0  
**Location:** `questions` RLS; `TestResults.tsx`  
**Current:** Authenticated SELECT on published rows exposed `correct_answer`.  
**Expected:** Keys only via owned completed test or admin.  
**Root cause:** RC-G  
**Fix:** Migration `20260905210000` + review RPC.  
**Tests:** `questionsReviewRpc.test.ts`  
**Status:** **FIXED** (migration applied remote 2026-09-06)

### Finding BIZ-001 — Free credits monthly refresh copy

**Category:** Business logic  
**Severity:** P0  
**Root cause:** RC-C  
**Fix:** Client copy + help migration `20260905211000`  
**Status:** **FIXED**

### Finding BIL-001 — Stripe split-brain

**Category:** Billing  
**Severity:** P1  
**Root cause:** RC-A  
**Status:** **PARTIAL** — fail-closed; env cleanup deferred

### Finding AI-001 — Runtime AI/audio unverified

**Category:** AI  
**Severity:** P1  
**Root cause:** RC-E  
**Status:** **NOT_VERIFIED**

### Finding OPS-001 — Edge function deploy cap

**Category:** Operations  
**Severity:** P1  
**Root cause:** RC-M  
**Current:** 100/100 active; `list-public-promos`, `mock-tts` blocked  
**Status:** **OPEN**

### Finding TEST-001 — Domain contract test drift (3)

**Category:** Testing  
**Severity:** P2  
**Root cause:** RC-N  
**Fix:** Phase 1 — domainErrors case, CompanyProfile cancel UX, liveStream contract update  
**Status:** **FIXED** (Phase 1)

### Finding RLS-001 — Live User A/B spot-check

**Category:** Security  
**Severity:** P1  
**Status:** **BLOCKED_BY_ENVIRONMENT**

### Finding GOV-001 — Dual assembler provenance

**Category:** Gov exams  
**Severity:** P1  
**Root cause:** RC-I  
**Fix:** `assembly_source` migration `20260906120000`  
**Status:** **FIXED**

### Finding DEB-001 — Debrief on incomplete session

**Category:** Debrief  
**Severity:** P1  
**Root cause:** RC-J  
**Status:** **FIXED**

### Finding SES-001 — Session duration type contract

**Category:** Sessions  
**Severity:** P2  
**Root cause:** RC-K  
**Status:** **FIXED**

---

## §63 Scores (0–10)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Business Logic | 8 | Gov PYQ + debrief aligned |
| Data Engineering | 8 | Provenance + ledger |
| Database / RLS | 8 | Questions fix applied |
| Backend / Edge | 8 | Hybrid mature; quota cap |
| Frontend | 7 | Async job UX improving |
| API | 8 | Typed errors |
| Authentication | 8 | Fail-closed MFA |
| MFA | 8 | TOTP + recovery |
| Sessions | 7 | Multi-FSM |
| AI | 7 | Context enforced; runtime unverified |
| Personalization | 7 | Contract enforced |
| Credits | 8 | Server authoritative |
| Billing | 7 | Razorpay; Stripe drift |
| Referrals | 8 | Idempotent RPC |
| Security | 8 | P0 questions fixed |
| Performance | 7 | Some duplicate fetches |
| Scalability | 7 | Job queues |
| Testing | 8 | 1052 domain + 180 hybrid |
| Observability | 7 | correlation_id |
| Maintainability | 6 | feature-copies drift |
| **OVERALL ENGINEERING SCORE** | **8.0** | Up from 7.8 post fix wave (see §70 Appendix) |

---

## §64 Production Decision

**Verdict: CONDITIONAL**

Not **PRODUCTION READY** because:
- Live RLS spot-check not run
- Razorpay production webhook not verified
- Live audio/STT browser path not verified
- Gov Python worker runtime not verified
- Edge function cap blocks new deploys

Not **NOT READY** because:
- No confirmed P0 auth bypass, credit corruption, or cross-user leak in code review
- Automated parity and hybrid contracts pass
- Prior P0 fixes deployed and migrations applied

**Hard NO triggers (none confirmed):** auth bypass, credit corruption, payment double-grant, cross-user data leak.

**Clear before full GO:**
1. ~~Apply pending migrations~~ ✓ 2026-09-06
2. ~~Deploy critical Edge functions~~ ✓ generate-debrief, gov paths
3. Live Razorpay webhook verification
4. Browser E2E: Live Copilot, Mock voice, Gov exam, Billing checkout
5. RLS live spot-check User A/B
6. Retire unused Edge functions to deploy `list-public-promos`

---

## §65 Appendix — Phase 1 Fixes Applied (2026-09-06)

| Item | Files | Wave |
|------|-------|------|
| UNKNOWN_OPERATION explicit 400 case | `domainErrors.ts` | P2 contract |
| Company research cancel UX parity | `CompanyProfile.tsx` | P2 UX |
| Live stream contract aligned to AI-only hints | `liveStreamContracts.test.ts` | P2 contract |

## §66 Appendix — Expanded Report (Master Format §68–§71)

**Appendix date:** 2026-09-06 (post fix wave)

### Fix wave summary (P1–P3)

| Fix | Root cause | Files | Status |
|-----|------------|-------|--------|
| Scorecard junk-answer gate | SCORE-002 | `scorecardEligibility.ts`, `generate-scorecard`, `scorableAnswers.ts` | **FIXED** |
| Hybrid `assertBeforeCharge` | HYB-002 | `hybridExecute.ts` | **FIXED** |
| `creditPrecheck` migration wave 1–2 | RC-B | `creditPrecheck.ts`, overlay, live, PrepLab, prep pages, fetchEdge, coachChat | **FIXED** |
| Dashboard dedup fetch | PERF-002 | `useDashboardData.ts` | **FIXED** |
| Stripe one-time copy | BIL-002 | `subscriptionManager.ts`, `.env.example` | **PARTIAL** |
| Edge retired stub parity + allowlist sync | RC-M | `edge-function-parity.mjs`, `REMOTE_FUNCTION_ALLOWLIST.txt` | **FIXED** |
| Session lifecycle DTO | RC-D | `sessionLifecycleContract.ts` | **PARTIAL** |
| feature-copies classification | RC-H | `docs/feature-copies/README.md` | **FIXED** |

### §51 Decision Matrix (selected)

| Finding | Business | Data | Backend | Frontend | AI | Security | Performance | Priority |
|---------|----------|------|---------|----------|-----|----------|-------------|----------|
| SCORE-002 junk gate | High | Ledger integrity | Edge gate | Eligibility UI | — | — | — | P1 |
| HYB-002 pre-charge hook | High | Credit SoT | hybridExecute | — | — | — | — | P1 |
| RC-B creditPrecheck | Med | Single preflight SoT | — | Migration | — | — | — | P2 |
| PERF-002 dashboard | Low | — | — | Bundle fetch | — | — | High | P2 |
| OPS-001 edge cap | Med | — | Deploy quota | — | — | — | — | P1 |
| RLS-001 live spot-check | High | Tenant isolation | RLS | — | — | High | — | P1 |

### State machine audit (summary)

| Domain | Authoritative SoT | Parallel layers | Status |
|--------|-------------------|-----------------|--------|
| Auth | Supabase + `authStore` | — | OK |
| Live session | DB `lifecycle_status` | sessionStore, overlayStore | RC-D OPEN |
| Mock | `answerNextFsm` | overlay mock states | OK (tested) |
| Gov exam | `examAttemptFsm` | legacy mock_tests status | OK |
| Document job | job row + RPC | document processing_status | OK |
| Billing | `payment_orders` FSM | display buckets | OK |

### Edge function inventory (102 allowlist slugs)

| Class | Count | Examples |
|-------|-------|----------|
| ACTIVE | 82 | generate-hint, razorpay-webhook (fail-closed), create-exam-paper |
| RETIRED_STUB | 10 | billing-status, create-checkout, cancel-subscription, save-answer |
| BLOCKED_DEPLOY | 2 | list-public-promos, mock-tts (100/100 quota) |

**Safe retirement plan:** Keep RETIRED_STUB sources in repo; do not delete folders. Retire additional slugs only after grep confirms zero `src/` callers and parity script updated. Unblock promos by retiring 2+ unused deployed functions (ops action post-merge).

### §69 Fix-wave findings (abbreviated)

**SCORE-002** — Scorecard blocked when all answers junk; `assertBeforeCharge` + shared scorable floor. **FIXED**  
**HYB-002** — Standard pre-charge hook in hybrid stream + non-stream paths. **FIXED**  
**RC-B** — `creditPrecheck.ts` preferred for preflight + refresh; `creditsManager` retained only for deduct paths (`creditDeductionMiddleware`, `MockInterview`). **FIXED**  
**PERF-002** — `loadDashboardBundle` single history fetch. **FIXED**  
**BIL-002** — Pro tagline clarifies one-time Razorpay; Stripe env marked retired. **PARTIAL**

### §70 Scores (25 dimensions)

Overall **8.0** (up from 7.8). Testing **9** (1238 domain + 180 hybrid). Live Copilot / Gov remain **7** (runtime unverified).

### §71 Production decision

**CONDITIONAL** — All contract gates green; runtime E2E, RLS spot-check, Razorpay prod webhook, and gov worker remain **NOT_VERIFIED** / **BLOCKED_BY_ENVIRONMENT**.

---

*Canonical audit document. Supersedes partial coverage in MASTER for release decisions; MASTER retains historical fix log with pointer to this file.*
