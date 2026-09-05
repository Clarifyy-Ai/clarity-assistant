# QA credential rotation (SEC-001)

Workbook Excel artifacts must **never** contain plaintext passwords.

## Rotate exposed credentials

1. Run `npm run qa:seed-accounts` against staging with `SUPABASE_SERVICE_ROLE_KEY`.
   - Script generates fresh passwords and writes them only to **gitignored** `.env.qa.local`.
2. Manually rotate Admin (`qa.admin@clarify.ai.test`) in Supabase Auth if the workbook was shared externally.
3. Review Auth sign-in logs for the QA emails after rotation.
4. Confirm QA accounts cannot use production data/secrets (staging project only).

## Artifact rules

- `.env.qa.example` — named identities only (no passwords).
- `.env.qa.local` — gitignored credentials from seed script.
- Never paste passwords into Fail Log, screenshots, or PR descriptions.

## CI

- `npm run release:security-gates` runs in CI.
- Build verifies no service-role key in the client bundle via `verify:dist-env` / security gates.

## Auth Site URL + OAuth enable checklist

No passwords. Complete in Supabase Dashboard → Authentication:

1. **Site URL** — set to the production app origin (e.g. `https://trycareerpilot.com`).
2. **Redirect URLs** — include:
   - `{APP_URL}/auth/callback`
   - `{APP_URL}/login`
   - `{APP_URL}/reset-password` (and `/forgot-password` if used)
   - Local: `http://localhost:5173/auth/callback` (dev only)
3. **Providers** — enable only providers listed in `VITE_OAUTH_PROVIDERS` (default `google`).
   - Google: create OAuth client in Google Cloud Console; paste Client ID/Secret into Supabase → Auth → Providers → Google.
   - Leave GitHub / LinkedIn / Azure **disabled** unless explicitly enabled in both Supabase and `VITE_OAUTH_PROVIDERS`.
4. **Frontend env** — set `VITE_OAUTH_PROVIDERS=google` (see `.env.example`). Rebuild after changes.
5. **Smoke** — open `/login`, confirm only allowlisted buttons render; complete one Google sign-in to `/auth/callback` → app.
