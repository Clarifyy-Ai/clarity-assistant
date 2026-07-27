# RELEASE_NOTES_v1.0.0.md — Clarify AI closed beta

## Scope

Clarify AI v1.0.0 is a **consumer interview-preparation** product for a paid closed beta (target 100–1,000 users).

It is **not** an HRIS, workforce platform, multi-tenant organization suite, SSO/SCIM product, or Rooms collaboration platform.

## Security remediations included

- Atomic fail-closed credit deduction (no unlimited / -1 bypass)
- Distributed rate limits on hot paths; all Edge Function handlers migrated off sync in-memory limits
- `requireCapability` wired on all 16 catalog-mapped AI Edge Functions
- Stripe/Razorpay grant ordering and idempotency hardening
- `deduct_credits` EXECUTE revoked from `authenticated` (Edge Function only) — migration pending apply
- BYOK client remnants removed; legacy DB values nulled via migration
- Electron stealth opt-in; CSP tightened for production scripts

## Billing safeguards

- Canonical billing catalog (plan_id, credits, price env keys, Max display name)
- Production config validator rejects missing/placeholder/test keys when `APP_ENV=production`
- Checkout allowlist built from **active** catalog entries only
- Webhooks derive pack credits from catalog pack id (ignore client amounts)
- Production rejects Stripe `livemode=false` events

## Supported platforms (closed beta)

- **Web:** supported (verified build)
- **Electron Windows:** build verified locally; platform smoke **not executed**
- **Electron macOS / Linux:** not verified for this release

## Unsupported platforms

- Enterprise org / SSO / SCIM / SAML
- Rooms collaboration
- HRIS / workforce / seat management

## Desktop limitations

- Companion overlay is a standard Electron window with global shortcuts
- Cross-platform smoke must be executed per `docs/ELECTRON_SMOKE_CHECKLIST.md` before claiming platform support

## Deprecated Rooms

- UI pages removed; `/app/rooms/*` redirects to dashboard
- Do not market or revive Rooms in this release

## Consumer-only positioning

- Stored `plan_id` `enterprise` remains for compatibility
- Public display name: **Max** (high-credit consumer tier)
- No org seats, SSO, or workforce features

## Known limitations

- Mass-market 10,000+ users: **not ready** (no load-test evidence)
- Enterprise org/SSO: **NO-GO** (not in product scope)
- Monitoring alerts require external provider wiring
- Live billing secrets must be validated with `billing-config-preflight.mjs` in the ops environment

## Scale boundary

Closed beta acceptance targets (to be measured in staging):

- p95 API (non-AI) < 800ms
- Error rate < 1% excluding upstream AI
- Webhook grant latency < 30s p95
- Zero duplicate credit grants per provider payment id
