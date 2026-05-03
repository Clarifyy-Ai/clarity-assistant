## Goal

Deliver a single authoritative audit document (`docs/PRODUCTION_AUDIT_2026-05-03.md`) that walks **every page in every user portal**, with frontend, UI/UX, backend, edge function, table, and RLS verification — plus a prioritized P0/P1/P2 fix list. Supersedes `docs/AUDIT_2026-05-01.md`.

## Portals & roles in scope

```text
Anonymous (Public)        →  Marketing + Auth pages
Authenticated User        →  /onboarding/*, /app/*
Admin (has_role 'admin')  →  /app/admin/*  (in addition to user portal)
Service role (server)     →  Edge functions + webhooks
```

## Sections of the audit

### 1. Public / Marketing portal
Per page (Landing, Pricing, Blog, BlogPost, Help, HelpArticle, Privacy, Terms, Shortcuts, NotFound):
- Renders without auth, SEO meta (`usePageMeta`), responsive at 360/768/1280, broken links, CTA wiring, robots/sitemap.

### 2. Auth portal
Login, Signup, AuthCallback, ResetPassword, VerifyEmail, OAuthButton:
- `onAuthStateChange` ordering, `emailRedirectTo`, recovery flow, guest-only guard, profile auto-creation trigger (`handle_new_user`), error toasts.

### 3. Onboarding (5 steps)
Each step: schema persistence to `profiles`, validation, back/forward, resume upload to `resumes` bucket + `parse-resume` edge function, audio device permission UX, completion sets `onboarding_completed=true`.

### 4. User app portal — every route under `/app/*`
For each page in this matrix, verify: route guard, data fetch, mutation, edge function call, loading/empty/error states, credit deduction (where paid), realtime where applicable, mobile layout.

| Group | Pages |
|---|---|
| Core | Dashboard, Live (LiveRehearsal/Overlay), MockSession, Mock hub |
| Mock Tests | MockTestHub, ExamPapers, ExcelImportTab, MyQuestions, TestAnalytics, TestConfigure, TestResults, TestRevision, TestSession, UploadQuestions |
| Prep | Prep Lab subpages (STAR, Practice Questions, Whiteboard, CodeScratchpad, etc.) |
| Sessions | Sessions list + detail, Scorecard, Debrief |
| Growth | Analytics, Documents, Answer Bank, CompanyResearch |
| Planner | Interviews, NewInterview, InterviewDetail, InterviewDay, Rooms |
| Account | Profile, Referrals, Notifications |
| Settings | Settings + 17 sub-pages (Profile, Audio, BYOK, Billing, Subscription, Credits, Models, Hotkeys, Appearance, Notifications, Integrations, Privacy, Data, Security, Polish, Danger) |

### 5. Admin portal — `/app/admin/*`
Admin, AdminDashboard, AdminUsers, AdminAnalytics, AdminLiveChat, AdminQuestionEditor, AdminSeedQuestions, AdminFeatureFlags, AdminRevenue, AdminModelCosts:
- `requireAdmin` guard, RLS via `has_role`, admin-only RPCs (`get_admin_perf_stats`, `get_admin_dau_mau`, `bulk_update_users`), audit log writes.

### 6. Backend matrix
- All 38 edge functions: auth check, CORS, JSON content-type, error path, called-from frontend mapping.
- All 40+ tables: RLS enabled, owner-scoped policies, admin policy, nullable `user_id` audit.
- Storage buckets: privacy, signed URL usage.
- Secrets present vs required (highlight missing Stripe secrets).

### 7. Cross-cutting concerns
- Z-index/overlay stack, stealth mode, keyboard hotkeys, network/offline fallback, error boundaries, Sentry, PostHog, env validation, toaster mounting.

### 8. Findings & prioritized fix list
- **P0 (blocks production):** missing Stripe secrets, any unprotected route, any silent-failure mutation, any RLS gap.
- **P1:** unwired edge functions, stub pages (Practice Rooms WebRTC), realtime gaps.
- **P2:** doc reconciliation, test placeholders, polish.

## Method (read-only)

1. Enumerate routes from `src/App.tsx` and confirm guards.
2. For each page, open the file and check: data hooks used, edge function calls, mutation paths, empty/error handling.
3. For each edge function, open `index.ts` to confirm `requireAuth`, `deductCredits` (if paid), CORS, response shape.
4. Cross-check tables in schema for RLS + owner column nullability.
5. Run `supabase--linter` and `security--run_security_scan` to catch RLS / policy gaps.
6. Check console + network logs from current preview session for runtime errors.

## Deliverable

A single markdown file `docs/PRODUCTION_AUDIT_2026-05-03.md` with:
- Executive summary (% production-ready per portal)
- Per-page table (Status: OK / Partial / Stub / Broken; Owner column; Notes)
- Backend matrix tables
- Findings list with file paths + line refs
- P0/P1/P2 action plan with effort estimates

No code changes in this pass — audit only. A follow-up plan will batch the P0/P1 fixes once you approve.
