# Plan

Per your guardrails I'm presenting a plan (not changing code yet) and breaking the work into discrete components. Before building, please confirm scope.

## Audit findings

**Auth — already implemented.** Do not rebuild.
- `src/pages/auth/Login.tsx`, `Signup.tsx`, `ResetPassword.tsx`, `VerifyEmail.tsx`, `AuthCallback.tsx`
- `src/components/auth/OAuthButton.tsx` already exports Google, GitHub, LinkedIn, Azure buttons
- `src/store/authStore.ts` + `ProtectedRoute.tsx` handle session, profile, admin, onboarding
- `profiles` table + RLS already exist; `user_roles` + `has_role()` + `is_admin()` already exist
- Supabase client wired at `src/integrations/supabase/client.ts`

What's actually needed for auth: only OAuth provider **configuration** in the Supabase dashboard (Google/GitHub client IDs + redirect URLs). That's a dashboard step, not a code change.

**Admin dashboard — partially implemented.**
- `AdminDashboard.tsx` (KPIs), `AdminUsers.tsx`, `AdminFeatureFlags.tsx`, `AdminAnalytics.tsx`, `AdminRevenue.tsx`, `AdminModelCosts.tsx`, `AdminLayout.tsx` already exist
- `admin_audit_log` table exists with admin-only RLS — **no UI page yet**
- `feature_flags` table + admin RLS exist — page exists, status of filtering unknown
- **`support_threads` table does NOT exist** in the schema

## Proposed work, component-by-component

### Component 1 — Verify auth (no code changes)
Confirm Login/Signup/OAuth work end-to-end. If a provider is missing in the UI or a redirect is broken, fix only that. Do not refactor authStore or ProtectedRoute.

**Guardrail:** do not modify existing working auth files.

### Component 2 — Admin Audit Log page
New file `src/pages/app/admin/AdminAuditLog.tsx` + register in `admin/index.ts` + add route + sidebar link.
- Table of `admin_audit_log` (admin, action, target_type, target_id, ip, created_at, old/new diff in expandable row)
- Filters: action (text), target_type (select), admin (select), date range
- Server-side pagination (50/page), order by created_at desc

### Component 3 — Feature Flags filtering
Audit existing `AdminFeatureFlags.tsx` first; only add filter bar (search by key/name, toggle enabled-only, plan filter). Do not change write logic.

### Component 4 — Support Threads
**Blocker:** no `support_threads` table exists. Two options — please pick one:
- **(a) Create the table** (id, user_id, subject, status enum [open/pending/closed], priority, assigned_admin_id, created_at, updated_at + `support_messages` child table) with admin-only RLS + an owner-read policy. Then build the admin page.
- **(b) Skip support_threads** for now — build only audit log + feature flag filters.

## Questions before I start

1. **OAuth providers:** which ones do you want enabled in the UI? Google only, or also GitHub/LinkedIn/Azure? (Buttons exist; need to confirm which appear on Login/Signup.)
2. **Support threads:** option (a) create the table now, or (b) skip?
3. Build order: Audit Log first, then Feature Flag filters, then (optionally) Support Threads?

Reply with answers and I'll implement one component at a time, each with the "do not modify existing working features" guardrail.