# Production Auth / Profile / CSP Fix — Deliverables Summary

**Date:** 2026-08-05  
**Incident:** INC-2026-08-005 + master profile-timeout prompt  
**Decision:** **CONDITIONAL GO** (code ready; redeploy production required)

Full ledger: [docs/qa/incidents/2026-08-auth-csp-dashboard-remediation.md](docs/qa/incidents/2026-08-auth-csp-dashboard-remediation.md)

---

## 1. Root Cause Analysis

| Symptom | Root cause | Fix |
|---------|------------|-----|
| “Profile load timed out after 20s” / account load error | Stale refresh token races + wide profile SELECT + short stuck UI (10s) racing longer session budget; missing profile rows treated as soft onboarding | Validate session before profile; 2s boot query; ensure upsert; align stuck UI to 20s with soft retry |
| Auth loops / duplicate timeouts | StrictMode double `initialize`; early `loadProfile` before `getSession` | `_bootstrapping` guard; remove early load; `inFlightProfileLoad` dedupe |
| CSP font / inline script | Lovable font CDN blocked; `structured-data.js` created executable script nodes | `font-src` allow `cdn.gpteng.co`; static JSON-LD + `#clarify-page-jsonld` slot; delete injector |
| Inconsistent name/avatar/plan | Settings wrote DB without going through `updateProfile`; TopBar imported via alias | Single `authStore`; Settings uses `updateProfile` |
| Infinite admin spinner | Unresolved role left `isAdminResolved=false` forever | Recoverable error after 8s wait |
| `/dashboard` 503 | Hosting SPA rewrite (historically) | Client redirect + `_redirects` + `.htaccess`; live probe now HTTP 200 |

---

## 2. Files Modified (this pass + prior remediations)

- `src/store/authStore.ts`
- `src/lib/supabase/database.ts` (`PROFILE_BOOT_COLUMNS`)
- `src/lib/auth/sessionErrors.ts`, `safeReturnTo.ts`, `recoveryActions.ts`
- `src/components/layout/ProtectedRoute.tsx`, `AppLoadingFallback.tsx`, `AppTopBar.tsx`
- `src/pages/auth/Login.tsx`, `src/pages/app/settings/SettingsProfile.tsx`
- `src/hooks/usePageMeta.ts`, `src/lib/logger.ts`
- `index.html`, `public/_redirects`, `public/sw.js`
- Deleted: `public/structured-data.js`
- Tests: `src/test/lib/auth/sessionRecovery.test.ts`, `e2e/auth-recovery.spec.ts`

## 3–5. Database / API / Auth changes

- **No new migration required** — uses existing `profiles_own_insert` + `profilesDB.upsert` for orphan repair.
- Profile **boot** SELECT narrowed to `PROFILE_BOOT_COLUMNS` (faster).
- Auth: invalid refresh → clear once → `/login?reason=session_expired&returnTo=…`.
- Timeouts: session 8s (web), profile/role **2s** per attempt, one transient retry.

## 6–7. Performance & Security

- Target profile load **&lt;2s** via slim columns + 2s budget.
- CSP: no `unsafe-inline` for scripts; no key fragments in health logs; scoped sign-out storage clear.
- RLS preserved; never default unresolved user to admin.

## 8–9. Tests

- Vitest: **15/15** `sessionRecovery` passed.
- Vite production build: **passed**.
- Playwright `e2e/auth-recovery.spec.ts` added (run after deploy).

## 10. Confirmation

Repo-side production issues addressed. **Live site still needs redeploy** so users stop seeing old timeouts / `structured-data.js`. Post-deploy smoke checklist is in `QA_CHECKLIST_COMPLETE.txt`.
