# Career Pilot — Master Production Stabilization Release

| Field | Value |
|-------|-------|
| **Release ID** | REL-2026-08-05-STAB |
| **Supersedes** | INC-2026-08-005 follow-up (CHG-001–CHG-025+) |
| **Environment** | Production target: https://clarify.ai.sltfinanceindia.com |
| **Supabase** | qzgvjrvtkwlzxpmlddkx (ACTIVE_HEALTHY) |
| **Date** | 2026-08-05 |
| **Decision** | **CONDITIONAL GO** — ship this tip; unblock after post-deploy smoke |

---

## 1. Root Cause Analysis (consolidated)

| ID | Symptom | Root cause | Fix |
|----|---------|------------|-----|
| RC-1 | CSP blocks gpteng font | `font-src` lacked CDN | Allow `https://cdn.gpteng.co` only |
| RC-2 | CSP blocks inline script | Dynamic JSON-LD via `createElement('script')` | Static `application/ld+json` + `#clarify-page-jsonld` |
| RC-3 | Invalid refresh token storms | Profile load before `getSession()` on stale JWT | Profile only after validated session |
| RC-4 | Profile/role timeout loops | Retries on non-retryable auth errors | Shared `isNonRetryableAuthError()` |
| RC-5 | Duplicate auth init | StrictMode double `initialize()` | `_bootstrapping` lock; release after listener attach |
| RC-6 | `/dashboard` 503 | Host SPA rewrite gaps | `_redirects` + `.htaccess` docs |
| RC-7 | Key fragment in console | Health log printed key preview | Removed |
| RC-8 | Preferences wiped on sign-out fail | `localStorage.clear()` | Targeted auth-token key removal |
| RC-9 | Profile mismatch TopBar/Settings | Imports from wrong store path historically; Settings used direct update | Canonical `authStore` + `updateProfile()` sync |
| RC-10 | Soft retry hard-reloaded too early | 10s stuck UI vs longer auth budget | Soft retry + 20s stuck budget |
| RC-11 | Electron session-expired miss | Hash-router path not recognized | `resolveAppPath()` for `/#/app/...` |
| RC-12 | Admin ignored `returnTo` | Always `/app/admin` | Honor explicit `returnTo` |
| RC-13 | Bootstrap lock stuck on profile fail | Early `return` skipped listener/`finally` | Continue to listener + release lock |

---

## 2. Dependency map

```
Browser
  → index.html (CSP, JSON-LD, theme-init, splash)
  → main.tsx → bootstrap.tsx (Sentry/PostHog/SW/health)
  → App.tsx → authStore.initialize()
  → Supabase client (env → integrations/supabase/client)
  → Session recovery (getSession → clear stale → session_expired login)
  → Authentication (email/OAuth/MFA)
  → Profile (profilesDB, inFlight dedupe, upsert repair)
  → Roles (user_roles / has_role, unresolved ≠ deny)
  → Organization / Subscription (profiles.plan_id + subscriptions)
  → Dashboard + feature modules (Mock, Practice, Answers, Reports, Live, Admin)
```

---

## 3. Files modified (this stabilization tip)

### Auth / session
- `src/store/authStore.ts`
- `src/lib/auth/sessionErrors.ts`
- `src/lib/auth/safeReturnTo.ts`
- `src/lib/auth/recoveryActions.ts`
- `src/pages/auth/Login.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/components/layout/AppLoadingFallback.tsx`

### Profile sync
- `src/pages/app/settings/SettingsProfile.tsx`
- `src/components/layout/AppTopBar.tsx`

### Security / hosting
- `index.html`
- `public/structured-data.js` (deleted)
- `public/_redirects` (new)
- `public/sw.js` (`clarify-ai-v4`)
- `src/hooks/usePageMeta.ts`
- `src/lib/logger.ts`

### Tests / config / docs
- `src/test/lib/auth/sessionRecovery.test.ts`
- `e2e/auth-recovery.spec.ts`
- `tsconfig.app.json`
- `docs/qa/incidents/*`

---

## 4. Database changes

**None required for this release.**

Validated live (2026-08-05):

| Check | Result |
|-------|--------|
| auth.users | 13 |
| profiles | 13 |
| orphan profiles | 0 |
| users missing profile | 0 |
| duplicate profile ids | 0 |
| subscriptions | 13 (1:1 with profiles) |
| orphan subscriptions | 0 |
| user_roles | 2 |
| RLS on public tables | enabled |
| Indexes on profiles / subscriptions / roles / credit_transactions | present |

