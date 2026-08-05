# QA-041 — Password Reset Email Missing CTA / "Connection Refused"

## Incident Metadata

| Field | Value |
|-------|-------|
| **Ticket** | QA-041 |
| **Detected** | 2026-08-05 |
| **Environment** | Production / misconfigured preview builds |
| **Affected flow** | Forgot password → reset email → `/reset-password` |
| **Supabase Project** | `qzgvjrvtkwlzxpmlddkx` (Clarify.AI) |
| **Severity** | P1 — users cannot recover locked-out accounts |
| **Status** | Code fix shipped (this change). Ops steps below must still be verified in the Supabase Dashboard. |
| **Related** | `2026-08-qa-basic-bugfixes.md` (QA-040 / BUG-06, BUG-02 — first pass at this same class of bug) |

---

## Root Cause

Two separate problems combined to produce "missing CTA" and "connection refused":

### 1. `redirectTo` could bake a broken/localhost origin into production emails (code bug — fixed here)

`sendPasswordReset()` in both `src/store/authStore.ts` and `src/lib/supabase/auth.ts` built the
redirect URL as:

```ts
const configured = String(import.meta.env.VITE_APP_URL ?? "").replace(/\/$/, "");
const origin = configured || window.location.origin;
redirectTo: `${origin}/reset-password`
```

`VITE_APP_URL` is inlined into the JS bundle **at build time** (Vite). `.env.example` defaults it to
`http://localhost:5173`. If a production/preview build is ever produced without the production
env file properly injected (wrong `.env` picked up by CI, a Lovable/Cloudflare deploy that didn't
get `VITE_APP_URL` set per `docs/QA_ENVIRONMENTS.md`, etc.), the bundle ships with
`VITE_APP_URL=http://localhost:5173` baked in — **and the old code preferred that value over
`window.location.origin`**, even though the page was correctly being served from the real
production domain. The result: `resetPasswordForEmail({ redirectTo: "http://localhost:5173/reset-password" })`
is sent to Supabase Auth, which puts that broken URL in the email's `{{ .ConfirmationURL }}`. The
recipient's browser then tries to open `http://localhost:5173/...` on their own machine →
**connection refused**.

**Fix:** added a pure, unit-tested helper, `buildAuthRedirectUrl()`
(`src/lib/auth/redirectUrl.ts`), used by both call sites. Priority order:

1. `VITE_APP_URL`, **unless** it resolves to `localhost` / `127.0.0.1` / `0.0.0.0` / `::1` while
   `VITE_APP_ENV=production` — a misconfigured build must never leak a loopback address into a
   production email.
2. The known production URL (`https://clarify.ai.sltfinanceindia.com`) when `VITE_APP_ENV=production`
   and `VITE_APP_URL` is missing/invalid.
3. `window.location.origin` (safe to trust outside of production — local dev, preview branches).
4. The known production URL as a last-resort default (never throws, never emits a bare/relative
   URL to Supabase).

### 2. "Missing CTA" is a Supabase Dashboard email template issue, not a code issue

Password reset emails are sent by **Supabase Auth** directly (SMTP + the "Reset Password" email
template), not by the app's `send-email` Edge Function. Confirmed by reading
`supabase/functions/send-email/index.ts`: `ALLOWED_TYPES` only covers product/marketing email
(`welcome`, `debrief_ready`, `low_credits`, etc.) and the function requires an authenticated JWT —
a password-reset requester is, by definition, not authenticated, so it structurally cannot call
this function. This matches the prior QA-040 finding.

If the Dashboard's "Reset Password" template doesn't render `{{ .ConfirmationURL }}` inside a
visible button/link (e.g. the template was reset to Supabase's minimal default, or edited without
the CTA markup), the email can arrive with no clickable call-to-action even when `redirectTo` is
correct. This is an **ops/config item**, not something `git` can fix — see checklist below.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/auth/redirectUrl.ts` | **New.** Pure `buildAuthRedirectUrl()` / `isLocalhostUrl()` helpers + `PRODUCTION_APP_URL` constant. |
| `src/test/lib/auth/redirectUrl.test.ts` | **New.** Unit tests covering the QA-041 regression (localhost leak in prod, missing `VITE_APP_URL` in prod, dev fallback to `window.location.origin`, malformed/non-http(s) URLs). |
| `src/store/authStore.ts` | `sendPasswordReset()` now calls `buildAuthRedirectUrl()` instead of ad-hoc string concatenation. |
| `src/lib/supabase/auth.ts` | Same fix for the lower-level `sendPasswordReset()` helper (kept for API parity / non-store callers). |
| `src/pages/auth/ResetPassword.tsx` | UX: detect Supabase's `#error=...&error_code=otp_expired...` (or query-param equivalent) params that Auth appends for expired/already-used/invalid recovery links, and show a specific "This reset link has expired. Please request a new one." message instead of silently dropping the user on a blank request form. |
| `docs/qa/incidents/2026-08-05-qa-041-password-reset-redirect.md` | This file. |

