

# Clarity AI — Comprehensive Application Audit Report

---

## EXECUTIVE SUMMARY

The application has **49 tables** in the database, **28 deployed edge functions**, and ~50+ frontend features. After thorough audit, the findings are:

- **Working features**: ~8 (Auth, basic profile, credits RPC, answer bank CRUD, basic session tracking, notifications read, practice rooms structure, admin dashboard)
- **Partially broken**: ~12 (documents, scorecards, analytics, settings, billing, mock tests, overlay)
- **Completely broken**: ~15 (resume upload, JD parsing, PDF import, calendar sync, BYOK key testing, deepgram transcription, company research, gap analysis, analytics dashboard, referrals notification save, several edge functions)

---

## PART 1: WHAT IS WORKING

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | **Auth (Login/Signup/OAuth)** | WORKING | Supabase Auth properly configured, `handle_new_user` trigger creates profile + subscription |
| 2 | **Profile CRUD** | WORKING | Read/update profile fields, avatar upload to `avatars` bucket |
| 3 | **Credit Deduction RPC** | WORKING | `deduct_credits` RPC exists in two overloads, both functional |
| 4 | **Credit Refund RPC** | WORKING | `refund_credits` RPC exists, max 5 credits |
| 5 | **Answer Bank CRUD** | WORKING | `answer_bank` table schema matches code — insert/select/delete/favourite all aligned |
| 6 | **Session Records** | WORKING | `sessions` table has correct columns, basic CRUD works |
| 7 | **Notifications List** | WORKING | `notifications` table matches code, read/mark-read works |
| 8 | **Onboarding Flow** | WORKING | Profile fields (`onboarding_completed`, `onboarding_step`, `role_type`, etc.) exist |
| 9 | **Practice Rooms Load** | WORKING | `practice_rooms`, `room_participants`, `room_chat`, `room_questions` tables exist with correct schemas |
| 10 | **Scorecard Read** | WORKING | `scorecards` table schema matches what `useScorecard` expects |
| 11 | **XP/Streak System** | WORKING | `profiles` has `xp`, `streak_days`, `longest_streak`, `level` columns; `update_user_streak` trigger function exists |

---

## PART 2: WHAT IS BROKEN

### A. Database Schema Mismatches (Critical)

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | **`resumes` table schema mismatch** | CRITICAL | Code expects: `title`, `active_version_id`, `created_at`, `updated_at` + related `resume_versions` table. DB has: `name`, `file_path`, `url`, `content`, `is_primary`. **No `resume_versions` table exists.** Resume upload will crash. |
| 2 | **`job_descriptions` table schema mismatch** | CRITICAL | Code expects: `raw_text`, `role_title`, `company_name`, `input_method`, `file_url`, `is_active`, `parse_status`, `parsed_data`, `parse_error`. DB has: `title`, `company`, `content`, `url`, `target_role`. Every JD operation fails. |
| 3 | **`profiles` has no `metadata` column** | HIGH | `SettingsNotifications.tsx` saves to `metadata.notification_prefs` — this column does not exist. Save always fails silently. |
| 4 | **`profiles` has no `byok_openai`/`byok_anthropic`/`byok_gemini` columns** | HIGH | Code references `byok_openai`, `byok_anthropic`, `byok_gemini` but DB has `byok_openai_hint`, `byok_anthropic_hint`, `byok_gemini_hint`. BYOK save writes to wrong columns. |
| 5 | **`_shared/supabase.ts` `deductCredits` inserts `reason` column** | HIGH | `credit_transactions` has no `reason` column — it has `action` (enum) + `description`. The `generate-hint` function uses this broken helper. Every hint generation fails at credit logging. |
| 6 | **`scheduled_interviews` schema mismatch** | MEDIUM | Code expects `interview_rounds(*)` nested select, but `interview_rounds` has no FK to `scheduled_interviews` — it has `interview_id` referencing `interviews` table instead. |
| 7 | **`useAuth` reads `profile.plan`** | MEDIUM | `canAccessFeature` checks `profile.plan` but DB column is `plan_id`. Feature gating always returns false. |

### B. Missing Edge Functions

| # | Function Called | Exists? | Impact |
|---|---|---|---|
| 1 | `validate-api-key` | NO | BYOK key testing always fails (SettingsBYOK.tsx line 75) |
| 2 | `analytics-dashboard` | NO | Analytics page always shows error (useAnalytics.ts line 48) |
| 3 | `gap-analysis` | NO | Resume-JD gap analysis always fails (useDocuments.ts line 326) |
| 4 | `generate-answer` | NO | Answer generation unavailable |
| 5 | `process-audio` | NO | Audio processing unavailable |
| 6 | `purchase-credits` | NO | Credit purchase flow broken |
| 7 | `send-invite` | NO | Room invites don't send |
| 8 | `send-notification` | NO | Push notifications don't fire |
| 9 | `flush-analytics` | NO | Analytics events never persisted |
| 10 | `sync-session` | NO | Session sync unavailable |
| 11 | `create-customer-portal` | NO | Stripe billing portal unavailable |

