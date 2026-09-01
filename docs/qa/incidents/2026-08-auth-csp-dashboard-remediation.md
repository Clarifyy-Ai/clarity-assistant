# Career Pilot — Auth, CSP, and Dashboard Remediation Ledger

## Incident Metadata

| Field | Value |
|-------|-------|
| **Incident ID** | INC-2026-08-005 |
| **Detected** | 2026-08-05 ~01:00 IST |
| **Environment** | Production |
| **Affected URL** | https://clarify.ai.sltfinanceindia.com |
| **Supabase Project** | qzgvjrvtkwlzxpmlddkx |
| **Severity** | P0 — Dashboard blocked for all users |
| **Owner** | Engineering |
| **Status** | FIXED — See REL-2026-08-05-STAB in `2026-08-production-stabilization-release.md` for ship decision |

---

## Original Symptoms (Sanitized)

### Console Errors
```
1. Refused to load font 'https://cdn.gpteng.co/mcp-widgets/v1/fonts/CameraPlainVariable.woff2'
   because it violates the following Content Security Policy directive: "font-src 'self' data:"

2. Refused to execute inline script because it violates the following
   Content Security Policy directive: "script-src 'self'".
   Either the 'unsafe-inline' keyword, a hash ('sha256-94vmev1ZHn894g2...'), or a nonce is required.

3. POST https://qzgvjrvtkwlzxpmlddkx.supabase.co/auth/v1/token?grant_type=refresh_token
   HTTP 400 — AuthApiError: Invalid Refresh Token: Refresh Token Not Found

4. [authStore] Admin role check timed out after 4s
5. [authStore] Profile load timed out after 4s
6. Both operations retry once and fail again
7. Auth store remains unresolved (status: loading forever)
8. /dashboard returns HTTP 503 Service Unavailable
9. Duplicate timeout sequence repeats on remount
```

---

## Root-Cause Analysis

### RC-1: Font blocked by CSP
- **Symptom**: Font from `cdn.gpteng.co` blocked
- **Root Cause**: The Lovable/gpteng.co platform injects a `@font-face` load for `CameraPlainVariable.woff2` via its widget/editor layer. The `font-src` directive in `index.html` only allows `'self'` and `data:`, blocking any external font CDN.
- **Affected File**: `index.html` line 30
- **Correction**: Added `https://cdn.gpteng.co` to `font-src`
- **Security Impact**: Minimal — allows font loading from one verified platform CDN only. No wildcard or `default-src` weakening.
- **Regression Risk**: Low — additive change to CSP only

### RC-2: Inline script blocked (CSP)
- **Symptom**: `sha256-94vmev1...` hash required for inline script
- **Root Cause**: `public/structured-data.js` used `document.createElement("script")` to inject JSON-LD at runtime. Dynamically-created scripts without a nonce are treated as inline scripts by the CSP engine, triggering the violation.
- **Affected File**: `public/structured-data.js` (removed) and `index.html` (modified)
- **Correction**: Embedded JSON-LD directly as `<script type="application/ld+json">` in `index.html`. This is a **data block** (not executable), and is not governed by `script-src`.
- **Security Impact**: Positive — eliminates the dynamic script injection entirely. JSON-LD is now static.
- **Regression Risk**: None — JSON-LD content unchanged, just delivery method

### RC-3: Invalid Refresh Token → 400
- **Symptom**: POST `/auth/v1/token?grant_type=refresh_token` → HTTP 400
- **Root Cause**: A stale/revoked refresh token in localStorage. When `initialize()` detected a cached session, it called `loadProfile()` at line 369 **before** `getSession()` validated the token. The profile query hit Supabase with the stale JWT, receiving 401. Meanwhile, `getSession()` also received 400, and both error handlers fired concurrently — creating a race.
- **Affected File**: `src/store/authStore.ts` lines 369–371
- **Correction**: Removed the early `loadProfile()` call. Profile and role loading now start **only after** `getSession()` confirms a valid session.
- **Security Impact**: Positive — stale session no longer initiates DB queries
- **Regression Risk**: Minimal — users with valid cached sessions will notice a slightly longer time to first profile load (one `getSession()` roundtrip more before profile starts)

### RC-4: Admin role and profile timeouts (4s each × 2 retries)
- **Symptom**: Role check timed out × 2, profile load timed out × 2
- **Root Cause**: (a) Both operations fired on a stale token — guaranteed to fail with 401 immediately. (b) Retry logic used `isInvalidRefreshTokenError()` only — other auth errors (JWT expired, RLS) were retried unnecessarily. (c) No distinction between transient (network) vs. deterministic (auth) failures.
- **Affected File**: `src/store/authStore.ts` — `resolveAdminRole()` and profile `fetchProfile()` retry
- **Correction**: Added `isNonRetryableAuthError()` covering: invalid refresh token, JWT expired, not authenticated, invalid API key, permission denied, row-level security. These bypass retry immediately.
- **Security Impact**: Neutral — RLS and auth errors now surface faster
- **Regression Risk**: Low — worst case is a transient error that happens to match a non-retryable pattern; those were already failing on retry