No changes were needed in `supabase/functions/send-email/index.ts` — it is intentionally not used
for credential emails (see Root Cause #2).

---

## Ops Checklist — Supabase Dashboard (must be done manually; not exposed via MCP/API)

The Supabase MCP server available in this workspace (`plugin-supabase-supabase`) does not expose
Auth email templates, SMTP settings, or the redirect URL allowlist — those are Dashboard-only
(GoTrue platform config, not a Postgres table reachable via `execute_sql`). `list_projects` was
used only to confirm the project reference (`qzgvjrvtkwlzxpmlddkx`, org `Clarify.AI`) matches
`.env.production`; no secrets were read or printed.

Verify/apply the following in **Supabase Dashboard → Authentication**:

1. **URL Configuration**
   - Site URL: `https://clarify.ai.sltfinanceindia.com`
   - Redirect URLs allowlist includes (exact matches, no trailing slash mismatches):
     - `https://clarify.ai.sltfinanceindia.com/reset-password`
     - `https://clarify.ai.sltfinanceindia.com/auth/callback`
     - Local dev, if needed for testing: `http://localhost:5173/reset-password`
   - Supabase rejects `resetPasswordForEmail({ redirectTo })` values not on this allowlist — if the
     allowlist is stale, this fix alone won't be enough.

2. **Email Templates → Reset Password**
   - Confirm the template body contains a real `<a>` CTA using `{{ .ConfirmationURL }}`, e.g.
     `<a href="{{ .ConfirmationURL }}">Reset your password</a>` — not just a bare text link or a
     variable reference with no surrounding markup.
   - Prefer branding it to match `send-email`'s dark/violet theme (see
     `supabase/functions/send-email/index.ts` → `renderTemplate()` for the palette) so security
     emails feel consistent with product emails.

3. **SMTP Settings** (recommended, not yet done per `2026-08-qa-basic-bugfixes.md`)
   - Configure custom SMTP (e.g. Resend) so the `From:` address is a Clarify AI domain instead of
     Supabase's shared default sender — improves deliverability and reduces spam-folder risk.

4. **After any Dashboard change:** send a real test reset email to a QA inbox and click through —
   template changes and allowlist changes do not require a redeploy, but they also aren't visible
   from the codebase, so this incident doc is the source of truth until Supabase exposes them via
   API.

5. **After any app deploy:** confirm the deploy pipeline actually injected
   `VITE_APP_URL=https://clarify.ai.sltfinanceindia.com` and `VITE_APP_ENV=production` before
   building — see `docs/QA_ENVIRONMENTS.md` → "Lovable deploy checklist". This code fix is a
   safety net (it will now self-correct to the production URL even if that step is skipped), not a
   substitute for setting the env vars correctly.

---

## How to Verify QA-041

### Automated
```bash
npx vitest run src/test/lib/auth/redirectUrl.test.ts
```
All 13 cases should pass, including the two QA-041 regression cases (`VITE_APP_URL` = localhost in
prod, and `VITE_APP_URL` missing entirely in prod) resolving to
`https://clarify.ai.sltfinanceindia.com/reset-password`.

### Manual — Production
1. Go to `https://clarify.ai.sltfinanceindia.com/login` → "Forgot password?".
2. Submit a real inbox you control.
3. Open the email:
   - CTA button/link is visible and Clarify-branded (Dashboard template check).
   - Hover/inspect the link target — must be
     `https://clarify.ai.sltfinanceindia.com/reset-password?...` (never `localhost`).
4. Click the link → lands on `/reset-password`, phase 2 ("Set new password") renders without
   error, and the new password can be set.
5. Re-click the **same** email link a second time (simulating an expired/used token) → should show
   "This reset link has expired. Please request a new one." instead of a blank/broken screen.

### Manual — Regression guard for a misconfigured build
1. Locally: `VITE_APP_URL=http://localhost:5173 VITE_APP_ENV=production npm run build`.
2. Serve the `dist/` bundle from any origin (e.g. `npx serve dist`) and trigger "Forgot password?".
3. Confirm (via network inspector or Supabase Auth logs) that `redirectTo` sent to
   `resetPasswordForEmail` is `https://clarify.ai.sltfinanceindia.com/reset-password`, **not**
   `http://localhost:5173/reset-password` — proving the production fallback engaged correctly.
