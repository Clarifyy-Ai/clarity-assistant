# External configuration handoff

Clarify AI adapters, validation, UI disabled states, and tests are implemented in-repo.
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
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Resend | Transactional email | Production | Edge secrets | n/a | Mail send | Send test | Password reset email | Email disabled | Console | Ops |
| `VITE_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Sentry | Errors | Production | Hosting + CI | n/a | ingest + sourcemaps | Test event | Event in Sentry | No crash reporting | Rotate DSN | Ops |
| `VITE_POSTHOG_KEY` | PostHog | Product analytics | Production | Hosting | n/a | capture | Consent on | One event | Analytics off | Rotate key | Ops |
| Google / GitHub / LinkedIn / Azure OAuth client IDs | Auth providers | Social login | Production | Supabase Auth providers | `{SUPABASE_URL}/auth/v1/callback` | openid email profile | Login button | Complete OAuth | Provider hidden | Rotate client secret | Auth owner |
| `INGEST_API_KEY` | Internal | `bulk-import-questions` | Production | Edge secrets | n/a | header `x-ingest-key` | Denied without key | Admin import dry-run | Import disabled | Rotate quarterly | Admin |
| Cron secret / `pg_cron` jobs | Supabase | Credit reset, document cleanup | Production | Database cron | n/a | n/a | `cron.job` rows | Dry-run then live | Jobs skipped | Rotate secrets | Ops |
| Electron signing / notarization | Apple / Microsoft | Desktop release | Desktop prod | CI secrets only | n/a | codesign | Signed artifact | Install on clean OS | Public desktop = blocked | Rotate certs | Desktop owner |
| Leaked-password protection | Supabase Auth | Reject known breached passwords | Production | **Auth dashboard only** (HaveIBeenPwned) | n/a | n/a | Signup with a known pwned password is rejected | Clear user-facing message | Weak passwords accepted | n/a | Auth owner |

## Leaked-password protection (console operation)

This cannot be enabled from the repository.

1. Open Supabase Dashboard → Authentication → Attack Protection (or Providers → Email).
2. Enable **Leaked password protection**.
3. Confirm signup/password-update with a known compromised password is rejected with a non-technical message.
4. Record evidence in the implementation ledger as `IMPLEMENTED_AND_RUNTIME_VERIFIED` only after that check.

## After keys are added

1. Validate configuration without printing values (`npm run validate-env`, `npm run billing:preflight`).
2. Redeploy affected Edge Functions and the web app.
3. Run provider-specific smoke tests.
4. Update status only after runtime verification.
