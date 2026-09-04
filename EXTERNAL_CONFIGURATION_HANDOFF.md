# External configuration handoff

Career Pilot adapters, validation, UI disabled states, and tests are implemented in-repo.
Do not commit secret values. Until a row is smoke-tested with a real key, its status remains `IMPLEMENTED_REQUIRES_EXTERNAL_CONFIGURATION`.

Owner for all rows unless noted: product owner / ops.

| Variable / secret | Provider | Purpose | Required environment | Where to configure | Callback / webhook | Scopes | Validation | Smoke test | Failure when missing | Rotation | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Supabase | Public API URL | All | Hosting env + `.env.local` | n/a | n/a | `npm run validate-env` | App loads | Build/runtime fail | Rotate project | Ops |
| `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase | Public client key | All | Hosting env | n/a | n/a | `npm run validate-env` | Login page | Auth unavailable | Dashboard keys | Ops |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Edge privileged DB | Edge | Edge Function secrets | n/a | service_role | Never print | Deployed function writes `payment_orders` | Functions 500 | Dashboard | Ops |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Razorpay | One-time checkout | Production + staging | Edge secrets | `.../functions/v1/razorpay-webhook` | Orders, payments, webhooks | `npm run billing:preflight` | Create order → row in `payment_orders` → webhook fulfill | Checkout shows Integration not configured | Dashboard keys | Billing owner |
| `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` | Google | Default AI | Production | Edge secrets | n/a | Generative Language | Admin `ai-key-check` (JWT) | One Practice Coach hint | AI actions: Integration not configured | Console | AI owner |
| `OPENAI_API_KEY` | OpenAI | Optional model | Production | Edge secrets | n/a | Chat | Admin diagnostics | Optional model call | Provider hidden | Console | AI owner |
| `ANTHROPIC_API_KEY` | Anthropic | Optional model | Production | Edge secrets | n/a | Messages | Admin diagnostics | Optional model call | Provider hidden | Console | AI owner |
| `DEEPGRAM_API_KEY` | Deepgram | Live transcription | Production | Edge secrets | n/a | Listen | Overlay token | Overlay transcript | Text fallback | Console | AI owner |
| `HOSTINGER_MAIL_API_TOKEN` / `HOSTINGER_MAIL_ADDRESS` | Hostinger Mail API | Product mail + admin mailbox (`hello@trycareerpilot.com`) | Production + staging | Edge secrets only (never `VITE_*` or git) | n/a | Mail send / inbox | Admin `/app/admin/mail` status | Send test + open inbox | `send-email` falls back to Resend or 503 | Rotate in Hostinger panel after any paste | Ops |
| `HOSTINGER_SMTP_PASSWORD` | Hostinger mailbox | **Supabase Auth SMTP** (signup confirm / resend / password reset / magic link) | Production + staging | Supabase Auth custom SMTP via `npm run mail:configure-hostinger` (never git / never `VITE_*`) | n/a | SMTP AUTH | `npm run mail:verify-smtp` | Fresh signup → inbox within 30s | Auth confirmation never arrives (product REST mail can still work) | Rotate mailbox password + re-run configure | Ops |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Resend | Transactional email fallback | Production | Edge secrets | n/a | Mail send | Send test | Product mail only — Auth SMTP is separate | Email disabled if Hostinger also unset | Console | Ops |
| `VITE_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Sentry | Errors | Production | Hosting + CI | n/a | ingest + sourcemaps | Test event | Event in Sentry | No crash reporting | Rotate DSN | Ops |
| `VITE_POSTHOG_KEY` | PostHog | Product analytics | Production | Hosting | n/a | capture | Consent on | One event | Analytics off | Rotate key | Ops |
| Google / GitHub / LinkedIn / Azure OAuth client IDs | Auth providers | Social login | Production | Supabase Auth providers | `{SUPABASE_URL}/auth/v1/callback` | openid email profile | Login button | Complete OAuth | Provider hidden | Rotate client secret | Auth owner |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (aliases `GOOGLE_OAUTH_*`, `GOOGLE_CALENDAR_*`) | Google Cloud | **Calendar Connect** (not Sign-In) | Production + staging | Edge secrets only | `https://trycareerpilot.com/app/settings/calendar-callback` | `calendar.events` + `email` | Connect → Connected | Settings → Integrations Connect | Requires Configuration / 501 | Rotate client | Integrations owner |
| `GOOGLE_CALENDAR_PUBLIC_OAUTH` | Ops | Soft-gate Connect until Google verification | Production + staging | Edge secret (`true`/`false`, default false) | — | — | Probe `connectAllowed` | Connect for entitled Pro | Coming soon / `OAUTH_NOT_PUBLIC` | Set `true` only after verification | Integrations owner |
| `GOOGLE_CALENDAR_TEST_USERS` | Ops | Allowlist while Testing | Production + staging | Edge secret (comma emails) | — | — | Allowlisted Connect | Same emails as Google Console Test users | Gated for others | Keep in sync with Console | Integrations owner |
| `INGEST_API_KEY` | Internal | `bulk-import-questions` | Production | Edge secrets | n/a | header `x-ingest-key` | Denied without key | Admin import dry-run | Import disabled | Rotate quarterly | Admin |
| Cron secret / `pg_cron` jobs | Supabase | Credit reset, document cleanup | Production | Database cron | n/a | n/a | `cron.job` rows | Dry-run then live | Jobs skipped | Rotate secrets | Ops |
| Electron signing / notarization | Apple / Microsoft | Desktop release | Desktop prod | CI secrets only | n/a | codesign | Signed artifact | Install on clean OS | Public desktop = blocked | Rotate certs | Desktop owner |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` / `VITE_APP_URL` / `VITE_OAUTH_PROVIDERS` | Supabase + GitHub | Electron renderer build (same public keys as web) | Desktop prod | GitHub Actions secrets for **Electron Release** + local `.env` | Auth redirects on **web** origin | n/a | `npm run electron:check-config` | Desktop login + “Open in browser” | Packaged app cannot talk to API | Rotate anon key / project | Desktop owner |
| `ALLOW_ELECTRON_NULL_ORIGIN` | Internal | CORS for Electron `file://` / null origin | Desktop prod | Edge Function secrets (`true`) | n/a | n/a | Edge CORS smoke | Desktop session calls Edge | Browser-origin-only CORS blocks desktop | n/a | Desktop owner |
| `ALLOWED_ORIGINS` / `SITE_URL` / `PUBLIC_URL` | Internal | Edge CORS + public site URLs for desktop companion | Desktop + web prod | Edge secrets (not VITE_) | `{VITE_APP_URL}/auth/callback` | n/a | `npm run qa:sync-secrets` | Web + desktop against same origin list | CORS / redirect failures | n/a | Ops |
| `VITE_DESKTOP_DOWNLOAD_URL_WIN` / `VITE_GITHUB_RELEASE_REPO` | GitHub / CDN | Web “Download” buttons for the `.exe` | Web prod | Hosting env | n/a | public release assets | Installer URL reachable | Download button serves installer | In-app download falls back to install guide | n/a | Desktop owner |
| Leaked-password protection | Supabase Auth | Reject known breached passwords | Production | **Auth dashboard only** (HaveIBeenPwned) | n/a | n/a | Signup with a known pwned password is rejected | Clear user-facing message | Weak passwords accepted | n/a | Auth owner |