Notes:
- Legacy `public.credits` has 1 row; live balances use `profiles.credits`.
- `bulk_update_users` is SECURITY DEFINER but **admin-gated** via `has_role(...,'admin')`.
- Advisors: enable Auth leaked-password protection (ops); `idempotency_log` / `rate_limit_buckets` RLS-without-policy is intentional deny-all for client roles.

---

## 5. API changes

No Edge Function contract changes. Client session recovery no longer fires profile PostgREST calls on stale refresh tokens.

---

## 6. Authentication changes

- Validated session before profile/role reads
- Invalid refresh → local sign-out → `/login?reason=session_expired&returnTo=...`
- Profile load dedupe (`inFlightProfileLoad`)
- Timeouts: session 8s web / 10s Electron; profile 2s × ≤2; role 2s × ≤2
- ProtectedRoute: Try again / Reload / Support; admin wait 8s then recoverable error
- Login honors `returnTo`; default admin home only when no return path

---

## 7. Security changes

- No `unsafe-inline` in `script-src`
- No CSP wildcards for scripts/connect
- JSON-LD static only
- Logger redacts passwords/tokens/email
- RLS remains enabled (never disabled)
- Service role key not exposed to client

---

## 8. Performance improvements

- Shorter profile/role budgets (target &lt;2s under healthy load)
- Skip wasted retries on auth failures
- Deduped profile loads
- Soft stuck UI at 20s (avoids interrupting legitimate bootstrap)

---

## 9. QA / test evidence

| Suite | Result |
|-------|--------|
| Vitest full | **374 / 374 PASS** |
| sessionRecovery | **17 / 17 PASS** |
| `npm run build` | **PASS** |
| Prod probe `/dashboard` | HTTP **200** SPA HTML |
| Prod probe public routes | All probed paths **200** (SPA fallback) |
| Prod `structured-data.js` | Still **present** on live until this tip deploys |
| Playwright `e2e/auth-recovery.spec.ts` | Run post-deploy against production/preview |

---

## 10. Deployment steps

1. Merge/push this tip to the branch Lovable/CDN watches (typically `main`).
2. Confirm build injects real `VITE_SUPABASE_URL` / anon key (`npm run verify:dist-env` on the deploy machine).
3. Wait for CDN publish; hard-refresh or rely on `clarify-ai-v4` SW bump.
4. Post-deploy smoke (below).
5. If smoke fails → rollback.

---

## 11. Rollback plan

1. Redeploy previous known-good Lovable/CDN build (`dc727596` baseline or last green tip before CHG-013).
2. Or `git revert` stabilization commits and push.
3. Clients: hard refresh if SW stuck; cache name `clarify-ai-v4` forces reclaim on activate.

---

## 12. Production monitoring plan

- Sentry: auth/bootstrap/profile error rates
- Supabase Auth logs: refresh_token 400 spike
- Structured client events: `BOOTSTRAP_*`, `AUTH_PROFILE_*`, `AUTH_ROLE_*`, `AUTH_SESSION_RECOVERY_*`
- Synthetic: `/`, `/login`, `/dashboard`, `/app/dashboard` every 5 min (status &lt; 500, HTML contains `id="root"`)
- Alert if profile timeout events &gt; N/5min

---

## 13. Post-deploy smoke checklist

- [ ] Home HTML: `structured-data.js` **absent**; `#clarify-page-jsonld` **present**
- [ ] Console: no CSP violations for structured-data / gpteng font
- [ ] Health log: no `key=` fragment
- [ ] Login Pro QA → dashboard &lt; ~2s feel
- [ ] Hard refresh `/app/dashboard` keeps session
- [ ] Stale refresh token → one redirect to `/login?reason=session_expired` (no loop)
- [ ] Settings profile save updates sidebar/topbar
- [ ] Admin login with `returnTo=/app/dashboard` lands on dashboard

---

## 14. Final release decision

**CONDITIONAL GO**

Ship this tip now. Unconditional GO only after post-deploy smoke items above pass.

**Blockers removed in code:** auth loops, CSP JSON-LD injection, profile lock stuck on failure, TopBar/Settings store sync, Electron session-expired path.

**Remaining external blocker:** production CDN still serving pre-tip HTML until deploy completes.
