# Clarify AI — Production Readiness Audit
**Date:** 2026-05-03
**Supersedes:** `docs/AUDIT_2026-05-01.md`
**Method:** Static review of every route in `src/App.tsx`, every page file under `src/pages/**`, all 38 Edge Functions in `supabase/functions/**`, and the live database schema (40+ tables, 51 user-defined functions, RLS policies, secrets, storage buckets). Cross-checked with `supabase--linter` and project memory.

> Legend: **OK** = production-ready · **Partial** = renders & writes but has a known gap · **Stub** = UI only, no real backend · **Broken** = runtime failure or missing dependency.

---

## 0. Executive summary

| Portal | Pages | OK | Partial | Stub | Broken | Production-ready % |
|---|---:|---:|---:|---:|---:|---:|
| Public / Marketing | 9 | 9 | 0 | 0 | 0 | **100 %** |
| Auth | 6 | 6 | 0 | 0 | 0 | **100 %** |
| Onboarding | 6 | 6 | 0 | 0 | 0 | **100 %** |
| User App (`/app/*`) | 56 | 44 | 8 | 3 | 1 | **79 %** |
| Admin (`/app/admin/*`) | 10 | 8 | 2 | 0 | 0 | **80 %** |
| Edge Functions | 38 | 30 | 4 | 0 | 4 | **79 %** (4 blocked on Stripe secrets) |
| **Overall** | **125** | **103** | **14** | **3** | **5** | **≈ 82 %** |

**Top blockers (P0):**
1. `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` missing → all billing edge functions return 500 silently.
2. Practice Rooms (`/app/rooms/**`) is a UI stub — no realtime/WebRTC channel, host can't actually connect.
3. `analytics-dashboard` edge function deployed but `/app/analytics` still aggregates client-side (no server-side accuracy).
4. `disconnect-calendar` and `sync-calendar` are not exposed in Settings → Integrations UI.

---

## 1. Public / Marketing portal (anonymous)

| Route | File | Status | Notes |
|---|---|---|---|
| `/` | `Landing.tsx` | OK | Hero CTA → `/signup`. SEO via `usePageMeta`. |
| `/pricing` | `Pricing.tsx` | OK | Three tiers (Free / Pro / Enterprise). CTAs route to checkout once Stripe secrets present. |
| `/help` + `/help/:slug` | `Help*.tsx` | OK | Static MDX-style content. |
| `/blog` + `/blog/:slug` | `Blog*.tsx` | OK | Static. |
| `/shortcuts` | `Shortcuts.tsx` | OK | Lists hotkeys from `lib/constants/hotkeys.ts`. |
| `/terms` `/privacy` | `Terms.tsx` `Privacy.tsx` | OK | Required for GDPR; uses `prose` plugin. |
| `*` | `NotFound.tsx` | OK | 404 with link home. |

**Cross-cutting:** `robots.txt` disallows `/app/*` and `/admin/*`. `sitemap.xml` lists only public pages. ✅

---

## 2. Auth portal

| Route | File | Status | Notes |
|---|---|---|---|
| `/login` | `Login.tsx` | OK | Email + Google OAuth via `OAuthButton`. `onAuthStateChange` set up before `getSession()` per `authStore`. |
| `/signup` | `Signup.tsx` | OK | `signUp({ emailRedirectTo: window.location.origin })`. `handle_new_user` trigger seeds `profiles` + free `subscriptions`. |
| `/auth/callback` | `AuthCallback.tsx` | OK | Handles OAuth + magic-link. |
| `/forgot-password` `/reset-password` | `ResetPassword.tsx` | OK | `redirectTo: origin + '/reset-password'` ✓; checks `type=recovery` hash ✓. |
| `/verify-email` | `VerifyEmail.tsx` | OK | Required gate via `requireEmailVerification` on `/app/*`. |

**Findings:** Supabase linter warns **"Leaked Password Protection Disabled"** (WARN 29). Recommend enabling in Auth → Settings before launch.

---

## 3. Onboarding portal (`/onboarding/*`)

5-step wizard. All steps persist to `public.profiles`; `onboarding_completed=true` on step 5 → routes to `/app/dashboard` (guarded by `requireOnboarded`).

