

# Production Audit Report — Clarify AI

---

## 🔴 Critical Issues (Production-Breaking)

### SEC-1: Privilege Escalation — `user_achievements` table
The `ua_insert` RLS policy uses `WITH CHECK (true)` for the `{public}` role. **Any unauthenticated user** can insert achievements for any user_id, granting XP/credit rewards to arbitrary accounts.
- **Fix**: Change policy to `WITH CHECK (auth.uid() = user_id)`, restrict to `{authenticated}`.

### SEC-2: Unrestricted Cost Log Injection — `model_cost_logs`
The `model_cost_insert` policy uses `WITH CHECK (true)`. Any caller can insert fake billing records for any user, corrupting credit accounting.
- **Fix**: Change to `WITH CHECK (auth.uid() = user_id)`, restrict to `{authenticated}`.

### SEC-3: Room Chat Data Leak — `room_chat`
The `room_chat_all` policy uses `USING (true)` for all commands. Any authenticated user can read every room's chat messages, including private rooms.
- **Fix**: Replace `USING` with `EXISTS (SELECT 1 FROM room_participants rp WHERE rp.room_id = room_chat.room_id AND rp.user_id = auth.uid())`.

### SEC-4: Room Questions Open Write — `room_questions`
`room_questions_all` uses both `USING (true)` and `WITH CHECK (true)`. Any authenticated user can insert/update/delete questions in any room.
- **Fix**: Scope to room participants or room hosts.

### SEC-5: Admin Check Uses `is_admin` Column on Profiles Table
The `AdminLayout` component checks `p?.is_admin` from the profile, and the `is_admin()` database function reads from `profiles.is_admin`. Per security best practices, **roles should be in a separate table** to prevent privilege escalation via profile self-update. Currently a user could potentially set `is_admin = true` on their own profile since `profiles_own_update` allows `UPDATE` where `auth.uid() = id`.
- **Fix**: Create a separate `user_roles` table; remove `is_admin` from profiles; update RLS and the `is_admin()` function.

### SEC-6: Leaked Password Protection Disabled
Supabase's leaked password protection feature is turned off. Users can register with known-compromised passwords.
- **Fix**: Enable in Supabase Dashboard → Auth → Security.

### APP-1: 100 `@ts-nocheck` Files
317 occurrences across 100 files suppress all TypeScript checking. This masks runtime errors (like the `options.map` crash already encountered) and makes the codebase fragile.
- **Impact**: Any type mismatch becomes a runtime crash in production.
- **Fix**: Incrementally remove `@ts-nocheck`, fix type errors per file.

---

## 🟠 High Priority Issues

### SEC-7: 9 Database Functions Missing `search_path`
Functions like `update_topic_performance`, `update_user_streak`, `handle_new_user`, `mark_notifications_read`, etc. do not set `search_path`. A malicious schema injection could alter function behavior.
- **Fix**: Add `SET search_path = public` to each function definition.

### SEC-8: Realtime Channel Leakage
No RLS on `realtime.messages`. Any authenticated user can subscribe to channels scoped to other users' sessions (sessions, transcripts, AI interactions, debriefs).
- **Fix**: Add RLS policies on `realtime.messages` scoped by `auth.uid()`.

### SEC-9: Extension in Public Schema
A database extension (likely `pg_trgm`) is installed in the `public` schema rather than a dedicated `extensions` schema, creating a larger attack surface.
- **Fix**: Move to `extensions` schema via migration.

### DB-1: Missing Indexes on `questions` Table
The `questions` table (1,562 rows, growing) only has indexes on `pkey`, `subject`, and `uploaded_by`. The `select-test-questions` edge function filters by `exam_type`, `difficulty`, and `topic` — none of which are indexed.
- **Fix**: Add composite index `(exam_type, difficulty, subject, topic)`.

### DB-2: No Indexes on Several Tables
Tables like `job_descriptions`, `scheduled_interviews`, `company_research`, `feedback`, `saved_answers`, `scorecards` have no custom indexes beyond pkey. As data grows, queries on `user_id` will degrade.
- **Fix**: Add `user_id` indexes on all user-scoped tables.

### FUNC-1: Duplicate `deduct_credits` RPC Overloads
Two `deduct_credits` functions exist with different signatures: `(p_user_id, p_amount, p_session_id, p_description)` and `(p_action, p_cost, p_session_id)`. The edge function code has been changed multiple times. This creates confusion and potential call-wrong-overload bugs.
- **Fix**: Consolidate to one canonical function; drop the other.

### FUNC-2: Credit Transaction `action` Column Enum Mismatch
The `credit_transactions.action` column uses a `credit_action` enum (values: `usage`, `purchase`). Edge functions previously tried inserting strings like `"create_mock_test"`, causing 402 errors. While patched, any new edge function making the same mistake will silently fail.
- **Fix**: Document the enum constraint; add validation in shared utils.

---

## 🟡 Medium Issues

### UX-1: Mobile Layout Alignment (360px viewport)
Per the user's screenshot, content cards and headers overlap on small mobile screens. The `MockTestHub` was recently patched but other pages (Dashboard, Analytics, Settings) likely have similar issues on narrow viewports.
- **Fix**: Audit all page headers and card grids for `flex-wrap`, `min-w-0`, and responsive font sizes.