### C. Missing API Keys (Supabase Secrets)

| # | Secret | Required By | Status |
|---|---|---|---|
| 1 | `GEMINI_API_KEY` | `_shared/gemini.ts`, `_shared/utils.ts` | MISSING — All Gemini-powered features fail (hints, JD parsing, star builder, etc.) |
| 2 | `ANTHROPIC_API_KEY` | `parse-question-pdf`, `_shared/utils.ts` | MISSING — PDF import fails with 503 |
| 3 | `OPENAI_API_KEY` | `_shared/utils.ts` | MISSING — OpenAI model calls fail |
| 4 | `DEEPGRAM_API_KEY` | `deepgram-token` | MISSING — Live transcription fails with 503 |
| 5 | `STRIPE_SECRET_KEY` | `create-checkout`, `stripe-webhook` | MISSING — Billing/checkout broken |
| 6 | `RESEND_API_KEY` | `send-email` | MISSING — Email sending fails |

### D. Edge Function Code Bugs

| # | Function | Bug | Impact |
|---|---|---|---|
| 1 | `_shared/supabase.ts` → `deductCredits` | Inserts `{ reason }` into `credit_transactions` but column is `action` (enum) + `description` | Every edge function using this helper fails at credit logging: `generate-hint`, `ai-feedback`, `generate-debrief`, `generate-practice-questions`, etc. |
| 2 | `useAnalytics.ts` | Uses `SUPABASE_ANON_KEY` as Bearer token instead of user's session token | Auth always fails on the edge function |
| 3 | `parse-question-pdf` | `deductCredits(userId, "resume_analysis", ...)` — uses `_shared/utils.ts` version which works, but credits logged under wrong feature name | Minor — functional but misleading logs |

### E. Frontend Code Bugs

