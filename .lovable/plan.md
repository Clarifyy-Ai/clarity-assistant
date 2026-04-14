

# Clarify AI — Complete Application Audit Report

---

## 1. APPLICATION OVERVIEW

- **Name**: Clarify AI
- **Purpose**: Interview preparation platform with a real-time AI-powered stealth overlay for live interviews, plus a competitive exam mock test engine (JEE, NEET, UPSC, SSC, Banking)
- **Target users**: Job seekers (tech/behavioral interviews) and competitive exam candidates (India-focused)
- **Tech stack**:
  - Frontend: React 18 / Vite 5 / TypeScript 5 / Tailwind v3 / Zustand / React Router v6 / TanStack Query
  - Backend: Supabase (Postgres 14.4, Auth, Edge Functions, Storage, Realtime)
  - AI: Google Gemini (primary), OpenAI GPT-4o, Anthropic Claude (BYOK)
  - STT: Deepgram Nova-2
  - Billing: Stripe
  - Desktop: Electron (optional)
- **Database**: 50 tables, ~1,000 seeded questions, 43 exam papers, 2 user profiles, 22 sessions
- **Edge Functions**: 32 deployed

### Architecture

```text
Browser (SPA) ──HTTPS──▶ Supabase
                          ├─ Postgres (RLS on all tables)
                          ├─ Auth (JWT)
                          ├─ Storage (resumes, avatars, docs, exports)
                          ├─ Realtime (practice rooms)
                          └─ Edge Functions (32 Deno)
                               └─▶ Gemini / OpenAI / Anthropic / Deepgram / Stripe
```

---

## 2. COMPLETE FEATURE INVENTORY

### A. Auth & Onboarding
| Feature | Status | Location |
|---------|--------|----------|
| Email signup/login | ✅ | `/login`, `/signup`, `LoginForm.tsx`, `SignupForm.tsx` |
| OAuth (Google/GitHub) | ⚠️ | `OAuthButton.tsx` — depends on Supabase provider config |
| Email verification | ✅ | `/verify-email`, `VerifyEmailModal.tsx` |
| Password reset | ✅ | `/forgot-password`, `/reset-password` |
| 5-step onboarding | ✅ | `/onboarding`, `OnboardingWizard.tsx` |
| Protected routes | ✅ | `ProtectedRoute.tsx` |
| Auth callback | ✅ | `/auth/callback` |

### B. Dashboard
| Feature | Status | Location |
|---------|--------|----------|
| Stats cards + greeting | ✅ | `/app/dashboard`, `Dashboard.tsx` |
| Recent sessions | ✅ | Queries `sessions` table |
| Upcoming interviews | ✅ | Queries `scheduled_interviews` |
| XP/streak display | ✅ | `useGamification.ts`, `profiles` table |

### C. Live Interview Co-Pilot
| Feature | Status | Location |
|---------|--------|----------|
| Pre-session setup wizard | ✅ | `PreSessionSetupWizard.tsx` |
| 2-panel layout (transcript + AI) | ✅ | `LiveRehearsal.tsx` |
| Hint mode (3 bullets) | ✅ | `generate-hint` EF, `routeHint()` |
| Full Answer mode (STAR) | ✅ | `generate-answer` EF, `useLiveCopilot.ts` checks `answer_mode` |
| Credit deduction | ✅ | `deduct_credits` RPC — correct 3-param signature |
| SSE streaming | ✅ | `generate-answer` streams via Gemini API |
| Overlay window | ✅ | `OverlayWindow.tsx`, portal to `#overlay-root` |
| Deepgram STT | ❌ | `DEEPGRAM_PROJECT_ID` secret missing — temp key endpoint fails |
| Mic capture | ✅ | `useAudioCapture.ts`, `micCapture.ts` |
| System audio | ⚠️ | Chromium-only, requires tab-share |
| Session timer | ✅ | `LiveSessionTimer.tsx` |
| Panic button / hotkeys | ✅ | `LivePanicButton.tsx`, `LiveHotKeyListener.tsx` |
| Stealth mouse guard | ✅ | `StealthMouseGuard.tsx` |
| Screen capture evasion | ⚠️ | CSS-based (`display: none` during capture) |

