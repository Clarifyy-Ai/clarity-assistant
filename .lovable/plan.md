# Clarify AI — Production Readiness Audit

> Scope: Full repo audit (frontend, edge functions, DB, auth, billing, admin, live/overlay, mock-test). Findings are anchored to actual files; no invented features. The "needs implementation" sections are deferred to a follow-up build pass — this plan is the deliverable.

---

## 1. Executive Summary

Clarify AI is a mature React 18 + Vite + TypeScript SPA backed by Supabase (Postgres + 40+ Edge Functions) plus an Electron stealth-overlay shell. Architecture is solid (Zustand stores, typed Supabase client, semantic theme tokens, RLS everywhere, gateway-style `fetchEdge`). However, **multiple advertised features are wired through code but broken at the integration seam** (CORS/payload/RLS/state). The product **looks ~85% built but functions ~55% end-to-end**.

**Headline blockers (matches `docs/current_issues`):**
1. `generate-questions` / mock interview creation — fails (CORS + payload mismatch).
2. Deepgram live transcription — token edge function works, but client wiring fails.
3. Gemini assistant — returns no answers (model routing + response parsing).
4. Overlay — minimize + add/edit broken; window-manager z-index bugs.
5. Mock-test AI question generator — duplicates, missing dedupe.
6. Prep-lab CTAs — disabled despite valid input (form-state bug).
7. Practice rooms — create flow throws (RLS + insert payload).
8. Schedule interview — `schedule-interview` edge function not reached.
9. Resume parse — runs, but parsed fields never hydrate cover-letter/answer prompts.

**Production readiness: 58/100.** Not launch-ready; foundation strong, integration discipline weak.

---

## 2. Project Architecture Overview

```text
clarify-ai/
├─ src/
│  ├─ App.tsx                     # Single createBrowserRouter (~700 lines, all routes here)
│  ├─ main.tsx                    # Bootstraps authStore + sentry + QueryClient
│  ├─ pages/
│  │  ├─ marketing/  (Landing, Pricing, Help, Blog, Terms, Privacy, Shortcuts)
│  │  ├─ auth/       (Login, Signup, VerifyEmail, ResetPassword, AuthCallback)
│  │  ├─ onboarding/ (5 steps + redirect shim)
│  │  └─ app/
│  │     ├─ Dashboard, Analytics, Profile, Notifications, Referrals, InterviewDay
│  │     ├─ live/       (LiveOverlay, LiveRehearsal, MockSession)  ← duplicate of mock/MockSession
│  │     ├─ mock/       (MockInterview, MockWarmup, MockSession)   ← non-test interview flow
│  │     ├─ mock-test/  (Hub, Configure, Session, Results, Analytics, Revision,
│  │     │              MyQuestions, UploadQuestions, ExcelImportTab, ExamPapers)
│  │     ├─ prep/       (PrepLab, StarBuilder, ProjectBuilder, Rephraser,
│  │     │              CodingHints, SystemDesign)
│  │     ├─ sessions/   (CallSessions, History, SessionDetail)
│  │     ├─ documents/  (Documents, ResumeDetail, JDDetail)
│  │     ├─ answer-bank/(AnswerBank, AnswerDetail)
│  │     ├─ interviews/ (Interviews, NewInterview, InterviewDetail)
│  │     ├─ company-research/ (List + Detail)
│  │     ├─ debrief/    (Debrief, DebriefDetail)
│  │     ├─ rooms/      (PracticeRooms, NewRoom, RoomSession)
│  │     ├─ settings/   (~15 sub-pages incl. BYOK, Billing, Privacy, Security…)
│  │     ├─ admin/      (Users, Analytics, Revenue, ModelCosts, FeatureFlags,
│  │     │              QuestionEditor, LiveChat, SeedQuestions)
│  │     └─ guide/, usage/
│  ├─ components/
│  │  ├─ layout/    (AppSidebar, AppTopBar, ProtectedRoute, ErrorBoundary, NetworkBanner, MobileNav, PlanGate)
│  │  ├─ live/      (11 streaming widgets)
│  │  ├─ overlay/   (26 overlay widgets — large surface, see §5.4)
│  │  ├─ billing/, auth/, common/, onboarding/, prep/, session/, ui/ (shadcn)
│  │  └─ admin/     (BlockEditor, BlockRenderer)
│  ├─ hooks/        (~35 — useAuth, useCredits, useDeepgramStream, useLiveCopilot,
│  │                  useRoom, useInterviewScheduler, useResumeContext, etc.)
│  ├─ store/        (12 Zustand slices)
│  ├─ lib/
│  │  ├─ ai/        (Claude/OpenAI/Gemini clients + modelRouter + promptTemplates)
│  │  ├─ audio/, capture/, overlay/, stealth/   (live + electron shell)
│  │  ├─ billing/   (creditsManager, subscriptionManager, middleware)
│  │  ├─ network/   (fetchEdge, apiClient, webSocketManager, networkMonitor)
│  │  ├─ supabase/  (auth, database, storage, realtime)  — wrapper on integrations/supabase
│  │  ├─ security/  (csrf, sanitizer, byokVault)
│  │  ├─ session/   (sessionLifecycle, interviewerPersonality)
│  │  ├─ storage/, validators/, constants/, utils/
│  │  └─ env.ts
│  ├─ integrations/supabase/ (client + generated types)
│  └─ test/         (~12 vitest files — thin coverage)
├─ supabase/functions/  (40 Edge Functions, _shared/{cors,utils,gemini,requirePlan})
├─ electron/  (main.cjs, preload.cjs/.ts — stealth window)
└─ playwright*, vite.config.ts, eslint.config.js (post-fix: warnings-only)
```

