# Platform readiness and 503 recovery (PLAT-001)

## Cold-load dependency classes

| Caller | Critical? | On failure |
|--------|-----------|------------|
| Vite env / Supabase URL+anon | Critical | Failed-to-start / config error |
| Auth session restore | Critical for `/app` | Login redirect |
| Profile / credits | Soft-critical | Inline retry; shell remains |
| `analytics-dashboard` | Optional | InlineErrorRetry; keep last-known data + stale badge |
| Marketing Terms assets | Optional | Page renders; console 503 must not blank page |
| Status page URL | Optional | Mailto support fallback when `VITE_STATUS_PAGE_URL` unset |

## Health endpoints

- Public: `health` → `{ status: "ok" }` (liveness only).
- Privileged deep checks remain on `ping` with service-role auth — never expose secrets.

## Client pattern

Optional Edge failures must use `InlineErrorRetry` and must not replace the entire app shell. Analytics preserves last successful payload and marks it stale until retry succeeds.

## Alerts

Monitor Edge 503 rate for `analytics-dashboard`, `parse-resume`, and gateway timeouts; include function name + correlation/request id in Sentry/log drain (no tokens or PII).

## Analytics rate-limit policy

`analytics-dashboard` is a `controlled_degradation_candidate`: when the distributed rate-limit RPC is unavailable, the function **fails open** (serves data) instead of returning 503. Genuine per-user quota exceeded still returns 429.

## AI provider keys

Product AI (chat, Prep, resume, etc.) requires `GEMINI_API_KEY` on Edge. `AI_PROVIDER_MODE=live` controls Admin Hub provider routing only — it does not gate product AI.