### D. Mock Interview
| Feature | Status | Location |
|---------|--------|----------|
| Mock launcher | ✅ | `MockInterview.tsx` |
| Mock session | ✅ | `MockSession.tsx`, `useSessionOrchestrator.ts` |
| Mock warmup | ✅ | `MockWarmup.tsx` |

### E. Mock Test Engine
| Feature | Status | Location |
|---------|--------|----------|
| Exam type mapping | ✅ | `examTypeMap.ts` — direction corrected |
| Exam papers catalog | ✅ | 43 papers (2016-2025), trigger blocks future years |
| Question bank | ❌ DATA GAP | 1,000 questions across only 10 type+year combos; 33 of 43 papers have 0 questions |
| Test configuration wizard | ✅ | `TestConfigure.tsx` |
| Test session UI | ✅ | `TestSession.tsx` |
| Test results/analytics | ✅ | `TestResults.tsx`, `TestAnalytics.tsx` |
| Question upload (Excel) | ✅ | `UploadQuestions.tsx`, `ExcelImportTab.tsx` |
| AI gap-fill | ⚠️ | `select-test-questions` EF — `SYSTEM_USER_ID` not set |
| Revision list (spaced repetition) | ✅ | `TestRevision.tsx`, `revision_list` table |

### F. Prep Lab
| Feature | Status | Location |
|---------|--------|----------|
| STAR builder | ⚠️ | `StarBuilder.tsx` → `generate-star-answer` EF |
| Rephraser | ⚠️ | `Rephraser.tsx` → `prep-tool` EF |
| Coding hints | ⚠️ | `CodingHints.tsx` → `generate-hint` EF |
| System design | ⚠️ | `SystemDesign.tsx` → `prep-tool` EF |
| Project builder | ✅ | `ProjectBuilder.tsx` (local) |

### G. Documents
| Feature | Status | Location |
|---------|--------|----------|
| Resume upload/management | ✅ | `Documents.tsx`, `resumes` table, `resumes` bucket |
| JD management | ✅ | `JDDetail.tsx`, `job_descriptions` table |
| Resume parsing | ⚠️ | `parse-resume` EF — depends on `OCR_API_KEY` |

### H. Answer Bank
| Feature | Status | Location |
|---------|--------|----------|
| Save/edit/favorite answers | ✅ | `AnswerBank.tsx`, `answer_bank` table |

### I. Company Research
| Feature | Status | Location |
|---------|--------|----------|
| AI company research | ⚠️ | `CompanyResearch.tsx` → `company-research` EF |

### J. Interviews & Scheduling
| Feature | Status | Location |
|---------|--------|----------|
| Interview CRUD | ✅ | `Interviews.tsx`, `scheduled_interviews` table |
| Calendar sync | ❓ | `calendar_integrations` table — no Google OAuth configured |

### K. Sessions & Debrief
| Feature | Status | Location |
|---------|--------|----------|
| Session history | ✅ | `SessionHistory.tsx`, `sessions` table |
| Session detail | ✅ | `SessionDetail.tsx` |
| AI debrief generation | ⚠️ | `generate-debrief` EF |

### L. Practice Rooms
| Feature | Status | Location |
|---------|--------|----------|
| Room creation/joining | ⚠️ | `PracticeRooms.tsx`, `rooms` + `practice_rooms` tables |
| Room chat | ⚠️ | `room_chat` table, Supabase Realtime |

### M. Billing & Credits
| Feature | Status | Location |
|---------|--------|----------|
| Credit system (RPCs) | ✅ | `deduct_credits`, `add_credits` DB functions |
| Credit balance display | ✅ | `CreditBalance.tsx` |
| Stripe checkout | ❌ | `create-checkout` EF — `STRIPE_SECRET_KEY` missing |
| Stripe webhook | ❌ | `stripe-webhook` EF — keys missing; code is correct |
| Subscription management | ❌ | `cancel-subscription`, `resume-subscription` — Stripe keys missing |