**State model:** Zustand + immer; `authStore` boots in `main.tsx` with global loader; queries via TanStack Query (`vendor-query` chunk).
**Routing:** Single `createBrowserRouter` in `src/App.tsx`; auth gating via `ProtectedRoute` (`requireAdmin`/`requireOnboarded`/`requireEmailVerification`). Marketing/auth share `MarketingLayout`; app uses `AppSidebar`+`AppTopBar`.

---

## 3. Route / Page Inventory

**Public (10):** `/`, `/pricing`, `/help`, `/help/:slug`, `/shortcuts`, `/blog`, `/blog/:slug`, `/terms`, `/privacy`, plus marketing 404.
**Auth (6):** `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/auth/callback`.
**Onboarding (1 + 5 shims):** `/onboarding` + step-1…5 redirects (legacy, see §4).
**App — top-level under `/app` (ProtectedRoute):**
- `/app/dashboard`, `/app/interview-day`, `/app/analytics`, `/app/usage`, `/app/profile`, `/app/notifications`, `/app/referrals`, `/app/guide`
- Live: `/app/live`, `/app/live/overlay` (window-popout route)
- Mock interview: `/app/mock`, `/app/mock/warmup`, `/app/mock/session`
- Mock test: `/app/mock-test` + `/configure`, `/results/:testId`, `/my-questions`, `/upload`, `/revision`, `/analytics`, `/papers/:examType`, `/session/:testId` (popout)
- Prep: `/app/prep` + `/star-builder`, `/project-builder`, `/rephraser`, `/coding-hints`, `/system-design`
- Sessions: `/app/sessions`, `/sessions/history`, `/sessions/:id`
- Documents: `/app/documents`, `/documents/resume/:id`, `/documents/jd/:id`
- Answers: `/app/answers`, `/answers/:id`
- Interviews: `/app/interviews`, `/new`, `/:id`
- Companies: `/app/companies`, `/:id`
- Debrief: `/app/debrief`, `/:id`
- Rooms: `/app/rooms`, `/rooms/new`, `/rooms/:roomId/session` (popout)
- Scorecard: `/app/scorecard/:sessionId`
- Settings (15 children): profile, audio, models, billing, notifications, privacy, security, security-config, integrations, byok, appearance, subscription, credits, data, danger, hotkeys, polish
- Admin: `/app/admin` + users, analytics, revenue, model-costs, feature-flags, seed-questions, live-chat, questions, questions/:id
- 404: `*`

Total: **~78 distinct routes.**

---

## 4. Page Connectivity Audit

