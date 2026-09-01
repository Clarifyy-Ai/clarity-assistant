# Career Pilot Operations Runbook

## Incident response

1. Confirm scope (frontend, edge functions, database, Stripe).
2. Check status page and Supabase dashboard logs.
3. Roll back the most recent change if correlated with the incident.

## Rollback procedures

### Database migrations

```bash
# Inspect applied migrations
supabase migration list

# Revert by applying a compensating migration — never edit applied history in place.
# Create a new migration that undoes the schema change, then:
supabase db push
```

### Edge functions

Redeploy the previous git tag/commit for affected functions:

```bash
git checkout <previous-release-tag>
supabase functions deploy generate-hint generate-answer generate-debrief ai-feedback stripe-webhook
git checkout main
```

### Frontend / Electron

- Web: redeploy prior build artifact from CI or hosting provider.
- Electron: publish previous signed build from release artifacts.

## Health checks

- `GET /` — marketing shell loads
- Supabase Edge `ping` function
- Stripe webhook delivery log (Dashboard → Developers → Webhooks)

## Secrets rotation

Rotate in Supabase Dashboard → Edge Functions → Secrets, then redeploy functions:

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (high impact — coordinate maintenance window)

## External blockers (not automated in-repo)

- Penetration test sign-off
- Legal counsel review
- Electron notarization / code signing
- On-call paging integration
- Database restore drill