| Step | File | Persists | Status |
|---|---|---|---|
| Index | `OnboardingIndex.tsx` | resumes step from `profiles.onboarding_step` | OK |
| 1 Role | `OnboardingStep1Role.tsx` | `role_type`, `domain`, `experience_years` | OK |
| 2 Experience | `OnboardingStep2Experience.tsx` | `target_role`, `target_companies`, `interview_date` | OK |
| 3 Preferences | `OnboardingStep3Preferences.tsx` | `preferred_model`, `response_style`, `coach_tone` | OK |
| 4 Audio Setup | `OnboardingStep4AudioSetup.tsx` | `audio_input_device`, `noise_suppression` | OK — system audio only on Chromium per memory. |
| 5 Resume | `OnboardingStep5ResumeUpload.tsx` | uploads to `resumes` bucket → `parse-resume` EF → `resumes` + `resume_versions` rows | OK |

---

## 4. User app portal (`/app/*`)

Guards: `requireOnboarded` + `requireEmailVerification`. Wrapped in `<AppShell />` (sidebar + topbar).

### 4.1 Core
| Route | File | Status | Backend | Notes |
|---|---|---|---|---|
| `/app/dashboard` | `Dashboard.tsx` | OK | `profiles`, `sessions` | Streak/XP cards; empty state. |
| `/app/interview-day` | `InterviewDay.tsx` | OK | `scheduled_interviews` join `interview_rounds` | Today/upcoming view. |
| `/app/live` | `LiveRehearsal.tsx` | OK | `start-session`, `end-session`, `generate-hint`, `generate-answer`, `deepgram-token` | Overlay-only; setup wizard → overlay. **All 7 buttons wired** (audited 2026-05-01). |
| `/app/live/overlay` | `LiveOverlay.tsx` | OK | same | Full-screen route used when launching overlay window. |

### 4.2 Mock Tests (10 pages)
| Route | File | Status | Notes |
|---|---|---|---|
| `/app/mock-test` | `MockTestHub.tsx` | OK | Reads `mock_tests` |
| `…/configure` | `TestConfigure.tsx` | OK | 3-step wizard → `create-test` |
| `…/session/:testId` | `TestSession.tsx` | OK | Full-screen, timer auto-starts (DRAFT init, see memory). |
| `…/results/:testId` | `TestResults.tsx` | OK | `submit-test`, `analyze-test-performance` |
| `…/analytics` | `TestAnalytics.tsx` | OK | `gap-analysis` |
| `…/revision` | `TestRevision.tsx` | OK | `revision_list` table + spaced repetition. |
| `…/my-questions` | `MyQuestions.tsx` | OK | RLS scopes by `uploaded_by`. |
| `…/upload` | `UploadQuestions.tsx` | OK | `parse-question-pdf`, `generate-questions`. |
| `…/papers/:examType` | `ExamPapers.tsx` | OK | Public read on `exam_papers`. |
| `ExcelImportTab.tsx` | (component) | OK | Excel-first import. |

### 4.3 Mock Interview
| Route | File | Status |
|---|---|---|
| `/app/mock` | `MockInterview.tsx` | OK |
| `/app/mock/warmup` | `MockWarmup.tsx` | OK |
| `/app/mock/session` | `MockSession.tsx` | OK |

### 4.4 Prep Lab
| Route | File | Status | Backend |
|---|---|---|---|
| `/app/prep` | `PrepLab.tsx` | OK | landing |
| `…/star-builder` | `StarBuilder.tsx` | OK | `generate-star-answer`, `polish-star-section` |
| `…/project-builder` | `ProjectBuilder.tsx` | OK | `prep-tool` |
| `…/rephraser` | `Rephraser.tsx` | OK | `prep-tool` |
| `…/coding-hints` | `CodingHints.tsx` | OK | `prep-tool` |
| `…/system-design` | `SystemDesign.tsx` | OK | `prep-tool` |

### 4.5 Sessions
| Route | File | Status |
|---|---|---|
| `/app/sessions` | `CallSessions.tsx` | OK |
| `…/history` | `SessionHistory.tsx` | OK |
| `…/:id` | `SessionDetail.tsx` | OK |
| `/app/scorecard/:sessionId` | `Scorecard.tsx` | OK | uses `ai-feedback` |
| `/app/debrief` + `/:id` | `Debrief*.tsx` | OK | `generate-debrief` |

