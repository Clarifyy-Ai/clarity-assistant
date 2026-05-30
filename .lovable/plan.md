## Phase 2 — Sanitize edge function error responses

**Guardrail:** only the catch-block responses in two files. No other logic touched. Real errors still logged via `console.error` for admin/log debugging.

### Changes

1. `supabase/functions/analytics-dashboard/index.ts:200`
   Replace `err.message` leak with fixed `"Internal server error"`. Keep existing `console.error` on line 199.

2. `supabase/functions/parse-question-pdf/index.ts:137`
   Replace `err.message` leak with fixed `"Internal server error"`. Keep existing `console.error` on line 126 and the credit-refund block untouched.

### Deploy + verify
- Deploy both via `supabase--deploy_edge_functions`.
- Smoke-test each with `supabase--curl_edge_functions` (a malformed request to trigger the catch path) and confirm the body no longer echoes internal error text.

### Out of scope (per surfaced backend guidance)
- Rate limiting on `send-email`, `export-user-data`, `delete-account` — dropped, since the backend has no established rate-limit primitives.

After Phase 2 lands I'll stop and wait for your go-ahead on **Phase 3** (mark stale `make_admin`/`ban` findings fixed in the scanner + add `is_banned` gate to `start-session` / `generate-answer`).