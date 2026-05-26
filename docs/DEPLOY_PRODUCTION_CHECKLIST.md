# Production deploy checklist

Run after merging audit fixes to `main`.

## 1. Database

```powershell
cd clarity-assistant
npx supabase db push
```

Required migrations include:

- `20260525120000_admin_production_fixes.sql`
- `20260525140000_page_audit_grants.sql`
- `20260525160000_seed_starter_mock_questions.sql`
- `20260525161000_storage_documents_bucket.sql`

## 2. Supabase secrets

| Secret | Purpose |
|--------|---------|
| `GEMINI_API_KEY` | AI hints, debrief, mock gap-fill |
| `DEEPGRAM_API_KEY` | Live transcription |
| `SYSTEM_USER_ID` | AI-generated question owner UUID |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing |
| `RESEND_API_KEY` | Email reminders (optional) |
| `ALLOWED_ORIGINS` | Comma-separated browser origins |

**Recommended `ALLOWED_ORIGINS` value:**

```
https://preview--clarify-aii.lovable.app,https://clarityapp.ai,https://www.clarityapp.ai,https://app.clarityapp.ai
```

Code also allows `*.lovable.app`, `*.lovable.dev`, `*.lovableproject.com` after redeploy.

## 3. Edge functions (deploy all from repo)

P0 minimum:

```
generate-hint
generate-answer
generate-debrief
deepgram-token
select-test-questions
create-test
parse-question-pdf
collect-exam-papers
prep-tool
polish-star-section
generate-star-answer
parse-resume
schedule-interview
send-email
stripe-webhook
analytics-dashboard
export-user-data
delete-account
```

Full deploy (CLI):

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
# Deploy each function under supabase/functions/ except _shared
```

Deploy (after merge):

```powershell
npx supabase db push
node scripts/list-edge-functions.mjs
# Priority batch (this pass):
.\scripts\deploy-live-mock-prep.ps1
# Or full list: docs/EDGE_DEPLOY_COMMANDS.txt (40 functions)
```

Secrets: `GEMINI_API_KEY`, `SYSTEM_USER_ID`, `DEEPGRAM_API_KEY`, `ALLOWED_ORIGINS`

Smoke (preview + production):

1. Live overlay: share interview tab with audio → transcript shows interviewer → AI Help fills Answer
2. Mock test: JEE Main 2024 launch OR Admin → Collect public papers → retry
3. Prep: Rephraser + STAR Builder (no CORS console errors)

## 4. Frontend

- Lovable: sync/rebuild from `main`
- Custom domain: `npm run build` + host static output

## 5. Smoke tests (both origins)

1. Login → onboarding → dashboard
2. Live Co-Pilot: transcript + AI Help → Answer tab fills
3. Debrief page loads without CORS error
4. Mock test paper launch
5. Cover letter PDF parse
6. Admin user edit (if admin account)
