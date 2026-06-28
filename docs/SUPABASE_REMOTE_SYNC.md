# Supabase remote sync (Clarify.AI)

Project: **qzgvjrvtkwlzxpmlddkx** (us-east-1)

## Recommended deploy path

Use the production deploy script (Windows):

```powershell
cd clarity-assistant
.\scripts\run-production-deploy.ps1
```

This runs, in order:

1. `npm run validate-env` — frontend `.env.local` checks
2. `node scripts/pre-deploy-check.mjs` — migrations + edge inventory
3. `npx supabase db push` — apply pending migrations
4. `node scripts/deploy-all-edge-functions.mjs` — deploy all edge functions
5. `bash scripts/smoke-edge.sh` — optional, when `SUPABASE_URL` + `ANON_KEY` are set

See also: [DEPLOY_PRODUCTION_CHECKLIST.md](./DEPLOY_PRODUCTION_CHECKLIST.md)

## Prerequisites

```powershell
npx supabase login
npx supabase link --project-ref qzgvjrvtkwlzxpmlddkx
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, etc.
npm run validate-env
```

## Regenerate edge deploy command list

```powershell
node scripts/list-edge-functions.mjs
```

Writes [EDGE_DEPLOY_COMMANDS.txt](./EDGE_DEPLOY_COMMANDS.txt).

## Partial deploy (live / mock / prep P0 batch)

```powershell
.\scripts\deploy-live-mock-prep.ps1
```

## Required Supabase Edge secrets

| Secret | Purpose |
|--------|---------|
| `GEMINI_API_KEY` | AI hints, debrief, mock gap-fill |
| `DEEPGRAM_API_KEY` | Live transcription |
| `DEEPGRAM_PROJECT_ID` | Scoped Deepgram tokens |
| `SYSTEM_USER_ID` | AI-generated question owner UUID |
| `ALLOWED_ORIGINS` | CORS allowlist (comma-separated) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing |
| `RESEND_API_KEY` | Email (optional) |

## Legacy / archived

Older MCP-based deploy scripts live in `scripts/archive/`. Do not use them for routine deploys.