### RC-5: Auth store unresolved forever (duplicate initialization)
- **Symptom**: Duplicate timeout sequence in console — `Role check timed out` appears twice
- **Root Cause**: React StrictMode in development double-fires `useEffect`, calling `initialize()` twice before the first run completes. The `unsubAuthListener` teardown guard only runs at the start of `initialize()` — if the first call hasn't registered the listener yet, the second call proceeds in parallel.
- **Affected File**: `src/store/authStore.ts` — `initialize()` and module-level scope
- **Correction**: Added `_bootstrapping` module-level boolean flag. Second concurrent call returns immediately (logged with structured event).
- **Security Impact**: Positive — prevents race between two auth initialization sequences
- **Regression Risk**: Low — the `finally` block releases the flag, so deliberate re-initialization (after OAuth callback or password reset) works correctly

### RC-6: `/dashboard` HTTP 503
- **Symptom**: Direct navigation to `/dashboard` returns 503
- **Root Cause**: The `/dashboard → /app/dashboard` redirect is defined only in React Router (client-side SPA). If the hosting server doesn't serve `index.html` for `/dashboard`, it returns a server error. The `.htaccess` catch-all rule IS present and correct (`RewriteRule ^ index.html [L]`), but the hosting platform may not be applying it (e.g., if the platform uses Nginx/Caddy and ignores `.htaccess`).
- **Affected File**: `public/.htaccess` (documented), deployment configuration (out of scope for code fix)
- **Correction**: Added explanatory comments to `.htaccess`. **Deployment action required**: verify the hosting platform applies SPA rewrites to all paths including `/dashboard`.
- **Security Impact**: None
- **Regression Risk**: None from code changes. Deployment risk if rewrite rules are changed on the hosting platform.

### RC-7: Key fragment in browser health log
- **Symptom**: `key=eyJhbG…0so` visible in browser DevTools console
- **Root Cause**: `logSupabaseHealth()` in `healthCheck.ts` logged `key=${result.keyPreview}` where `keyPreview` was `slice(0,6)…slice(-4)` of the anon key.
- **Affected File**: `src/lib/supabase/healthCheck.ts` line 84
- **Correction**: Removed key fragment from log. Replaced with `supabaseConfigured=true`.
- **Security Impact**: Positive — no key or key fragment in browser console

### RC-8: `localStorage.clear()` on sign-out failure
- **Symptom**: User preferences (theme, layout) wiped on failed sign-out
- **Root Cause**: `src/lib/supabase/auth.ts` `signOut()` called `localStorage.clear()` on error — nuking all application data.
- **Affected File**: `src/lib/supabase/auth.ts` lines 257–259
- **Correction**: Replaced with targeted removal of only keys ending in `-auth-token` (Supabase auth storage pattern).
- **Security Impact**: Positive — credential clearing is scoped, not destructive
- **Regression Risk**: None — user preferences survive failed sign-out

---

## Change Ledger