## Auth verification email (SMTP — BUG 22)

Signup confirmation is **not** sent by `send-email` / Hostinger Mail REST. It uses Supabase Auth custom SMTP.

1. Set `HOSTINGER_SMTP_PASSWORD` to the mailbox password for `hello@trycareerpilot.com` (not the Mail API token).
2. Run `npm run mail:configure-hostinger` then `npm run mail:verify-smtp` (requires `SUPABASE_ACCESS_TOKEN`).
3. Confirm Site URL `https://trycareerpilot.com` and redirect allowlist includes `/auth/callback`, `/reset-password`, `/login` (`npm run mail:configure-auth`).
4. Full checklist: [`docs/referrals/REFERRAL_VERIFY_EMAIL_OPS.md`](docs/referrals/REFERRAL_VERIFY_EMAIL_OPS.md).

## Leaked-password protection (console operation)

This cannot be enabled from the repository.

1. Open Supabase Dashboard → Authentication → Attack Protection (or Providers → Email).
2. Enable **Leaked password protection**.
3. Confirm signup/password-update with a known compromised password is rejected with a non-technical message.
4. Record evidence in the implementation ledger as `IMPLEMENTED_AND_RUNTIME_VERIFIED` only after that check.

## Google Calendar OAuth (Integrations — not Sign-In)

