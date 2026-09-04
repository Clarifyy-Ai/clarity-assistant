# Provider health matrix (certification gate)

Lightweight readiness checklist for production GO. Update after each deploy / smoke.

| Provider / surface | Config source | Probe | User-facing failure mode | Status |
|--------------------|---------------|-------|--------------------------|--------|
| Supabase Auth | Project Auth URL + redirects | Sign-in / reset-password deep link | Friendly auth errors | Needs live UAT |
| Supabase Edge | Secrets + `config.toml` JWT | `ping`, authenticated EF | Toast / inline retry | Partial |
| Gemini / AI router | Edge: `GOOGLE_API_KEY` → `GEMINI_API_KEY` → `GOOGLE_AI_API_KEY` | `ai-key-check` live + Practice Coach hint/answer | Typed provider errors | **PASS** 2026-09-05 (Tier‑1 live smoke) |
| OpenAI fallback | Edge `OPENAI_API_KEY` | `ai-key-check` / hybrid-health | Fallback on transient only | Optional / format warn |
| Anthropic fallback | Edge `ANTHROPIC_API_KEY` | `ai-key-check` | Fallback on transient only | Missing (optional) |
| Deepgram STT | Edge token EF | Live overlay listen | `audio_unavailable` | Needs UAT |
| Razorpay | Billing + secrets | Order → verify → webhook | Checkout errors | Partial |
| Python paper factory | Render: same Gemini precedence via `resolved_gemini_api_key()` | Gov job / `/ready` | Job failed + retry | Synced |
| Support chat | CORS | Widget connect | Retry | Partial |

## Env checklist (never `VITE_*` for provider secrets)

| Environment | Where | Notes |
|-------------|-------|-------|
| LOCAL | `.env.local` + `npm run qa:sync-secrets` | Maps GOOGLE_/GEMINI_/GOOGLE_AI_ into Edge |
| PRODUCTION Edge | Supabase Edge Secrets | Prefer current Gemini auth keys (`AIza…` / `AQ.…`) |
| PRODUCTION Python | Render env | Same precedence |
| Frontend | `.env.production` | Public Vite only — **no** AI keys |

## GO criteria

1. `npm run qa:verify-gemini` → `edge_gemini_api_ok: true`
2. `node --use-system-ca scripts/check-gemini-via-edge.mjs` → hint + answer + questions `source: ai`
3. Official/PYQ never AI-labeled (`ai_generated_practice` / `official_mode`)
4. No provider secrets in browser bundles

## Current gate

**GO for Gemini product AI paths** (2026-09-05) — Edge redeployed; Practice Coach hint/answer + Mock questions live-proven. Anthropic optional. OpenAI format validation may still warn.

See also: `docs/AI_HUB.md`, `docs/audit/AI_PLATFORM_FOUNDATION.md`.
