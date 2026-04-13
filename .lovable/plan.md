

# Clarify AI — Complete Application Audit (Post-Fix Round 3)

## 1. APPLICATION OVERVIEW

- **Name**: Clarify AI
- **Purpose**: Interview prep platform with real-time AI-powered stealth overlay for live interviews + competitive exam mock test engine
- **Target users**: Job seekers (tech interviews) and competitive exam candidates (JEE, NEET, UPSC, SSC, Banking)
- **Tech stack**: React 18 / Vite 5 / Tailwind / Zustand / TypeScript | Supabase (Postgres + Auth + Edge Functions + Storage + Realtime) | Gemini/OpenAI/Anthropic AI | Deepgram STT | Stripe billing | Electron (optional desktop)
- **Database**: 49 tables, 1,000 questions, 43 exam papers
- **Edge functions**: 26 deployed

---

## 2–3. COMPLETE FEATURE LIST WITH WORKING STATUS

### A. Auth & Onboarding
| Feature | Status | Notes |
|---------|--------|-------|
| Email signup/login | ✅ | |
| OAuth (Google/GitHub) | ⚠️ | Depends on Supabase provider config |
| Email verification | ✅ | |
| Password reset | ✅ | |
| 5-step onboarding wizard | ✅ | |
| Protected routes | ✅ | |

### B. Dashboard
| Feature | Status | Notes |
|---------|--------|-------|
| Stats cards, greeting | ✅ | Types fixed |
| Recent sessions list | ✅ | |
| Upcoming interviews | ✅ | |
| XP/streak/gamification display | ✅ | |