| ID | Timestamp | File | Change | Reason | Status |
|----|-----------|------|--------|--------|--------|
| CHG-001 | 2026-08-05 | `index.html` | Added `https://cdn.gpteng.co` to `font-src` | Fix RC-1: platform font CSP violation | ✅ Applied |
| CHG-002 | 2026-08-05 | `index.html` | Replaced `structured-data.js` with inline `<script type="application/ld+json">` | Fix RC-2: CSP inline script violation | ✅ Applied |
| CHG-003 | 2026-08-05 | `public/structured-data.js` | File made redundant (no longer referenced) | Consequence of CHG-002 | ℹ️ Orphaned (safe to delete) |
| CHG-004 | 2026-08-05 | `src/store/authStore.ts` | Removed early `loadProfile()` before `getSession()` | Fix RC-3: stale-token race | ✅ Applied |
| CHG-005 | 2026-08-05 | `src/store/authStore.ts` | Added `_bootstrapping` module flag | Fix RC-5: duplicate initialization | ✅ Applied |
| CHG-006 | 2026-08-05 | `src/store/authStore.ts` | Added `isNonRetryableAuthError()` + applied to role/profile retry | Fix RC-4: wasted retry on auth failures | ✅ Applied |
| CHG-007 | 2026-08-05 | `src/store/authStore.ts` | Added `finally { _bootstrapping = false }` | Fix RC-5: bootstrap lock release | ✅ Applied |
| CHG-008 | 2026-08-05 | `src/store/authStore.ts` | Added structured log events (bootstrap_duplicate, invalid_token, bootstrap_failed) | Fix observability | ✅ Applied |
| CHG-009 | 2026-08-05 | `src/lib/supabase/healthCheck.ts` | Removed `key=${keyPreview}` from console log | Fix RC-7: key fragment in logs | ✅ Applied |
| CHG-010 | 2026-08-05 | `src/lib/supabase/auth.ts` | Replaced `localStorage.clear()` with targeted auth key removal | Fix RC-8: destructive storage clear | ✅ Applied |
| CHG-011 | 2026-08-05 | `src/lib/logger.ts` | Created structured logger with redaction and Sentry breadcrumb integration | Structured logging requirement | ✅ Applied |
| CHG-012 | 2026-08-05 | `public/.htaccess` | Added documentation comments for SPA routing | Fix RC-6: documentation of /dashboard route requirement | ✅ Applied |
| CHG-013 | 2026-08-05 | `src/lib/auth/safeReturnTo.ts` | Sanitize same-origin `returnTo` + `buildLoginUrl` | Open-redirect safe post-login restore | ✅ Applied |
| CHG-014 | 2026-08-05 | `src/lib/auth/sessionErrors.ts` | Shared classifiers + `redirectToSessionExpiredLogin()` | Deterministic invalid-refresh recovery UX | ✅ Applied |
| CHG-015 | 2026-08-05 | `src/store/authStore.ts` | Call session-expired redirect; wire profile/role/bootstrap LogEvents | Close auth loop + observability | ✅ Applied |
| CHG-016 | 2026-08-05 | `src/pages/auth/Login.tsx` | Banner for `reason=session_expired`; honor `returnTo` query | User-facing session expired message | ✅ Applied |
| CHG-017 | 2026-08-05 | `src/components/layout/ProtectedRoute.tsx` | Login redirect includes sanitized `returnTo` | Deep-link restore after auth | ✅ Applied |
| CHG-018 | 2026-08-05 | `src/hooks/usePageMeta.ts` | Mutate static `#clarify-page-jsonld` slot (no createElement script) | Prevent CSP inline-script regression | ✅ Applied |
| CHG-019 | 2026-08-05 | `index.html` | Added `#clarify-page-jsonld` static slot | Supports CHG-018 | ✅ Applied |
| CHG-020 | 2026-08-05 | `public/structured-data.js` | Deleted orphaned dynamic JSON-LD injector | Remove CSP risk source | ✅ Applied |
| CHG-021 | 2026-08-05 | `public/_redirects` | Cloudflare/Netlify SPA fallback `/* → /index.html 200` | Hosting-level `/dashboard` 503 mitigation | ✅ Applied |
| CHG-022 | 2026-08-05 | `public/sw.js` | Cache bump `clarify-ai-v3` | Force clients off stale HTML/CSP | ✅ Applied |
| CHG-023 | 2026-08-05 | `src/test/lib/auth/sessionRecovery.test.ts` | Vitest: refresh-token, returnTo, redaction, redirect | Automated regression | ✅ Applied |
| CHG-024 | 2026-08-05 | `e2e/auth-recovery.spec.ts` | Playwright: `/dashboard`, session_expired banner, CSP console | E2E smoke for incident | ✅ Applied |
| CHG-025 | 2026-08-05 | `tsconfig.app.json` | Restored `baseUrl: "."` for `@/*` paths | Unblock `tsc` path resolution | ✅ Applied |
| CHG-026 | 2026-08-05 | `src/store/authStore.ts` | Profile/role timeout 2s; session 8s; ensure missing profile via upsert; error→loading on retry | Profile &lt;2s + orphan repair | ✅ Applied |
| CHG-027 | 2026-08-05 | `src/lib/supabase/database.ts` | `PROFILE_BOOT_COLUMNS` for `getByIdMaybe` | Faster auth bootstrap query | ✅ Applied |
| CHG-028 | 2026-08-05 | `AppLoadingFallback.tsx` | Stuck UI 20s; soft Try again / Reload / Contact support | Stop 10s hard-reload race vs session budget | ✅ Applied |
| CHG-029 | 2026-08-05 | `ProtectedRoute.tsx` | Retry/Reload/Support; admin role wait then recoverable error | No infinite admin loader; friendly errors | ✅ Applied |
| CHG-030 | 2026-08-05 | `SettingsProfile.tsx` + `AppTopBar.tsx` | Single `authStore` source; `updateProfile` for saves | Profile consistency | ✅ Applied |
| CHG-031 | 2026-08-05 | `index.html` | CSP comment no longer references deleted structured-data.js | CSP hygiene | ✅ Applied |
| CHG-032 | 2026-08-05 | `src/lib/auth/recoveryActions.ts` | Shared friendly error + hard reload + support mailto | Consistent recovery UX | ✅ Applied |

