# AI Hub

Admin-only multi-provider lab + smart routing + free daily tokens + acceleration controls.

## Surface

- UI: `/app/admin/ai-hub` (Admin → System → AI Hub)
- Edge: `ai-hub-router` via `fetchEdgeJson("ai-hub-router", { action, ... })`

Actions: `status` | `estimate` | `run` | `route` | `test-connection` | `update-settings` | `history`

## Cost policy

| Path | Credits ledger | USD ops budget (`ai_hub_settings`) | Free-tier meter |
|------|----------------|------------------------------------|-----------------|
| Free-tier eligible Hub call under daily token cap | **Not** debited | Not counted as paid ops | Tokens accrued (`ai_free_tier_usage`, UTC day) |
| Paid Hub Lab / routed (over free tier or ineligible model) | **Not** debited | Counted | — |
| Product AI (Practice Coach, Prep, Gap, etc.) | Unchanged | Unchanged | N/A |

Never double-charge credits + free-tier for the same Hub call.

## Defaults

- `AI_PROVIDER_MODE=mock` (CI / local safe; set `live` + edge secrets for real providers)
- Free daily tokens: **250_000** / user / UTC day (configurable)
- Acceleration: platform scope `standard`, token ceiling **5000**
- Routing: deterministic local classifier (no extra model call); Lab always bypasses

## Secrets (edge only — never `VITE_*`)

`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, plus optional Hub budget/rate/cache vars in `.env.example`. Sync with `scripts/sync-edge-secrets-from-env.mjs`.

## Tenancy

No organizations/teams table in Clarify. Hub settings are **platform-scoped**; free-tier usage is **per-user**. Acceleration is gated by existing **admin** role (`is_admin()` / `ProtectedRoute requireAdmin`).

## Migration

`supabase/migrations/20260810180000_ai_hub.sql`