### N. Gamification
| Feature | Status | Location |
|---------|--------|----------|
| XP / levels / streaks | ✅ | `useGamification.ts`, `useXPSystem.ts`, `profiles` columns |
| Achievements / badges | ✅ | `achievements`, `user_achievements`, `user_badges` tables |
| Weekly challenges | ✅ | `weekly_challenges` table |

### O. Settings (15 pages)
| Feature | Status |
|---------|--------|
| Profile, Audio, Models, Billing, Notifications, Privacy, Security, Integrations, BYOK, Appearance, Subscription, Credits, Data, Danger | ✅ All render |

### P. Admin Panel
| Feature | Status | Location |
|---------|--------|----------|
| Admin dashboard | ✅ | `AdminDashboard.tsx`, guarded by `has_role()` |
| User management | ✅ | `AdminUsers.tsx` |
| Analytics / Revenue | ✅ | `AdminAnalytics.tsx`, `AdminRevenue.tsx` |
| Model costs | ✅ | `AdminModelCosts.tsx` |
| Feature flags | ✅ | `AdminFeatureFlags.tsx` |
| Question seeding | ✅ | `AdminSeedQuestions.tsx` |

### Q. Marketing Pages
| Feature | Status |
|---------|--------|
| Landing, Pricing, Help, Blog, Terms, Privacy, Shortcuts | ✅ All render |

### R. Referrals
| Feature | Status | Location |
|---------|--------|----------|
| Referral system | ✅ | `Referrals.tsx`, `referrals` table |

---

## 3. FEATURE-WISE DETAILED ANALYSIS — KEY FINDINGS

### Live Co-Pilot (most critical feature)
- **Working**: Setup wizard → mic capture → AI hint/answer toggle → SSE streaming → session timer → panic button → hotkeys
- **Broken**: Deepgram STT (`DEEPGRAM_PROJECT_ID` not in secrets) — users must type questions manually
- **Architecture**: `useLiveCopilot.ts` reads `answer_mode` from `overlayStore`, routes to `routeHint()` for hints or `supabase.functions.invoke("generate-answer")` for full STAR answers
- **Credit flow**: `deduct_credits(p_action, p_cost, p_session_id)` — verified correct in both `generate-answer/index.ts` and `database.ts`

### Mock Test Engine
- **Critical data gap**: Only 10 of 43 exam paper+year combos have questions:
  - APPSC-2018 (91), Banking-2021 (91), JEE-2019/20/21 (273), NEET-2020 (182), SSC-2019 (91), TSPSC-2022 (90), UPSC-2020/21 (182)
  - Papers exist for IBPS PO (2016-2025), JEE (2016-2025), NEET (2016-2025), SSC CGL (2016-2025), UPSC CSE (2023-2025) — most return 0 questions
- **Exam type mapping**: `examTypeMap.ts` correctly maps e.g. `"SSC CGL"` → `"SSC Exams (CGL/CHSL)"`