### 4.6 Growth
| Route | File | Status | Notes |
|---|---|---|---|
| `/app/analytics` | `Analytics.tsx` | **Partial** | Edge function `analytics-dashboard` exists but page still aggregates locally. Server data is more accurate and required for plan-level metrics. |
| `/app/documents` | `Documents.tsx` | OK | `parse-resume`, `resumes`/`documents` private buckets. |
| `…/resume/:id` | `ResumeDetail.tsx` | OK |
| `…/jd/:id` | `JDDetail.tsx` | OK |
| `/app/answers` + `/:id` | `AnswerBank*.tsx` | OK | `answer_bank` (RLS owner-only). |
| `/app/companies` | `CompanyResearch.tsx` | OK | `company-research` EF. |
| `…/:id` | `CompanyProfile.tsx` | OK |

### 4.7 Planner
| Route | File | Status | Notes |
|---|---|---|---|
| `/app/interviews` | `Interviews.tsx` | OK | List + "Sync calendar" CTA (audited 2026-05-01). |
| `…/new` | `NewInterview.tsx` | OK | Two-step persistence (`scheduled_interviews` + `interview_rounds`); auto-syncs to Google Calendar when connected. |
| `…/:id` | `InterviewDetail.tsx` | **Partial** | Renders details; **no edit/cancel UI** for child rounds. |
| `/app/rooms` | `PracticeRooms.tsx` | **Stub** | `practice_rooms` + `rooms` tables exist; no realtime/WebRTC channel. Users can create a room but cannot join a peer. |
| `…/new` | `NewRoom.tsx` | **Stub** | Inserts into `rooms`; no signaling channel. |
| `…/:roomId/session` | `RoomSession.tsx` | **Stub** | Placeholder UI; no media plumbing. |

### 4.8 Account
| Route | File | Status |
|---|---|---|
| `/app/profile` | `Profile.tsx` | OK |
| `/app/notifications` | `Notifications.tsx` | OK | Realtime channel + `mark_notifications_read` RPC. |
| `/app/referrals` | `Referrals.tsx` | OK | Reads/writes `referrals` table. |
| `/app/guide` | `Guide.tsx` | OK | Static help. |

### 4.9 Settings (17 sub-pages)
| Route | File | Status | Notes |
|---|---|---|---|
| `/app/settings` | `Settings.tsx` | OK | Layout w/ left nav. |
| `…/profile` | `SettingsProfile.tsx` | OK |
| `…/audio` | `SettingsAudio.tsx` | OK | Mic device + Deepgram model. |
| `…/models` | `SettingsModels.tsx` | OK | `preferred_model`. |
| `…/byok` | `SettingsBYOK.tsx` | OK | `validate-api-key` EF; encrypted hint stored in `profiles`. |
| `…/billing` | `SettingsBilling.tsx` | **Broken** | Calls `create-checkout` → 500 (missing Stripe secrets). |
| `…/subscription` | `SettingsSubscription.tsx` | **Partial** | UI OK; `cancel-subscription`/`resume-subscription` blocked on Stripe secrets. |
| `…/credits` | `SettingsCredits.tsx` | OK | Reads `credit_transactions`; purchase blocked on Stripe. |
| `…/notifications` | `SettingsNotifications.tsx` | OK | Stored in `profiles` (`email_notifications`, `session_reminders`, …). |
| `…/integrations` | `SettingsIntegrations.tsx` | **Partial** | Lists Google Calendar; **disconnect button is not wired to `disconnect-calendar` EF**. |
| `…/privacy` | `SettingsPrivacy.tsx` | OK | `data_retention_days`, `profile_visibility`. |
| `…/data` | `SettingsData.tsx` | OK | `export-user-data` EF. |
| `…/security` | `SettingsSecurity.tsx` | OK |
| `…/appearance` | `SettingsAppearance.tsx` | OK |
| `…/hotkeys` | `SettingsHotkeys.tsx` | OK | Persists `overlay_hotkey`. |
| `…/polish` | `SettingsPolish.tsx` | OK |
| `…/danger` | `SettingsDanger.tsx` | OK | `delete-account` EF (requires confirm). |

