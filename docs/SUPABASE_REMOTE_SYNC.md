# Supabase remote sync (Clarify.AI)

Project: **qzgvjrvtkwlzxpmlddkx** (us-east-1)

## Applied on remote (2026-05-25)

| Migration | What it does |
|-----------|----------------|
| `add_profile_prefs_columns` | `profiles.privacy_prefs`, `profiles.notification_prefs` (jsonb, default `{}`) |
| `add_increment_profile_credits_fn` | `increment_profile_credits(uuid, int, text)` for Stripe webhooks |
| `lockdown_increment_profile_credits_grants` | RPC executable by `service_role` only |

Verified columns: `privacy_prefs`, `notification_prefs`, `stealth_mode` default `false`.

## Edge functions — redeploy full sources

Remote versions may still use **stub** `_shared/cors.ts` (wildcard `*`) and a **short** `analytics-dashboard` handler. Repo sources include full CORS allowlists, credit helpers, filler trends, and weak-spot radar.

### Option A — Management API (recommended)

1. Create a token: [Supabase Account → Access Tokens](https://supabase.com/dashboard/account/tokens)
2. Run:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_YOUR_TOKEN"
$node = "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe"
& $node scripts/deploy-all-from-mcp-json.mjs
```

### Option B — Supabase CLI

```bash
supabase functions deploy analytics-dashboard export-user-data delete-account --project-ref qzgvjrvtkwlzxpmlddkx
```

### Option C — Cursor Supabase MCP

Regenerate args then deploy each function:

```powershell
node scripts/write-mcp-deploy-args.mjs analytics-dashboard
# Use deploy_edge_function with .deploy-payloads/_mcp-call-analytics-dashboard.json
```

## Dashboard (manual)

- Auth → enable **leaked password protection**
- Edge Functions → Secrets: `ALLOWED_ORIGINS`, `GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