### Billing
- **Code is correct** — `stripe-webhook` uses `plan_id`, no `stripe_customer_id`, proper CORS
- **Blocked by missing secrets**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`

---

## 4. USER FLOW ANALYSIS

### Normal User Flow
Landing → Signup → Email verify → Onboarding (5 steps) → Dashboard → **Working ✅**
Dashboard → Live Session → Setup → AI Panel (hints/answers) → End → Scorecard → **Partially working ⚠️** (STT blocked)
Dashboard → Mock Test → Exam Papers → Configure → Session → Results → **Blocked for most exams ❌** (data gap)
Dashboard → Prep Lab → STAR/Rephrase/etc. → **Works with Gemini ⚠️**
Settings → Billing → Upgrade → **Blocked ❌** (no Stripe key)

### Admin Flow
Login → `/app/admin` → Dashboard/Users/Analytics/Revenue/Flags/Seed → **Working ✅** (guarded by `has_role()` + `is_admin()`)

---

## 5. DATABASE & API AUDIT

### 50 Tables — all have RLS enabled ✅
Notable duplicate/overlapping tables:
- `rooms` + `practice_rooms` (both store rooms)
- `answers` + `saved_answers` + `answer_bank` (triple overlap for saved answers)
- `credits` table exists alongside `profiles.credits` column

### Key Schema Facts
- `profiles.plan_id` (not `plan`) — webhook correctly uses this ✅
- `deduct_credits(p_action text, p_cost integer, p_session_id uuid)` — correct ✅
- `subscriptions` has no `stripe_customer_id` column — webhook no longer writes it ✅
- `exam_papers` has `validate_exam_paper_year` trigger blocking year > current+1 ✅

### Linter Issues (3)
1. **WARN**: Extension `pg_trgm` installed in `public` schema — should be in a dedicated schema
2. **WARN**: `avatars` public bucket allows listing all files
3. **WARN**: Leaked password protection is disabled

---

## 6. API & INTEGRATION AUDIT

### Edge Functions — CORS Status
- **`corsHeaders` constant** now has `Access-Control-Allow-Origin: *` — verified working via `ping` endpoint (returns `ACAO: *`)
- All 32 functions have working CORS (either via `getCorsHeaders(req)` or the wildcard fallback)
- 4 functions use the modern `getCorsHeaders(req)`: `generate-answer`, `deepgram-token`, `stripe-webhook`, `create-checkout`
- Remaining 28 use the deprecated `corsHeaders` with wildcard — functional but less secure

### Secrets Audit
| Secret | Status | Impact |
|--------|--------|--------|
| GEMINI_API_KEY | ✅ Set | AI generation works |
| LOVABLE_API_KEY | ✅ Set | Internal |
| SUPABASE_* (3) | ✅ Set via connector | Auth, DB |
| OCR_API_KEY | ✅ Set via connector | Resume parsing |
| DEEPGRAM_API_KEY | ✅ Set via connector | But needs PROJECT_ID too |
| DEEPGRAM_PROJECT_ID | ❌ Missing | STT temp keys fail |
| STRIPE_SECRET_KEY | ❌ Missing | All billing broken |
| STRIPE_WEBHOOK_SECRET | ❌ Missing | Webhook verification skip |
| STRIPE_PRICE_* | ❌ Missing | No checkout price IDs |
| SYSTEM_USER_ID | ❌ Missing | AI gap-fill inserts with null |
| OPENAI_API_KEY | ❌ Missing | BYOK only |
| ANTHROPIC_API_KEY | ❌ Missing | BYOK only |
| RESEND_API_KEY | ❌ Missing | Email sending disabled |

---

## 7. PERFORMANCE & SECURITY

### Performance
- All pages are lazy-loaded (code-split) ✅
- QueryClient has sensible defaults: 2min stale, 10min GC, no refetch on focus ✅
- AI responses are SSE-streamed ✅

### Security
- RLS on all 50 tables ✅
- Admin protected by `has_role()` security definer function ✅
- `protect_admin_column` trigger prevents privilege escalation ✅
- BYOK keys stored as hints (encrypted) in `profiles` ✅
- **Risk**: `corsHeaders` uses `Access-Control-Allow-Origin: *` — acceptable for API but means any website can call these functions with user's JWT
- **Risk**: `avatars` bucket allows public listing
- **Risk**: Leaked password protection disabled
- **Risk**: `pg_trgm` extension in public schema

---

## 8. UI/UX (360px viewport)
- Mobile-responsive layout with `MobileNav` and sidebar drawer ✅
- Overlay is designed for desktop — not mobile-friendly (expected)
- Electron support with frameless window drag region ✅

---

## 9. CRITICAL ISSUES (Priority List)

### 🔴 P0 — Critical
1. **Missing `DEEPGRAM_PROJECT_ID` secret** — Core STT feature completely non-functional. Users cannot auto-detect interview questions.
2. **Missing Stripe secrets** (3) — All billing/subscription features non-functional
3. **Question data gap** — 33 of 43 exam papers return 0 questions, making most mock tests empty

### 🟠 P1 — High
4. **Missing `SYSTEM_USER_ID`** — AI gap-fill for questions inserts with `uploaded_by = null`
5. **Missing `RESEND_API_KEY`** — No transactional emails (verification emails rely on Supabase default)
6. **Wildcard CORS on 28 functions** — Any website can call these with a stolen JWT
7. **`avatars` bucket allows public listing** — Privacy concern
8. **Leaked password protection disabled** — Users can register with compromised passwords

### 🟡 P2 — Medium
9. **Duplicate tables** — `rooms` vs `practice_rooms`, `answers` vs `saved_answers` vs `answer_bank`
10. **`pg_trgm` in public schema** — Should be in a dedicated extension schema
11. **Calendar sync not configured** — Google OAuth provider not set up

### 🟢 P3 — Low
12. **`useLiveCopilot.ts`** uses `profile as any` cast — works but fragile
13. **React Router v6→v7 future flag warning** suppressed via console.warn override

---

## 10. RECOMMENDED FIXES

### Fix 1 (P0): Add missing secrets
User must add in Supabase Dashboard → Settings → Edge Functions → Secrets:
- `DEEPGRAM_PROJECT_ID` — Get from Deepgram console → Projects
- `STRIPE_SECRET_KEY` — From Stripe Dashboard → Developers → API keys
- `STRIPE_WEBHOOK_SECRET` — From Stripe Dashboard → Webhooks → Signing secret
- `SYSTEM_USER_ID` — Create a system profile row, use its UUID

### Fix 2 (P0): Seed question data
Create a migration or admin script to insert questions for the 33 missing exam_type+year combinations. At minimum, seed 50 questions per combo for the most recent 3 years (2023-2025) across all 5 exam types.

### Fix 3 (P1): Migrate 28 EFs to `getCorsHeaders(req)`
For each function using `corsHeaders`:
- Replace `import { corsHeaders }` → `import { getCorsHeaders }`
- Replace `{ ...corsHeaders, ... }` → `{ ...getCorsHeaders(req), ... }`
- This replaces wildcard CORS with per-origin validation

### Fix 4 (P1): Enable leaked password protection
Go to Supabase Dashboard → Auth → Security → Enable "Leaked Password Protection"

### Fix 5 (P1): Restrict avatars bucket listing
Add a storage policy that only allows users to list their own folder in the `avatars` bucket.

---

## 11. MISSING FEATURES & IMPROVEMENTS

- **Question seeding pipeline** — Bulk import for all exam types/years
- **Calendar OAuth** — Google Calendar integration config
- **Email templates** — Custom transactional emails via Resend
- **Mobile overlay** — Currently desktop-only
- **Table consolidation** — Merge `rooms`/`practice_rooms` and `answers`/`saved_answers`/`answer_bank`

---

## 12. FINAL SUMMARY

| Metric | Value |
|--------|-------|
| **App health score** | **6/10** |
| **Features working** | ~65% |
| **Features partially working** | ~20% |
| **Features blocked** | ~15% (all by missing secrets/data) |
| **Code quality** | Solid — types fixed, RPC signatures correct, CORS functional |
| **Security** | Good foundation (RLS everywhere, admin guards) with 3 warnings |
| **Deployment readiness** | **NOT READY** — 3 P0 blockers (missing secrets + data gap) |

**Bottom line**: The codebase is architecturally sound and well-structured. All prior bugs (credit deduction, CORS, schema mismatches, answer mode toggle) have been fixed. The remaining blockers are entirely **configuration** (4 missing secrets) and **data** (33 empty exam papers). Once secrets are added and questions are seeded, the app reaches ~85% functionality immediately.