### C. Live Interview Co-Pilot (CORE DIFFERENTIATOR)
| Feature | Status | Notes |
|---------|--------|-------|
| Pre-session setup wizard | ✅ | Duration, platform, system audio |
| Live rehearsal 2-panel layout | ✅ | Transcript left, AI right |
| Hint mode (bullet hints via routeHint) | ✅ | Connected and working |
| **Full Answer mode (STAR via generate-answer)** | **✅ FIXED** | `useLiveCopilot` now checks `answer_mode` and calls `generate-answer` EF for full answers, `routeHint` for hints |
| Credit deduction (generate-answer) | ✅ FIXED | Uses `deductCredits()` from `_shared/supabase.ts` — correct atomic pattern |
| SSE streaming to frontend | ✅ | generate-answer streams via Gemini SSE, frontend parses SSE lines |
| Overlay portal (#overlay-root) | ✅ | div in index.html |
| Deepgram STT | ⚠️ Blocked | `DEEPGRAM_API_KEY` exists ✅ but `DEEPGRAM_PROJECT_ID` is **missing** — temp key endpoint returns 503 |
| System audio capture | ⚠️ | Chromium-only, tab-share required |
| Mic capture | ✅ | |
| Session timer with configurable duration | ✅ | 5m/2m/30s warnings |
| Panic button / hotkeys / stealth mouse | ✅ | |
| Screen capture evasion | ⚠️ | CSS-based, varies by browser |

### D. Mock Interview
| Feature | Status | Notes |
|---------|--------|-------|
| Mock launcher & session | ✅ | `useSessionOrchestrator` restored |

### E. Mock Test Engine (Competitive Exams)
| Feature | Status | Notes |
|---------|--------|-------|
| Exam type mapping | ✅ | `examTypeMap.ts` direction is correct |
| **Question data availability** | **❌ CRITICAL GAP** | 1,000 questions covering only 10 specific exam_type+year combos. 43 exam papers exist (2016–2025). Most paper+year combos return 0 questions. |
| 2026 papers | ✅ FIXED | Deleted via migration + trigger prevents future inserts |
| Test session/results/analytics UI | ✅ | |
| Question upload (Excel) | ✅ | |
| AI gap-fill | ⚠️ | `SYSTEM_USER_ID` secret not set |

### F. Prep Lab
| Feature | Status | Notes |
|---------|--------|-------|
| STAR builder, Rephraser, Coding hints | ⚠️ | Depend on AI edge functions |
| System design, Project builder | ✅ | |

### G. Billing & Stripe
| Feature | Status | Notes |
|---------|--------|-------|
| Credit system (DB RPCs) | ✅ | `deduct_credits` and `add_credits` work |
| create-checkout | ✅ FIXED | Uses `getCorsHeaders(req)` |
| **stripe-webhook** | **✅ FIXED** | Uses `plan_id` (not `plan`), no `stripe_customer_id` in subscriptions upsert, uses `getCorsHeaders(req)` |
| **Stripe secrets** | **❌ Missing** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` not in secrets |

### H. Other Modules
| Module | Status |
|--------|--------|
| Documents/Resume | ✅ |
| Answer Bank | ✅ |
| Company Research | ⚠️ (AI dependent) |
| Interviews/Scheduling | ✅ |
| Calendar Sync | ❓ No Google OAuth config |
| Sessions/Debrief | ✅ (UI) |
| Practice Rooms | ⚠️ (Realtime dependent) |
| Settings (15 pages) | ✅ |
| Admin Panel | ✅ |
| Marketing Pages | ✅ |
| Gamification/XP/Streaks | ✅ |
| Referrals | ✅ |

---

## 4. END-TO-END FLOWS

### Public → Auth: ✅ Working
Landing → Signup → Email verify → Onboarding (5 steps) → Dashboard

### Live Session: ⚠️ Partially working
Setup → Live Rehearsal → AI panel (hint + full answer toggle both connected ✅) → End → Scorecard
**Breakpoint**: Deepgram STT blocked (missing `DEEPGRAM_PROJECT_ID`), so no automatic question detection — user must type questions manually

### Mock Test: ❌ Data gap
MockTestHub → ExamPapers → Configure → Session → Results
**Breakpoint**: Most paper selections return 0 questions

### Billing: ❌ Missing secrets
Settings → Billing → Upgrade → create-checkout
**Breakpoint**: No `STRIPE_SECRET_KEY` — returns 503

---

## 5. DATABASE & API AUDIT

### Schema: All column references in stripe-webhook are now correct
- `profiles.plan_id` ✅ (was `plan` — fixed)
- `subscriptions` table has no `stripe_customer_id` — webhook no longer writes it ✅
- `deduct_credits` RPC signature `(p_action, p_cost, p_session_id)` — generate-answer uses shared `deductCredits()` helper instead ✅

### Data gaps
- 1,000 questions across 10 exam_type+source_year combos
- 43 exam papers across 5 exam types × ~10 years
- **33 paper+year combos have ZERO matching questions**

### Missing secrets
| Secret | Status | Impact |
|--------|--------|--------|
| DEEPGRAM_PROJECT_ID | ❌ | STT temp keys return 503 |
| STRIPE_SECRET_KEY | ❌ | All billing non-functional |
| STRIPE_WEBHOOK_SECRET | ❌ | Webhook signature skip |
| STRIPE_PRICE_* | ❌ | No price IDs for checkout |
| SYSTEM_USER_ID | ❌ | AI gap-fill inserts with null |

---

## 6. CORS AUDIT — 26 Edge Functions Still Using Deprecated `corsHeaders`

**Fixed (4)**: `generate-answer`, `deepgram-token`, `stripe-webhook`, `create-checkout` — all use `getCorsHeaders(req)` ✅

**Still using deprecated `corsHeaders` (26+)**: `ai-feedback`, `ai-coach-chat`, `analytics-dashboard`, `analyze-test-performance`, `cancel-subscription`, `company-research`, `create-test`, `delete-account`, `disconnect-calendar`, `export-user-data`, `gap-analysis`, `generate-debrief`, `generate-hint`, `generate-practice-questions`, `generate-questions`, `generate-star-answer`, `parse-question-pdf`, `parse-resume`, `ping`, `polish-star-section`, `prep-tool`, `resume-subscription`, `schedule-interview`, `select-test-questions`, `send-email`, `submit-test`, `sync-calendar`, `validate-api-key`

**Impact**: All 26+ functions will have browser-side CORS blocks because `corsHeaders` lacks `Access-Control-Allow-Origin`.

---

## 7. SECURITY
- CORS: 4 critical functions fixed ✅, 26+ still vulnerable to browser blocks
- Deepgram: Temp key architecture correct, blocked by missing secret
- Admin: Protected by `has_role()` + trigger
- RLS: Enabled on all tables

---

## 8. CRITICAL ISSUES (Ranked)

### P0 — Immediate
1. **26 edge functions still use deprecated `corsHeaders`** — browser blocks ALL responses from these functions including `generate-hint` (core feature), `select-test-questions` (mock tests), `ai-coach-chat`, etc. This is the single biggest blocker.
2. **Question data gap** — 33 of 43 exam papers return 0 questions
3. **Missing secrets** — DEEPGRAM_PROJECT_ID, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_*, SYSTEM_USER_ID

### P1 — High
4. `useLiveCopilot.ts` uses `profile as any` cast — works but fragile

---

## 9. IMPLEMENTATION PLAN

### Step 1: Migrate all 26 remaining edge functions from `corsHeaders` to `getCorsHeaders(req)`
For each function:
- Replace `import { corsHeaders }` with `import { handleCors, getCorsHeaders }`
- Replace `if (req.method === "OPTIONS") return new Response(...)` with `const cors = handleCors(req); if (cors) return cors;`
- Replace all `{ ...corsHeaders, ... }` with `{ ...getCorsHeaders(req), ... }` (passing `req` through)

This is the highest-impact fix — without it, `generate-hint`, `select-test-questions`, `ai-coach-chat`, and 23 other functions are blocked by browsers.

### Step 2: Seed question data
Create a migration or script to insert questions for the 33 missing exam_type+year combinations (at minimum 50 questions each for years 2023-2025).

### Step 3: Add missing secrets
User must add: `DEEPGRAM_PROJECT_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` IDs, `SYSTEM_USER_ID` in the Supabase dashboard.

### Overall Status: ~60% functional | NOT production ready
**Primary blocker**: 26 edge functions with broken CORS will cause silent failures across almost every AI-powered feature.