### UX-2: Question Images Not Rendering
The `questions` table has `image_url` and `has_image` columns, but the `TestSession` component only recently added image support via URL-regex detection in option text. Questions with `image_url` set at the question level may still not display images unless the component explicitly renders `currentQuestion.image_url`.
- **Fix**: Add `{currentQuestion.image_url && <img src={currentQuestion.image_url} />}` in TestSession.

### UX-3: Build Sync Failures
Repeated "sandbox head mismatch" errors indicate platform sync issues. While not a code bug, it disrupts deployments.
- **Fix**: Trivial file edit to force re-sync (already done).

### PERF-1: No Pagination on Question Lists
`MyQuestions.tsx` and `ExamPapers.tsx` likely fetch all questions at once. With 1,562+ questions, this will become slow.
- **Fix**: Implement server-side pagination with `.range()`.

### PERF-2: QueryClient staleTime is 2 Minutes
For relatively static data like questions and exam papers, 2 minutes is too aggressive. This causes unnecessary refetches.
- **Fix**: Set staleTime to 5-10 minutes for static data queries.

### CODE-1: Console Warning Suppression
Line 289-293 of `App.tsx` patches `console.warn` to suppress React Router warnings. This can mask real warnings during development.

### CODE-2: Electron Detection at Module Level
`const IS_ELECTRON = !!(window as any).electronAPI?.isElectron` runs at import time, which could cause issues during SSR or testing.

---

## 🟢 Minor Issues

### MINOR-1: `resume_versions_service` Policy Too Permissive
Uses `USING (true)` and `WITH CHECK (true)` for `service_role`. This is acceptable for service_role but should be documented.

### MINOR-2: No Foreign Keys Defined
None of the tables have foreign key constraints defined (per schema dump). While this avoids cascade complexity, it means no referential integrity enforcement at the database level.

### MINOR-3: `referral_code` Generation
Uses `encode(gen_random_bytes(5), 'hex')` — 10 hex characters. Collision probability is low but not zero with scale. Consider UUIDs or checking uniqueness.

---

## 📈 Performance Metrics (Estimated)

| Metric | Status | Notes |
|---|---|---|
| Questions table (1,562 rows) | OK for now | Missing indexes on filter columns will degrade at 10K+ |
| Largest table: `questions` | 1,562 rows | Moderate |
| Test responses | 163 rows | Fine |
| Code-split lazy loading | Implemented | All pages are lazy-loaded |
| QueryClient caching | 2min stale | Could be longer for static data |
| Bundle size | Not measured | 100+ lazy chunks is reasonable |

---

## 🔐 Security Risk Summary

| Risk | Severity | Status |
|---|---|---|
| Achievement privilege escalation | CRITICAL | Unfixed |
| Cost log injection | CRITICAL | Unfixed |
| Room chat data leak | CRITICAL | Unfixed |
| Admin role on profiles table | HIGH | Unfixed |
| Leaked password protection | HIGH | Disabled |
| Function search_path | MEDIUM | 9 functions |
| Realtime channel leak | MEDIUM | Unfixed |
| 100 files with @ts-nocheck | HIGH | Type safety disabled |

---

## 📱 Responsiveness Report

| Device | Status | Issues |
|---|---|---|
| Mobile 360px | Issues | Header overflow, card alignment (partially fixed in MockTestHub) |
| Mobile 390-414px | Likely OK | Needs verification |
| Tablet 768-834px | Unknown | Not tested |
| Desktop 1280px+ | OK | Primary development target |

---

## 🧭 UX/Navigation Issues

1. **Free plan limit**: Recently raised from 2 to 10 tests/month but the error message is confusing — no UI indication of remaining quota before the error hits.
2. **No question count preview**: Users configure a test but don't know how many questions match their filters until submission fails.
3. **Admin Layout imports from `userStore`** (line 2) while `ProtectedRoute` imports from `authStore` — potential state desync if stores diverge.

---

## 🛠 Recommended Fixes (Priority Order)

1. **[CRITICAL]** Fix 4 overly-permissive RLS policies (user_achievements, model_cost_logs, room_chat, room_questions)
2. **[CRITICAL]** Move admin role to a separate `user_roles` table
3. **[CRITICAL]** Enable leaked password protection in Supabase Auth settings
4. **[HIGH]** Set `search_path = public` on all 9 unprotected functions
5. **[HIGH]** Add composite index on `questions(exam_type, difficulty, subject, topic)`
6. **[HIGH]** Consolidate duplicate `deduct_credits` RPC overloads
7. **[HIGH]** Begin removing `@ts-nocheck` from critical files (authStore, TestSession, Dashboard)
8. **[MEDIUM]** Add question image rendering for `currentQuestion.image_url`
9. **[MEDIUM]** Add pagination for question lists
10. **[MEDIUM]** Audit all pages for mobile 360px alignment

---

## 🚀 Final Verdict

**Production Readiness Score: 4/10**

**Rationale**: The application has a comprehensive feature set and solid architecture (lazy loading, Zustand stores, edge functions, RLS). However, it has **5 critical security vulnerabilities** that could be exploited in production: privilege escalation via achievements, cost log injection, room chat data leaks, and admin role stored on a self-updatable profile table. The widespread use of `@ts-nocheck` (100 files) means any type mismatch becomes a runtime crash. The mock test flow works after recent patches but still has edge cases (image rendering, credit enum mismatches). The app needs a security hardening pass before going to production.