| # | File | Bug | Impact |
|---|---|---|---|
| 1 | `useAuth.ts` line 203 | `profile.plan` — should be `profile.plan_id` | Feature access gating always fails |
| 2 | `useDocuments.ts` | Entire resume upload flow references non-existent columns (`title`, `active_version_id`) and non-existent `resume_versions` table | Resume upload completely broken |
| 3 | `useDocuments.ts` | JD insert references non-existent columns (`raw_text`, `role_title`, `company_name`, `input_method`, `file_url`, `is_active`, `parse_status`, `parsed_data`, `parse_error`) | JD creation completely broken |
| 4 | `SettingsBYOK.tsx` | Calls `validate-api-key` edge function (doesn't exist), saves to `byok_openai` instead of `byok_openai_hint` | BYOK feature broken |
| 5 | `SettingsNotifications.tsx` | Writes to `profiles.metadata` column that doesn't exist | Notification pref save fails |
| 6 | `useInterviewScheduler.ts` | Nested select `interview_rounds(*)` may fail if FK not set up correctly between `scheduled_interviews` and `interview_rounds` | Interview scheduler may crash |

### F. Storage Bucket Mismatches

| # | Bucket Referenced in Code | Exists? |
|---|---|---|
| 1 | `resumes` | YES |
| 2 | `avatars` | YES |
| 3 | `documents` | YES |
| 4 | `exports` | YES |
| 5 | `scorecards` | NO — referenced in `STORAGE_BUCKETS` |
| 6 | `jd-files` | NO — referenced in `STORAGE_BUCKETS` |
| 7 | `room-recordings` | NO — referenced in `STORAGE_BUCKETS` |

### G. Security Warnings

| # | Issue | Severity |
|---|---|---|
| 1 | 9 functions with mutable `search_path` | WARN |
| 2 | 5 RLS policies with `USING (true)` on INSERT/UPDATE/DELETE | WARN — allows any authenticated user to insert into `room_chat`, `room_questions`, `model_cost_logs` |
| 3 | `pg_trgm` extension in public schema | WARN |
| 4 | `is_admin` check on `profiles` table instead of separate `user_roles` table | WARN — privilege escalation risk |

---

## PART 3: FEATURE-BY-FEATURE STATUS

| Feature | Status | Blocking Issue |
|---|---|---|
| Login / Signup | ✅ Working | — |
| OAuth (Google) | ✅ Working | — |
| Onboarding Wizard | ✅ Working | — |
| Dashboard | ⚠️ Partial | `plan` vs `plan_id` in feature gating |
| Resume Upload | ❌ Broken | `resumes` table schema completely different; no `resume_versions` table |
| Resume Parsing | ❌ Broken | Depends on resume upload + missing edge function response handling |
| Job Description Add | ❌ Broken | `job_descriptions` table schema completely different |
| JD AI Parsing | ❌ Broken | Missing `GEMINI_API_KEY` + wrong column names |
| Gap Analysis | ❌ Broken | Missing `gap-analysis` edge function |
| Answer Bank | ✅ Working | Schema aligned |
| Live Copilot / Overlay | ⚠️ Partial | Overlay UI renders but AI hints fail (missing API keys) |
| Live Transcription | ❌ Broken | Missing `DEEPGRAM_API_KEY` secret |
| AI Hint Generation | ❌ Broken | `_shared/supabase.ts` `deductCredits` inserts wrong columns + missing `GEMINI_API_KEY` |
| AI Feedback | ❌ Broken | Same `deductCredits` issue + missing API keys |
| STAR Builder | ⚠️ Partial | Edge function exists but missing API keys |
| Scorecard View | ✅ Working | Read works; generation needs API keys |
| Mock Interview | ⚠️ Partial | UI renders; AI responses fail |
| Mock Test Hub (Questions) | ⚠️ Partial | `questions` table exists; PDF import fails (missing `ANTHROPIC_API_KEY`) |
| PDF Question Import | ❌ Broken | Missing `ANTHROPIC_API_KEY` |
| Company Research | ⚠️ Partial | Table exists; edge function needs API keys |
| Interview Scheduler | ⚠️ Partial | Tables exist but FK between `scheduled_interviews` ↔ `interview_rounds` may be missing |
| Calendar Sync | ❌ Broken | Google Calendar integration needs OAuth setup + API keys |
| Practice Rooms | ⚠️ Partial | Tables correct; real-time may work; `RoomSession.tsx` previously had wrong table name (fixed) |
| Analytics Dashboard | ❌ Broken | Missing `analytics-dashboard` edge function + wrong auth token usage |
| Settings - Profile | ✅ Working | — |
| Settings - Notifications | ❌ Broken | No `metadata` column on `profiles` |
| Settings - BYOK | ❌ Broken | Wrong column names + missing `validate-api-key` function |
| Settings - Billing | ❌ Broken | Missing `STRIPE_SECRET_KEY` + `purchase-credits` function |
| Settings - Audio | ✅ Working | Saves to correct profile columns |
| Settings - Appearance | ✅ Working | Client-side theme toggle |
| Admin Dashboard | ⚠️ Partial | Fixed `plan_id`; works if user `is_admin = true` |
| Referrals | ⚠️ Partial | Schema aligned after previous fix |
| Debrief | ⚠️ Partial | Edge function exists; needs API keys |
| Session History | ✅ Working | `sessions` schema correct |
| Notifications | ✅ Working | Schema correct |
| XP / Gamification | ✅ Working | Trigger + profile columns exist |

---

## PART 4: IMPLEMENTATION PLAN TO FIX EVERYTHING

### Priority 1 — Database Schema Fixes (Migration)
1. **Alter `resumes` table** to add missing columns: `title`, `active_version_id`, `updated_at` (or create adapter)
2. **Create `resume_versions` table** with columns: `id`, `resume_id` (FK), `version_number`, `label`, `file_name`, `file_size_bytes`, `file_url`, `is_active`, `parsed_data`, `parse_status`, `parse_error`, `uploaded_at`
3. **Alter `job_descriptions` table** to add missing columns: `raw_text`, `role_title`, `company_name`, `input_method`, `file_url`, `is_active`, `parse_status`, `parsed_data`, `parse_error`, `updated_at`
4. **Add `metadata` JSONB column** to `profiles` table
5. **Add FK** from `interview_rounds` to `scheduled_interviews`
6. **Create missing storage buckets**: `scorecards`, `jd-files`, `room-recordings`

### Priority 2 — Fix Edge Function Code
1. **Fix `_shared/supabase.ts`**: Change `deductCredits` to insert `action: 'usage'` + `description` instead of `reason`
2. **Create `validate-api-key` edge function** stub for BYOK testing
3. **Create `analytics-dashboard` edge function** that queries sessions/scorecards and returns dashboard data

### Priority 3 — Fix Frontend Code
1. **`useAuth.ts`**: Change `profile.plan` → `profile.plan_id`
2. **`SettingsBYOK.tsx`**: Change `byok_openai` → `byok_openai_hint` (same for anthropic/gemini); change `validate-api-key` → the new function name
3. **`useAnalytics.ts`**: Use session JWT instead of anon key for auth
4. **`useDocuments.ts`**: Align resume/JD operations with new DB schema

### Priority 4 — Add Required API Key Secrets
User must add these secrets in Supabase dashboard:
- `GEMINI_API_KEY` — unlocks all Gemini AI features
- `ANTHROPIC_API_KEY` — unlocks PDF import
- `OPENAI_API_KEY` — unlocks GPT-4o features
- `DEEPGRAM_API_KEY` — unlocks live transcription
- `STRIPE_SECRET_KEY` — unlocks billing
- `RESEND_API_KEY` — unlocks email sending

### Priority 5 — Create Missing Edge Functions
- `analytics-dashboard` — aggregates session data for analytics page
- `validate-api-key` — validates user-provided API keys for BYOK
- `gap-analysis` — compares resume vs JD

---

## Summary Counts

| Category | Count |
|---|---|
| Total features audited | 35 |
| Fully working | 11 |
| Partially working (UI loads, backend fails) | 12 |
| Completely broken | 12 |
| Database schema mismatches | 7 |
| Missing edge functions | 11 |
| Missing API key secrets | 6 |
| Edge function code bugs | 3 |
| Frontend code bugs | 6 |
| Security warnings | 4 |