Distinct from Supabase Google login. Calendar Connect uses Edge secrets `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and sensitive scope `calendar.events`.

While the OAuth consent screen is **Testing** (or the app is unverified), Google returns **403 access_denied** / “has not completed the Google verification process” for accounts that are **not** listed as **Test users**.

Product soft-gate (do not kill FeatureKillGate `calendar_sync`):

1. Leave `GOOGLE_CALENDAR_PUBLIC_OAUTH` unset/`false` until Google verification is published.
2. Google Cloud Console → OAuth consent screen → add every QA Gmail under **Test users**.
3. Set Edge `GOOGLE_CALENDAR_TEST_USERS` to those **same** Career Pilot emails (comma-separated).
4. Enable Calendar API; Web client redirect URI: `https://trycareerpilot.com/app/settings/calendar-callback`.
5. Sync secrets + redeploy `sync-calendar` (`npm run qa:sync-secrets` if rotating).
6. After verification: set `GOOGLE_CALENDAR_PUBLIC_OAUTH=true`, redeploy, re-check Connect for general Pro users.
7. Full steps: [`docs/qa/GOOGLE_CALENDAR_OAUTH.md`](docs/qa/GOOGLE_CALENDAR_OAUTH.md) (**QA-GAP-007**).

Never instruct users to bypass Google security screens. Manual interview scheduling works without Connect.

## Razorpay webhook + secrets (billing lifecycle)

Production checkout with **live** keys (`rzp_live_*`) requires all three Edge secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. For **closed-beta QA sandbox** on `APP_ENV=production`, use `rzp_test_*` plus `RAZORPAY_ALLOW_TEST_KEYS=true`; create-order may proceed without a webhook secret (client verify path). Prefer setting `RAZORPAY_WEBHOOK_SECRET` anyway for `payment.captured` fulfillment. See [`docs/qa/TC_CR_002_TC_BILL_003.md`](docs/qa/TC_CR_002_TC_BILL_003.md).

1. **Dashboard → Razorpay → Settings → Webhooks** — create a webhook pointing to:
   `https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/razorpay-webhook`
2. Enable at least `payment.captured` and `payment.failed`.
3. Copy the webhook signing secret into Supabase Edge secrets as `RAZORPAY_WEBHOOK_SECRET` (`npm run qa:sync-secrets` or Dashboard → Edge Functions → Secrets).
4. Set `PUBLIC_URL` / `SITE_URL` to the production app origin (used for CORS and billing preflight).
5. Ensure `billing_settings.razorpay_enabled = true` with INR paise ≥ 100 per pack.
6. Deploy `razorpay-create-order`, `razorpay-verify-payment`, and `razorpay-webhook` after secret changes (Management API scripts if Docker is unavailable).
7. Verify: `node scripts/billing-catalog-parity.mjs`, `APP_ENV=production npm run billing:preflight`, `npx vitest run src/test/lib/billing/`, and `node scripts/_tmp_billing_deploy_verify.mjs` (secrets + function versions, no values printed).

Client checkout uses Razorpay India sandbox test cards in staging / closed-beta — not Stripe `4242` test cards.

## After keys are added

1. Validate configuration without printing values (`npm run validate-env`, `npm run billing:preflight`).
2. Redeploy affected Edge Functions and the web app.
3. Run provider-specific smoke tests.
4. Update status only after runtime verification.
