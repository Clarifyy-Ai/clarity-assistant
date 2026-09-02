# Feature flags and environment matrix

Reference for QA, deploy, and disabled-integration UX. Plan gates live in [`src/lib/constants/features.ts`](../src/lib/constants/features.ts); runtime resolution in [`src/store/globalStore.ts`](../src/store/globalStore.ts).

## Resolution order (client)

1. **Plan tier** — `FEATURE_PLAN_GATE` vs user `plan_id`
2. **DB kill-switches** — `feature_flags.is_enabled = false` hides only (never grants)
3. **Build env** — selective gates (`VITE_ENABLE_BETA_MODELS`, `VITE_OAUTH_PROVIDERS`, etc.)

Server edge functions enforce kill-switches via [`supabase/functions/_shared/featureKillSwitch.ts`](../../supabase/functions/_shared/featureKillSwitch.ts).

---

## VITE_ build-time variables

| Variable | Default | Environment | Depends on | Disabled behavior |
|----------|---------|-------------|------------|-------------------|
| `VITE_SUPABASE_URL` | dev fallback in `env.ts` | all | Supabase project | Boot failure panel |
| `VITE_SUPABASE_ANON_KEY` | dev fallback | all | Supabase Auth | Boot failure |
| `VITE_OAUTH_PROVIDERS` | `none` | all | Supabase Auth providers | No OAuth buttons; email/password only |
| `VITE_APP_ENV` | `development` | all | — | Razorpay sandbox hints, Sentry env |
| `VITE_APP_URL` | `http://localhost:5173` | all | Auth redirect allowlist | Wrong OAuth redirects |
| `VITE_SCRAPER_URL` | `""` | admin builds | Python scraper + admin role | Admin banner: scraper not configured |
| `VITE_ENABLE_LIVE_TRANSCRIPTION` | implicit `true` | all | `DEEPGRAM_API_KEY` | STT off; chat typing still works |
| `VITE_ENABLE_BETA_MODELS` | `false` | all | plan `beta_models` | `false` hides beta models even when plan allows |
| `VITE_ENABLE_DEBUG_PANEL` | `false` | dev only | plan `debug_panel` | Debug panel off |
| `VITE_STRIPE_PUBLIC_KEY` | `""` | all | — | **Unused** — checkout is Razorpay-only |
| `VITE_POSTHOG_KEY` / `VITE_SENTRY_DSN` | `""` | prod | vendor accounts | Analytics/errors silently skipped |
| `VITE_FORCE_INDIA_REGION` | unset | dev/QA only | — | Ignored in production |
| `VITE_DESKTOP_DOWNLOAD_URL*` | unset | prod | GitHub releases | Toast: installer not published |

---

## Plan-gated feature flags (`FEATURE_FLAGS`)

| Flag | Min plan | Kill-only | Disabled (plan) | Disabled (kill-switch) |
|------|----------|-----------|-----------------|------------------------|
| `live_assist` | free | | Upgrade overlay | "Temporarily unavailable" |
| `mock_sessions` | free | | Upgrade overlay | unavailable |
| `answer_bank` | free | | Upgrade overlay | unavailable |
| `star_builder` | free | | Upgrade overlay | unavailable |
| `rephraser` | free | | Upgrade overlay | unavailable |
| `ai_coach` | free | | Upgrade overlay | unavailable |
| `company_research` | pro | | Upgrade overlay | unavailable |
| `coding_hints` | pro | | Upgrade overlay | unavailable |
| `system_design` | pro | | Upgrade overlay | unavailable |
| `session_debrief` | pro | | Upgrade overlay | unavailable |
| `resume_analysis` | pro | | Upgrade overlay | unavailable |
| `overlay` | pro | | Upgrade overlay | unavailable |
| `audio_analysis` | pro | | Upgrade overlay | unavailable |
| `filler_detection` | pro | | Upgrade overlay | unavailable |
| `wpm_tracking` | pro | | Upgrade overlay | unavailable |
| `diarization` | pro | | Upgrade overlay | unavailable |
| `analytics` | pro | | Upgrade overlay | unavailable |
| `screenshot_capture` | pro | | Upgrade overlay | unavailable |
| `byok` | pro | **yes** | hidden | hidden |
| `calendar_sync` | pro | | Upgrade overlay | unavailable |
| `priority_support` | enterprise | **yes** | hidden | hidden |
| `coach_sessions` | enterprise | **yes** | hidden | hidden |
| `experimental_ui` | pro | | Upgrade overlay | unavailable |
| `debug_panel` | enterprise | | off | unavailable |
| `beta_models` | pro | | Upgrade overlay; also blocked when `VITE_ENABLE_BETA_MODELS=false` | unavailable |
| `mock_test_ai` | pro | | Upgrade modal | unavailable |
| `gov_exam_ai_fill` | pro | | Upgrade / credit gate | unavailable + edge 403 |

UI: [`PlanGate.tsx`](../src/components/layout/PlanGate.tsx), [`AppSidebar.tsx`](../src/components/layout/AppSidebar.tsx).

---

## Edge secrets (server-only)

| Secret | Default (example) | Disabled behavior |
|--------|-------------------|-------------------|
| `RAZORPAY_KEY_ID` / `SECRET` / `WEBHOOK_SECRET` | placeholders | "Payments are not configured…" |
| `GEMINI_API_KEY` | placeholder | AI features fail server-side |
| `DEEPGRAM_API_KEY` | placeholder | Live transcription token fails |
| `GOOGLE_CLIENT_ID` / `SECRET` | unset | Calendar sync disabled button + copy |
| `PYTHON_SERVICE_URL` / `SCRAPER_URL` | empty | Document/gov hybrid fallback |
| `DOCUMENT_INTELLIGENCE_AUTH_SECRET` | empty | Edge→Python HMAC fails |

See [`EXTERNAL_CONFIGURATION_HANDOFF.md`](../../EXTERNAL_CONFIGURATION_HANDOFF.md).

---

## Integration disabled UX (verified)

| Integration | Truthful state |
|-------------|----------------|
| OAuth | Buttons hidden when `VITE_OAUTH_PROVIDERS=none`; misconfig banner when provider errors |
| Google Calendar | Disabled button + "not configured" in Settings / New Interview |
| Razorpay | Checkout guard messages in `razorpayCheckout.ts` |
| Scraper (admin) | `ScraperNotConfiguredError` + inline banner |
| Stripe | Not offered; Razorpay-only messaging |
| Live STT | Error directs user to type in chat |

---

## Ops commands

```bash
node scripts/db-schema-reconcile.mjs --write-docs   # staging schema audit
node scripts/apply-pending-migrations-mgmt.mjs      # apply pending SQL via Management API
npm run qa:deploy-wave:live                         # redeploy edge wave
npm run pre-deploy                                  # filesystem migration + edge inventory
```