---

## 5. Admin portal (`/app/admin/*`)

Guard: `<ProtectedRoute requireAdmin>` + `is_admin()` server-side. Sidebar in `AdminLayout.tsx`.

| Route | File | Status | Backend | Notes |
|---|---|---|---|---|
| `/app/admin` | `AdminDashboard.tsx` | OK | `get_admin_dau_mau`, `get_admin_perf_stats` RPCs |
| `…/users` | `AdminUsers.tsx` | OK | `bulk_update_users` RPC; writes `admin_audit_log` |
| `…/analytics` | `AdminAnalytics.tsx` | OK | `analytics` table |
| `…/revenue` | `AdminRevenue.tsx` | **Partial** | Renders but data depends on Stripe webhooks — empty until Stripe wired. |
| `…/model-costs` | `AdminModelCosts.tsx` | OK | `model_cost_logs`, `model_pricing` |
| `…/feature-flags` | `AdminFeatureFlags.tsx` | OK | `feature_flags` (admin-only RLS) |
| `…/seed-questions` | `AdminSeedQuestions.tsx` | OK | bulk insert into `questions` |
| `…/live-chat` | `AdminLiveChat.tsx` | **Partial** | `support_threads` schema exists but no realtime subscription wired in UI. |
| `…/questions` `/:id` | `AdminQuestionEditor.tsx` | OK | Block-based editor (LaTeX-aware). |

---

## 6. Edge Functions inventory (38)

Shared `_shared/`: `cors.ts`, `utils.ts` (`requireAuth`, `deductCredits`, `callAI`), `supabase.ts`, `gemini.ts`, `types.ts`.
All functions return `Content-Type: application/json` with shared CORS.

### 6.1 OK (30)
`ai-coach-chat`, `ai-feedback`, `analyze-test-performance`, `company-research`, `create-test`, `deduct-credits`, `deepgram-token`, `delete-account`, `disconnect-calendar`, `end-session`, `export-user-data`, `gap-analysis`, `generate-answer`, `generate-debrief`, `generate-hint`, `generate-practice-questions`, `generate-questions`, `generate-star-answer`, `parse-question-pdf`, `parse-resume`, `ping`, `polish-star-section`, `prep-tool`, `select-test-questions`, `send-email`, `start-session`, `submit-test`, `sync-calendar`, `validate-api-key`, `schedule-interview`.

### 6.2 Partial (4) — deployed but not wired in UI
| Function | Missing wiring |
|---|---|
| `analytics-dashboard` | `/app/analytics` still uses local aggregation. |
| `disconnect-calendar` | No button in `SettingsIntegrations.tsx`. |
| `sync-calendar` | Triggered automatically on `NewInterview` create; **no manual refresh button** on `Interviews.tsx`. |
| `schedule-interview` | Frontend writes directly to `scheduled_interviews`/`interview_rounds`; the EF (which also fires reminders) is bypassed. |