| Page | Reachable from UI? | Issue |
|---|---|---|
| `/app/live/overlay` | Programmatic only (popout) | Intended — OK |
| `/app/mock/session` & `/app/live/MockSession` | **Two MockSession components** (`pages/app/mock/MockSession.tsx`, `pages/app/live/MockSession.tsx`) | Duplicate; only one route exposed; consolidate. |
| `/app/interview-day` | In sidebar? Not visible in `AppSidebar` audit | **Orphaned** — no nav entry |
| `/app/usage` | Settings → Credits links, but no sidebar entry | Hidden — add to user menu |
| `/app/guide` | Onboarding hand-off only | OK, but unreachable post-onboarding |
| `/app/scorecard/:sessionId` | Only opened from Debrief; no breadcrumb back | Add back-link |
| `/onboarding/step-N` | Redirect-only shims | OK (legacy) |
| `/app/answers/:id` | No nav from list page after recent refactor | Verify list row click handler |
| `/app/settings/polish` | Not in settings nav menu | **Orphaned** |
| `/app/settings/security-config` vs `/security` | Two near-identical screens | Consolidate |
| `/app/admin/seed-questions` | Sidebar OK | OK |
| `/app/rooms/:roomId/session` | Opened only after create; create fails (issue #7) | Blocked by upstream bug |
| `/app/mock-test/session/:testId` | Configure → start fails when 0 questions selected | Add empty-state guard |
| Marketing footer | Missing links to `/shortcuts`, `/blog` on some pages | Minor |

**Dead CTAs / disabled buttons:**
- `prep/PrepLab.tsx` — "Generate" button stays `disabled` when textarea has content (issue #6).
- `rooms/NewRoom.tsx` — Create button calls `useRoom().createRoom()` but RLS rejects (issue #7).
- `interviews/NewInterview.tsx` — Schedule button posts to `schedule-interview` edge fn; 502 (issue #8).
- Overlay `OverlayToolbar.tsx` — Minimize icon has no `onClick` handler in current build (issue #4).

---

## 5. Feature Completeness Audit

Legend: ✅ Full · 🟡 Partial · 🔴 Broken · ⚫ Mock-only · ⚪ Missing · 🟠 Disconnected

### 5.1 Auth & Authorization
- Signup / Login / Magic link / OAuth (`src/pages/auth/*`, `lib/supabase/auth.ts`) — ✅
- Email verification gate (`ProtectedRoute requireEmailVerification`) — ✅
- Password reset flow — ✅
- Role-based access (`user_roles` + `has_role` RPC + `isAdmin` in store) — ✅
- Account deletion (`delete-account` edge fn + `SettingsDanger`) — 🟡 needs confirmation modal hardening

### 5.2 Onboarding (5 steps)
- Role/Experience/Preferences/Audio/Resume — ✅ UI
- Resume parsing during step-5 fires `parse-resume` but **parsed fields are stored on `resumes`/`resume_versions` only** — 🟠 not propagated to `profiles.target_role`, `parsed_skills` not hydrated into prompts (issue #9).

### 5.3 Dashboard / Analytics
- Dashboard widgets (`Dashboard.tsx`) — ✅ wired to `sessions`, `profiles`
- Analytics page — 🟡 some panels reference `request_metrics` admin-only; user view shows empty states only for new users (OK)
- Streak/XP — ✅ trigger `update_user_streak` on session complete

### 5.4 Stealth Overlay (Electron + DocumentPiP)
- IPC bridge (`electron/preload.cjs`, `lib/stealth/electronBridge.ts`) — ✅
- Mouse guard / capture evasion / panic — ✅
- **Minimize / restore** — 🔴 (issue #4) — `OverlayToolbar` button missing handler; `lib/overlay/windowManager.ts.minimize()` exists but not wired
- **Add/edit overlay panels** — 🔴 — `OverlaySettings.tsx` lists panels but mutation isn't persisted to `overlayStore`
- z-index drift across panels — 🟡 (`IndexManager` + `zIndexManager` duplicated — consolidate)
- 26 overlay components — likely consolidation candidates; visually present but several panels are stub-only (`OverlayAuditPanel`, `OverlayQuickStart`)

### 5.5 Live Session (Deepgram + AI copilot)
- `useDeepgramStream` + `deepgram-token` edge fn — 🔴 token mints OK; **WS connect uses bare key path in client; missing `Authorization: Token <temp>` header subprotocol** (issue #2)
- `useLiveCopilot` → `generate-answer` / `generate-hint` — 🔴 Gemini path: response parser expects `choices[0].message.content` (OpenAI shape) but Gemini returns `candidates[0].content.parts[0].text` (issue #3)
- `modelRouter` selects model from `profiles.preferred_model`; default ai_model enum is `'gpt-4o'` while project memory mandates `gemini-2.0-flash` — **drift**
- Coding-problem capture / screenshot — ✅
- Filler-word / WPM / sentiment — ✅ (Deepgram-dependent → blocked by #2)
- Network monitor, panic — ✅

### 5.6 Mock Interview (non-test, behavioral)
- `MockInterview.tsx` → calls `generate-questions` — 🔴 (issue #1):
  - Frontend sends `{ role, company, type }`; edge fn expects `{ topic, count, exam_type }`. Payload shape mismatch.
  - CORS preflight occasionally 502 due to throw-on-boot in older `_shared/utils.ts` (already partially fixed).
- Warmup → Session pipeline — 🟡 (depends on above)
- Recording + scoring — ✅ when questions exist

### 5.7 Mock Test (JEE/NEET — primary product)
- Hub, Configure (3-step wizard), Session, Results, Analytics, Revision — ✅ shell
- Excel import (`ExcelImportTab.tsx`, `UploadQuestions.tsx`) — ✅
- AI question generator (`generate-practice-questions`) — 🟡 (issue #5):
  - No dedupe vs existing `questions` row hash → duplicates
  - Difficulty normalization OK (per memory)
- Timer initializes via `DRAFT` status — ✅
- Free-plan 10/month limit — ✅
- `select-test-questions` — ✅
- `submit-test` + `analyze-test-performance` — ✅
- Spaced-revision (`revision_list`) — ✅

### 5.8 Prep Lab
- `StarBuilder`, `ProjectBuilder`, `Rephraser`, `CodingHints`, `SystemDesign` — 🟡
- Common bug (issue #6): `PrepLab.tsx` index card "Generate" CTA bound to `disabled={!prompt || loading}` but reads `prompt` from a stale closure (likely `useState` not the controlled textarea ref). Each sub-tool replicates the pattern.

### 5.9 Practice Rooms
- `PracticeRooms` list + `NewRoom` create + `RoomSession` — 🔴 (issue #7)
- DB has both `rooms` and `practice_rooms` tables (legacy + new). `useRoom.ts` inserts into `rooms` but RLS policy expects `host_id = auth.uid()`; insert payload sets `host_id: user?.id` which can be `undefined` if auth not hydrated.
- Room participants insert race: must insert host into `room_participants` immediately or `room_chat` RLS fails.

### 5.10 Interview Scheduling & Tracking
- `interviews` table + `scheduled_interviews` + `interview_rounds` + Google calendar sync — 🟡
- `NewInterview` → `schedule-interview` edge fn — 🔴 (issue #8) — fn name resolves but request body is missing `calendar_event_id`/`scheduled_at`; calendar OAuth tokens may not be present (table empty for most users), fn rejects with 400.
- `sync-calendar` / `disconnect-calendar` — ✅
- `useInterviewScheduler` — 🟡 optimistic update without rollback on error

### 5.11 Documents / Resume Intelligence (issue #9)
- Upload to `resumes` bucket — ✅ (private bucket; service-role download path correct per memory)
- `parse-resume` (Gemini → Claude → OCR fallback) — ✅ writes `resume_versions.parsed_data`
- **Not propagated** to:
  - `documents.parsed_skills`, `parsed_experience`, `parsed_education`
  - `profiles.target_role`, `interview_strengths`
  - Live answer prompts (`generate-answer` does not read resume context envelope — see `contextEnvelopeBuilder.ts`, it queries but only when `useResumeContext` is called explicitly)
- Cover-letter template UI — 🟡 exists in `documents/JDDetail.tsx` but doesn't pre-fill from latest resume version.

### 5.12 Answer Bank
- CRUD on `answers` + `answer_bank` (two tables, partial overlap) — 🟡 consolidate
- "Polish" via `polish-star-section` — ✅
- Favorites / tags — ✅

### 5.13 Company Research
- `company-research` edge fn — ✅
- Storage in `company_research.raw_data` (jsonb) — ✅
- Linked to interview detail — 🟡 UI shows but recommended questions aren't fed to live copilot prompt

### 5.14 Billing
- Stripe checkout/portal/webhook — ✅
- Plan gating (`PlanGate` + `FEATURE_PLAN_GATES`) — ✅
- Credit deduction (`deduct_credits` RPC + middleware) — ✅
- BYOK (3 providers) — 🟡 vault store + `validate-api-key` edge fn; admin lacks usage analytics page
- Cancellation/resume — ✅

### 5.15 Admin Console
- Users / Analytics / Revenue / ModelCosts / FeatureFlags / SeedQuestions / LiveChat / Questions editor — ✅ shells, mostly functional
- `LiveChat` thread-bumping trigger DB-side — ✅
- Audit log — ✅
- Bulk operations (`bulk_update_users` RPC) — ✅

### 5.16 Settings (15 sub-pages)
- All present; some are placeholders (`SettingsPolish`, `SettingsHotkeys` are thin)
- "Security config" vs "Security" duplicate — consolidate

### 5.17 Notifications & Reminders
- In-app notifications table + realtime — ✅
- `send-email` edge fn — 🟡 (used only by Stripe webhook); no scheduled practice reminders cron

### 5.18 Cross-cutting
- Loading skeletons — 🟡 inconsistent (Dashboard ✅, Documents/Interviews ✅, mock-test/Configure missing)
- Empty states — ✅ most pages
- Error boundaries — ✅ root + page-level
- Toasts (`sonner`) — ✅
- SEO (`usePageMeta`) — 🟡 only marketing pages; app pages missing
- Mobile responsive — 🟡 sidebar collapses; overlay popouts assume desktop
- A11y — 🟡 unaudited; many icon-buttons lack `aria-label`
- i18n — ⚪ not implemented (profiles store `preferred_language` but no i18n provider)
- Tests — 🟡 ~12 vitest, no e2e despite playwright config

---

## 6. File-by-File Audit (Critical Files Only)

| File | Status | Issue |
|---|---|---|
| `src/App.tsx` (797 ln) | 🟡 | Single mega-router; consider split into per-area route files |
| `src/store/authStore.ts` | ✅ | Stable selectors per memory |
| `src/components/layout/ProtectedRoute.tsx` | ✅ | Blank-screen pattern correct |
| `src/components/layout/AppSidebar.tsx` | 🟡 | Missing entries for `/app/interview-day`, `/app/usage`, `/app/settings/polish` |
| `src/pages/app/mock/MockSession.tsx` | 🟡 | 23 lint warnings; duplicate with `pages/app/live/MockSession.tsx` |
| `src/pages/app/live/MockSession.tsx` | 🟠 | Duplicate — delete or merge |
| `src/hooks/useDeepgramStream.ts` | 🔴 | Doesn't pass token via subprotocol header (Deepgram WS requirement) |
| `src/hooks/useLiveCopilot.ts` | 🔴 | Response parser hardcoded to OpenAI shape |
| `src/lib/ai/geminiClient.ts` | 🟡 | OK; consumer must parse correctly |
| `src/lib/ai/modelRouter.ts` | 🟡 | Defaults drift from memory rule (`gemini-2.0-flash`) |
| `src/hooks/useRoom.ts` | 🔴 | Insert payload missing host_id guard; no participant insert |
| `src/hooks/useInterviewScheduler.ts` | 🔴 | Missing required fields in POST |
| `src/hooks/useDocuments.ts` | 🟡 | 18 lint warnings, leaks promises |
| `src/hooks/useScorecard.ts` | 🟡 | 14 lint warnings |
| `src/hooks/useResumeContext.ts` | 🟡 | Only called from live; not on cover-letter/JD pages |
| `src/lib/ai/contextEnvelopeBuilder.ts` | 🟡 | Builds envelope but not always invoked before AI calls |
| `src/pages/app/prep/PrepLab.tsx` | 🔴 | Disabled-state regression on generate CTAs |
| `src/pages/app/rooms/NewRoom.tsx` | 🔴 | Surfaces RLS error as generic toast |
| `src/pages/app/interviews/NewInterview.tsx` | 🔴 | Schedule submit shape mismatch |
| `src/pages/app/mock/MockInterview.tsx` | 🔴 | Payload mismatch with `generate-questions` |
| `src/components/overlay/OverlayToolbar.tsx` | 🔴 | Minimize click handler missing |
| `src/components/overlay/OverlaySettings.tsx` | 🔴 | Add/edit mutations not persisted |
| `src/lib/overlay/windowManager.ts` | 🟡 | `minimize()` exists, untested |
| `src/lib/overlay/IndexManager.ts` + `zIndexManager.ts` | 🟡 | Two managers — consolidate |
| `supabase/functions/generate-questions/index.ts` | 🔴 | Strict input schema; needs to accept legacy interview payload OR client must adapt |
| `supabase/functions/generate-practice-questions/index.ts` | 🟡 | Add dedupe on `(question_text, subject)` hash before insert |
| `supabase/functions/parse-resume/index.ts` | ✅ | Multi-layer fallback works; downstream propagation missing |
| `supabase/functions/parse-question-pdf/index.ts` | 🟡 | Gemini prompt returns empty array (no actual extraction logic in prompt body — see file) |
| `supabase/functions/deepgram-token/index.ts` | ✅ | Mints 60s TTL temp key |
| `supabase/functions/schedule-interview/index.ts` | 🔴 | Required fields not validated → returns 400 silently |
| `supabase/functions/_shared/utils.ts` | ✅ | Post-fix (no boot throws) |
| `supabase/functions/_shared/cors.ts` | ✅ | BYOK headers allowed |
| `eslint.config.js` | ✅ | Post-cleanup: 0 errors, 557 warnings |
| `vite.config.ts` | ✅ | Sourcemaps off in prod, hardened headers |
| `tsconfig.json` | 🟡 | `strict:false`, `noImplicitAny:false` — accept for now |
| `playwright.config.ts` | 🟠 | Excluded from lint; no e2e written |

**Dead / consolidate candidates:**
- `src/pages/app/live/MockSession.tsx` (duplicate)
- `practice_rooms` table (legacy vs `rooms`)
- `answer_bank` vs `answers` (overlap)
- `IndexManager.ts` vs `zIndexManager.ts`
- `SettingsSecurity` vs `SettingsSecurityConfig`

---

## 7. Backend / API / Database Audit

**Edge functions (40):** all return JSON, use central CORS, most use `requireAuth` + `deductCredits`. Risks:
- `parse-question-pdf` prompt is empty (`Return valid JSON: { "questions": [] }`) — won't actually extract.
- `generate-questions` schema-strict; no backward-compat for mock interview client.
- `schedule-interview` validation thin.
- `analytics-dashboard` admin-gated server-side ✅.
- `process-stripe-webhook` + `stripe-webhook` — two files, confirm only one is set as Stripe endpoint.

**Database (50+ tables):**
- RLS enabled on all listed tables ✅
- `has_role` SECURITY DEFINER pattern correct ✅
- `delete_expired_session_data` scheduled-job ready ✅
- **Mismatch risk:** UI references `interview_sessions` table per old memory but schema shows `sessions`. AI features point at `sessions` (per memory).
- Indexes: not visible in this audit; recommend adding btree on `sessions(user_id, created_at)`, `questions(subject, topic, difficulty)`, `mock_tests(user_id, status)`.
- `request_metrics` table fills aggressively — needs retention job.

**Storage buckets:** all 5 present (resumes/avatars/documents/exports/question-images). Private buckets accessed via service-role per memory ✅.

---

## 8. UX / Design Audit
- Compact mobile-first theme consistent in app shell ✅
- Onboarding step-1 → step-5 → guide hand-off works; **no "skip resume" path** when parse fails (issue #9 cascade)
- Mock-test Configure: 3-step wizard solid; missing live counter of selected questions before "Start"
- Live session: side-panel reflow on small screens broken
- Overlay UI: density too high; minimize broken (#4)
- Toasts vs modal confusion in delete actions
- Empty states good in Dashboard/Documents; missing in Prep tools, Rooms list
- Admin tables lack column filtering on Users (only search)
- Typography/spacing — consistent via tokens

---

## 9. Security / Performance / Accessibility
- **Secrets:** all required envs present (GEMINI/DEEPGRAM/OCR/SUPABASE_SERVICE_ROLE/STRIPE-via webhook fns) ✅
- **RLS:** comprehensive ✅
- **Admin column protection trigger** (`protect_admin_column`) ✅
- **CSRF** helper present; not all mutating client→edge calls use it
- **No client-side admin checks** ✅ (uses RPC)
- **No service_role key** in frontend ✅
- **Bundle:** manual chunks defined (`vendor-*`) ✅; size acceptable (~700KB initial est.)
- **Sentry:** conditional on env ✅
- **Perf:** Heavy live page mounts 26 overlay components even if hidden — code-split overlay route
- **A11y:** Icon-only buttons in sidebar/topbar/overlay frequently lack `aria-label`; focus rings preserved via shadcn; no keyboard trap audit yet
- **SEO:** marketing only; app routes excluded via robots.txt (per memory) ✅

---

## 10. Production Readiness Scorecard (0–100)

| Area | Score |
|---|---|
| Architecture | 80 |
| Code quality | 65 |
| Route connectivity | 70 |
| Feature completeness | 60 |
| Backend integration | 55 |
| Security | 82 |
| Performance | 72 |
| Accessibility | 50 |
| Responsiveness | 65 |
| Test coverage | 25 |
| Error handling | 65 |
| Observability | 60 |
| Maintainability | 70 |
| Deployment readiness | 70 |
| **Overall** | **58** |

**Top 10 launch blockers:** issues #1–#9 (from `docs/current_issues`) + (#10) `parse-question-pdf` empty prompt.
**Top 10 quick wins:** add sidebar entries (Interview-Day, Usage); delete duplicate `live/MockSession.tsx`; add `aria-label` to icon buttons; fix PrepLab disabled state; add empty-question guard in mock-test start; consolidate z-index managers; persist overlay settings; add resume→profile propagation toggle; add scorecard back-link; index `sessions(user_id, created_at)`.
**Top 10 risk issues:** Gemini parser drift; Deepgram WS auth; CORS regression on edge fns; RLS race on room create; calendar token absence; duplicate stripe-webhook handlers; missing dedupe causing question pollution; no e2e tests; admin bulk ops without dry-run; data-retention job not scheduled.

---

## 11. Gap Analysis vs Vision (Ethical AI Career Coach)

| Module | Status | Gap | Priority | Effort |
|---|---|---|---|---|
| Auth + roles | ✅ | — | — | — |
| Onboarding | 🟡 | Resume hand-off | P0 | S |
| Dashboard | ✅ | Personalized recs from skills gap | P2 | M |
| Resume IQ | 🔴 | Propagation to prompts + cover-letter | P0 | M |
| Behavioral interview | 🔴 | Question gen broken | P0 | S |
| Technical/coding prep | 🟡 | CodingHints OK, no in-browser runner | P2 | L |
| Domain packs / company packs | 🟡 | Company research not fed to live | P1 | S |
| Mock test (JEE/NEET) | 🟡 | Dedupe + papers UI polish | P1 | S |
| Live copilot | 🔴 | Deepgram + Gemini broken | P0 | M |
| Ethical guidance | ✅ | — | — | — |
| Analytics | 🟡 | More user-facing insights | P2 | M |
| Application tracker | 🟡 | Scheduling broken | P0 | S |
| Notifications/reminders | ⚪ | No cron reminders | P2 | M |
| Billing | ✅ | — | — | — |
| Admin | ✅ | Add BYOK usage view | P3 | S |
| Settings | 🟡 | Consolidate dup pages | P3 | S |
| i18n | ⚪ | Provider + dictionaries | P3 | L |
| A11y/SEO | 🟡 | aria + app-route meta | P2 | M |
| Tests/e2e | 🟡 | Playwright suite missing | P1 | L |

---

## 12. Missing / Partial / Disconnected Features Matrix

| Feature | Status | Frontend | Backend | DB | Missing |
|---|---|---|---|---|---|
| Mock interview create | 🔴 | `mock/MockInterview.tsx` | `generate-questions` | `sessions`,`questions` | payload contract |
| Deepgram live | 🔴 | `hooks/useDeepgramStream.ts` | `deepgram-token` | — | WS subprotocol auth |
| Gemini assistant | 🔴 | `hooks/useLiveCopilot.ts`, `lib/ai/modelRouter.ts` | `generate-answer`,`generate-hint` | — | response shape parser |
| Overlay minimize/edit | 🔴 | `components/overlay/Overlay{Toolbar,Settings}.tsx` | — | — | handlers + store mutation |
| Practice question gen dedupe | 🟡 | `mock-test/Upload*` | `generate-practice-questions` | `questions` | hash check + filter |
| Prep Lab CTAs | 🔴 | `prep/PrepLab.tsx` (+ sub-tools) | `prep-tool`,`polish-star-section` | — | controlled input state |
| Practice rooms create | 🔴 | `rooms/NewRoom.tsx`,`hooks/useRoom.ts` | — | `rooms`,`room_participants` | host_id guard + participant insert |
| Schedule interview | 🔴 | `interviews/NewInterview.tsx`,`useInterviewScheduler` | `schedule-interview`,`sync-calendar` | `interviews`,`scheduled_interviews` | required fields + fallback when no calendar |
| Resume → prompts | 🟠 | `hooks/useResumeContext.ts`,`contextEnvelopeBuilder` | `generate-answer` | `resumes`,`resume_versions`,`profiles` | always include in envelope |
| Parse-question-pdf | 🔴 | `mock-test/UploadQuestions` | `parse-question-pdf` | `questions` | real extraction prompt |
| Reminders | ⚪ | — | `send-email` | `notifications` | scheduler |
| App-route SEO | 🟡 | `usePageMeta` | — | — | call from app pages |
| A11y | 🟡 | many icon buttons | — | — | aria-label |
| E2E tests | ⚪ | `playwright.config.ts` | — | — | suite |

---

## 13. Page Connection & Flow Repair Plan

1. **AppSidebar.tsx** — add entries: Interview Day, Usage; nest Settings/Polish under Settings menu.
2. **MockSession dedupe** — delete `src/pages/app/live/MockSession.tsx`; keep `pages/app/mock/MockSession.tsx`; update `App.tsx` import.
3. **Scorecard back-link** — add breadcrumb in `pages/Scorecard.tsx`.
4. **Answer list → detail** — verify row click navigates to `/app/answers/:id`.
5. **Rooms** — after fix, surface "Join via code" CTA on `PracticeRooms` index.
6. **Marketing footer** — add `/shortcuts`, `/blog` links.
7. **Settings consolidation** — merge `security` + `security-config` into one route; redirect old.
8. **Onboarding fallback** — add "Skip resume" path when parse fails.

---

## 14. Exact Files to Edit (P0 set, ordered for safe execution)

> Each entry: **Issue → Root cause → Files → Change → Risk → Verify**. Component-by-component per user's guardrails. Implementation is held until user picks a target.

### F1 — Gemini answers empty (issue #3)
- Root: `useLiveCopilot.ts` parses OpenAI shape; `modelRouter` defaults to `gpt-4o` (memory mandates `gemini-2.0-flash`).
- Edit: `src/hooks/useLiveCopilot.ts`, `src/lib/ai/modelRouter.ts`, `src/lib/ai/geminiClient.ts` (export normalizer), `supabase/functions/generate-answer/index.ts` (return uniform `{ text }`).
- Change: server normalizes to `{ text, usage }`; client reads `text`. Default model `gemini-2.0-flash`.
- Risk: M. Verify: live page → mock prompt → answer streams.

### F2 — Deepgram WS auth (issue #2)
- Root: WS opened with token in querystring rather than subprotocol header.
- Edit: `src/hooks/useDeepgramStream.ts`, `src/lib/audio/*` deepgram socket helper.
- Change: open WS with `['token', tempKey]` subprotocols; reconnect/backoff preserved.
- Risk: M. Verify: live page shows "Listening"; transcripts arrive.

### F3 — Mock interview generate-questions contract (issue #1)
- Root: payload shape mismatch.
- Edit: `src/pages/app/mock/MockInterview.tsx`, `src/lib/api/ai.ts`, `supabase/functions/generate-questions/index.ts`.
- Change: align to `{ type, role, company, count }`; edge fn validates with zod.
- Risk: M. Verify: mock session starts; questions render.

### F4 — Practice rooms create (issue #7)
- Root: host_id undef + missing participant insert.
- Edit: `src/hooks/useRoom.ts`, `src/pages/app/rooms/NewRoom.tsx`.
- Change: guard `requireUserId()`; insert into `room_participants` after room create; surface RLS errors.
- Risk: L. Verify: create → redirect to `/rooms/:id/session`.

### F5 — Schedule interview (issue #8)
- Root: missing required fields; no fallback when calendar not connected.
- Edit: `src/pages/app/interviews/NewInterview.tsx`, `src/hooks/useInterviewScheduler.ts`, `supabase/functions/schedule-interview/index.ts`.
- Change: optional calendar; persist to `interviews` always; create rounds; return id.
- Risk: M. Verify: schedule without calendar; row appears in list.

### F6 — Overlay minimize + add/edit (issue #4)
- Root: missing handler + non-persisted settings.
- Edit: `src/components/overlay/OverlayToolbar.tsx`, `OverlaySettings.tsx`, `src/store/overlayStore.ts`, `src/lib/overlay/windowManager.ts`.
- Change: wire `onClick={minimize}`; persist panel config via store + IPC.
- Risk: L. Verify: minimize toggles; reorder persists across reload.

### F7 — Prep Lab CTAs (issue #6)
- Root: stale state in disabled prop.
- Edit: `src/pages/app/prep/PrepLab.tsx` and 5 sub-tools.
- Change: controlled inputs; `disabled` derived from current state; add loading guard.
- Risk: L. Verify: typing enables; submit hits edge fn.

### F8 — Resume propagation (issue #9)
- Root: parsed data not consumed.
- Edit: `src/hooks/useResumeContext.ts`, `src/lib/ai/contextEnvelopeBuilder.ts`, `src/pages/app/documents/ResumeDetail.tsx` (cover-letter pre-fill), `supabase/functions/parse-resume/index.ts` (also upsert into `documents.parsed_*`), `supabase/functions/generate-answer/index.ts` (read envelope).
- Change: write parsed JSON into `documents`/`profiles`; always include in envelope.
- Risk: M. Verify: upload resume → cover-letter fields populate; live answer references resume.

### F9 — Mock-test question dedupe (issue #5)
- Root: no uniqueness check at gen time.
- Edit: `supabase/functions/generate-practice-questions/index.ts`, optional migration to add `unique(subject, md5(question_text))`.
- Change: dedupe in-memory + DB constraint; skip on conflict.
- Risk: L–M (constraint). Verify: re-running gen yields zero duplicates.

### F10 — parse-question-pdf real extraction
- Edit: `supabase/functions/parse-question-pdf/index.ts`.
- Change: replace empty prompt with structured MCQ extraction prompt; validate via zod.
- Risk: M. Verify: upload sample PDF → questions populated.

---

## 15. Priority-Based Roadmap (Phased)

**Phase 1 — Critical blockers (1 week)**
F1, F2, F3, F4, F5, F6, F7, F8, F9, F10 (above).

**Phase 2 — Core functionality (1 week)**
- Sidebar nav fixes + dedupe MockSession + scorecard back-link
- Resume→profile propagation toggle in `SettingsProfile`
- A11y `aria-label` sweep on icon buttons (component-by-component)
- App-page `usePageMeta` calls
- Stripe-webhook consolidation (verify single endpoint)
- DB indexes (sessions, questions, mock_tests)
- `request_metrics` retention cron

**Phase 3 — UX & polish (3–5 days)**
- Settings consolidation (security/security-config)
- Loading skeletons for mock-test/Configure, Prep tools
- Mobile responsive pass on live + overlay
- Replace `IndexManager`/`zIndexManager` duplication
- Empty states for Rooms, PrepLab sub-tools

**Phase 4 — Advanced**
- Playwright e2e (auth, mock-test happy path, billing checkout)
- i18n provider + initial en/hi dictionaries
- Reminders cron + email templates
- Admin BYOK usage analytics page
- In-browser coding runner

---

## 16. QA / Test Plan

**Unit (vitest):** `useDeepgramStream`, `useLiveCopilot`, `modelRouter`, `useRoom`, `useInterviewScheduler`, `creditsManager`, `contextEnvelopeBuilder`, dedupe helper.
**Integration (vitest + msw):** `generate-questions`, `generate-answer` parsers; resume envelope; mock-test submit→analyze.
**E2E (playwright):**
1. Sign-up → verify email → onboarding → dashboard.
2. Upload resume → cover-letter pre-fill → generate STAR.
3. Configure mock test (10 q) → submit → results.
4. Live session: token mint → transcript line → AI hint.
5. Create room → second user joins → end session.
6. Schedule interview (no calendar) → appears in list.
7. Billing: free → upgrade → portal → cancel.
8. Admin: bulk credit add → audit log row.

**Regression checklist:** RLS denials surface as toasts, not crashes; CORS preflight 204; no `service_role` leakage; offline banner shows on network drop.

---

## 17. Final Conclusion

The codebase is **well-architected but integration-leaky**. Foundation (auth, RLS, edge function shape, theming, state) is production-grade. What blocks launch is a tight cluster of **10 wire-up bugs**, all listed and fixable within one focused week. After Phase 1+2 the product crosses 80/100; Phase 3+4 bring polish and resilience.

**Recommended order of execution per user's guardrails:** one component family per turn — start with F1 (Gemini answers) and F2 (Deepgram) since they unblock the live pipeline that everything else demonstrates against. Each fix isolated; "do not modify existing working features" applies — no shared refactors until P0 is green.

> Awaiting your go-ahead on which file family to fix first (F1 recommended).
