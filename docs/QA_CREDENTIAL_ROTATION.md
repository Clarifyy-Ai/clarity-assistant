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