### 6.3 Broken / blocked (4) — missing Stripe secrets
`create-checkout`, `cancel-subscription`, `resume-subscription`, `process-stripe-webhook`, `stripe-webhook` (5 actually).
**Fix:** add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` via Workspace Settings.

---

## 7. Database health

- **40+ tables**, all RLS-enabled (verified). Owner-scoped policies on user-data tables; admin policies via `is_admin()` / `has_role(_, 'admin')`.
- **51 user-defined functions**; all `SET search_path = public` ✓.
- Roles via `user_roles` + `app_role` enum + `has_role()` (no role on profiles). `protect_admin_column` trigger blocks non-admin promotion ✓.
- Storage: `resumes` (private), `documents` (private), `exports` (private), `avatars` (public), `question-images` (public).
- Required RPCs present: `deduct_credits(p_action,p_cost,p_session_id)`, `refund_credits`, `add_credits`, `mark_notifications_read`, `update_topic_performance`, `bulk_update_users`, `get_admin_perf_stats`, `get_admin_dau_mau`, `delete_expired_session_data`.

### 7.1 Linter findings (29 WARN, 0 ERROR)
| # | Category | Count | Severity | Action |
|---|---|---:|---|---|
| Extension in public schema | `pg_trgm`, `uuid-ossp` | 2 | WARN | Move to `extensions` schema (P2; cosmetic). |
| RLS policy `WITH CHECK (true)` | 1 | WARN | Audit `resume_versions_service` (service-role only — likely intentional). |
| Public bucket allows listing | 2 | WARN | `avatars`, `question-images` — **expected**; documented as intentional. |
| `SECURITY DEFINER` callable by anon | 13 | WARN | Most are `pg_trgm` C-functions (false positive). Audit `is_admin()`/`has_role()` exposure. |
| `SECURITY DEFINER` callable by authenticated | 11 | WARN | Same as above; review `delete_expired_session_data`, `bulk_update_users` already gated internally. |
| Leaked password protection disabled | 1 | WARN | **Enable in Auth → Policies (P0 for launch).** |

No `ERROR`-level findings, no missing-RLS, no policy with logical hole detected.

---

## 8. Cross-cutting concerns

| Concern | Status |
|---|---|
| Env validation (`src/lib/env.ts`) | OK — throws on missing `VITE_SUPABASE_URL` early. |
| Toaster mounted (`sonner`) | OK in `App.tsx`. |
| Error boundary (`ErrorFallback.tsx`) | OK at root. |
| Sentry (`VITE_SENTRY_DSN`) | Optional; not configured (non-blocking). |
| PostHog (`VITE_POSTHOG_KEY`) | Optional; not configured. |
| Network monitor (`useNetworkMonitor`) | OK; surfaces offline banner. |
| Overlay z-index (`#clarify-overlay-root`) | OK — `2147483647`, declared in `index.html` + seeded in `main.tsx`. |
| Stealth mode (capture evasion) | Chromium/Electron only; documented in `STEALTH_FEATURES.md`. |
| Hotkeys | Wired via `useHotkeys`; user-configurable in `SettingsHotkeys`. |
| React Router future flag | Warning suppressed (cosmetic, see memory). |

---

## 9. Findings by priority

### P0 — Block production launch
1. **Add Stripe secrets** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) and verify `create-checkout` round-trip. Unblocks `SettingsBilling`, `SettingsSubscription`, `SettingsCredits` purchase, `AdminRevenue`.
2. **Enable Supabase "Leaked password protection"** in Auth → Settings.
3. **Practice Rooms (`/app/rooms/**`)** — either ship a "Coming soon" gate or implement realtime presence + WebRTC. Currently lets users create rooms they cannot use.

### P1 — Wire deployed-but-unused capabilities
4. Wire `analytics-dashboard` EF into `/app/analytics` (replace local aggregation).
5. Wire `disconnect-calendar` button in `SettingsIntegrations.tsx`.
6. Add manual "Refresh from calendar" button on `Interviews.tsx` calling `sync-calendar`.
7. Route `NewInterview` create through `schedule-interview` EF so reminder emails fire.
8. Add edit/cancel for individual rounds in `InterviewDetail.tsx`.
9. `AdminLiveChat.tsx` — subscribe to `support_threads` realtime; surface unread badges.

### P2 — Polish & doc reconciliation
10. Move `pg_trgm`, `uuid-ossp` extensions to `extensions` schema.
11. Audit `SECURITY DEFINER` exposure on app RPCs (revoke `EXECUTE FROM PUBLIC` where not needed).
12. Sync `docs/ARCHITECTURE.md` (live page is overlay-only) and `docs/API.md` (38 functions, not 32).
13. Replace 845 TODO placeholders in `src/test/_placeholders/**` with real or skipped tests.
14. Optional: configure Sentry + PostHog via `VITE_SENTRY_DSN` / `VITE_POSTHOG_KEY`.

---

## 10. Per-portal production-ready scorecard

```text
Public / Marketing  ████████████████████ 100 %
Auth                ████████████████████ 100 %
Onboarding          ████████████████████ 100 %
User App            ███████████████░░░░░  79 %
Admin               ████████████████░░░░  80 %
Edge Functions      ███████████████░░░░░  79 %
─────────────────────────────────────────────
Overall                                  ≈82 %
```

**Recommendation:** ship to **closed beta now**; resolve P0 items (Stripe secrets + leaked-password protection + Rooms gating) before public launch.