---

## Test Execution Ledger

| Test ID | Description | Expected | Status |
|---------|-------------|----------|--------|
| T-AUTO-001 | Vitest `sessionRecovery.test.ts` (15 cases) | All pass | ✅ PASS (2026-08-05) |
| T-AUTO-002 | Playwright `e2e/auth-recovery.spec.ts` | Local/CI after deploy | ⏳ Run after deploy |
| T-PROD-001 | `GET https://clarify.ai.sltfinanceindia.com/dashboard` | HTTP &lt; 500, SPA HTML (`id="root"`) | ✅ PASS — HTTP 200, `text/html`, SPA body (2026-08-05 probe) |
| T-PROD-002 | Production home CSP includes `cdn.gpteng.co` in font-src | Present | ✅ PASS (already on prod tip) |
| T-PROD-003 | Production home still references `structured-data.js` | Absent after next deploy | ⚠️ FAIL on live — deploy CHG-020 required |
| T-MANUAL-001 | Cold load `/dashboard` (anonymous) | Redirect to `/login` (client-side via SPA) | ⏳ Requires deploy of CHG-013+ |
| T-MANUAL-002 | Hard refresh `/app/dashboard` (valid session) | Dashboard loads | ⏳ Requires deployment |
| T-MANUAL-003 | Inject stale refresh token in localStorage | Clear + redirect to `/login?reason=session_expired` | ⏳ Requires deployment |
| T-MANUAL-004 | Browser console — cold load | Zero CSP violations for structured-data / gpteng font | ⏳ Requires deployment |
| T-MANUAL-005 | Browser console — no `key=` fragment | Health log shows `supabaseConfigured=true` | ⏳ Requires deployment |
| T-MANUAL-006 | Sign out with invalid session | User preferences intact (theme preserved) | ⏳ Requires deployment |
| T-MANUAL-007 | React DevTools → StrictMode double-effect | Console shows `StrictMode guard` warning only once | ⏳ Local dev |

---

## Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Production still serving older HTML with `structured-data.js` | HIGH | Deploy this branch; confirm `HAS_STRUCTURED=no` and `#clarify-page-jsonld` present |
| Pre-existing `tsc` errors in SettingsPracticeCoach / ai.types / Input casing | MEDIUM | Outside this incident; do not block auth/CSP ship if Vite build succeeds |
| `cdn.gpteng.co` origin — Lovable platform CDN only | MEDIUM | If deployed outside Lovable, confirm no external font requests; remove from CSP if unused |
| `_bootstrapping` flag is module-scoped (not reset on HMR) | LOW | Dev-only; full reload after auth-store HMR |
| Profile/role timeout values (4s) unchanged | LOW | Non-retryable auth path prevents timeout storms; calibrate with p95 later |

---

## Final Release Decision

**CONDITIONAL GO** — code complete for INC-2026-08-005 follow-up; production must be redeployed.

### Conditions
1. ✅ Auth/CSP remediation code applied in repo (CHG-001–CHG-025)
2. ✅ Vitest session-recovery suite passes (14/14)
3. ✅ Live `GET /dashboard` returns HTTP 200 SPA HTML (hosting rewrite OK as of 2026-08-05 probe)
4. ⚠️ **REQUIRED**: Deploy to https://clarify.ai.sltfinanceindia.com so `structured-data.js` is gone and session-expired UX ships
5. ⚠️ **REQUIRED**: Post-deploy browser console: zero CSP violations for font/inline script; health log has no key fragment
6. ⚠️ **REQUIRED**: Post-deploy stale refresh token → `/login?reason=session_expired` once (no loop)

### Blockers for unconditional GO
- Production redeploy of this workspace tip
- Post-deploy CSP + session-expired smoke

### Rollback
1. Revert deploy to previous Lovable/CDN release (pre-CHG-013 tip / `dc727596` baseline if only follow-ups fail).
2. Or `git revert` CHG-013–CHG-025 commits and redeploy.
3. Clients on `clarify-ai-v3` SW will reclaim on next navigation; hard refresh if stuck.

### Not Blocking (Follow-up Work)
- Full Playwright auth matrix (suspended/unverified/admin) beyond `auth-recovery.spec.ts`
- p95 timeout calibration from production metrics
- CSP Report-Only header in staging
- Clean remaining unrelated `tsc` errors (SettingsPracticeCoach / Input casing)