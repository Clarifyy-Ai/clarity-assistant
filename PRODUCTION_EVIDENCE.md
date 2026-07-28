# PRODUCTION_EVIDENCE.md

Only commands actually executed in this remediation sprint are listed. No secrets are recorded.

**Baseline:** branch `main`, commit `26b3a27fa23bfbd149e7fd0dfbf7a5500e5a3a1f` (uncommitted local changes present)  
**Environment:** Windows 10, Node v24.16.0, npm 11.13.0  
**Supabase project ref (from `.temp/project-ref`):** `qzgvjrvtkwlzxpmlddkx`  
**Date:** 2026-07-27

## Phase 0 — Baseline verification

| Command | Exit | Result |
|---------|------|--------|
| `npm run release:gates` | 0 | OK: release-copy gates passed |
| `npm run release:security-gates` | 0 | OK: release security gates passed |
| `npm run release:capability-gates` | 0 | OK: capability gates wired for 16 AI functions |
| `npm run billing:parity` | 0 | OK: billing catalog parity passed |
| `npm run billing:preflight` | 0 | development; all billing vars optional_absent locally |
| `npm run test:run` | 0 | Test Files 22 passed / Tests 204 passed |
| `npm run lint` | 0 | Warnings only (no errors) |
| `npm run typecheck` | 0 | Pass (TS5090 fixed via `baseUrl: "."` in tsconfig.app.json) |
| `npm run build` | 0 | Vite production web build completed |
| `npm run electron:build` | 0 | Electron-target Vite build completed |
| `npx supabase db push --dry-run` | 1 | Password auth failed — remote DB credentials not available in this session |

## Migrations

| Migration | Local file review | Applied to remote? |
|-----------|-------------------|-------------------|
| `20260727010000_revoke_deduct_credits_authenticated.sql` | REVOKE from PUBLIC/anon/authenticated; GRANT service_role only | **NO** — `db push` blocked (no DB password) |
| `20260727010001_null_legacy_byok_columns.sql` | Conditional null of legacy BYOK columns | **NO** — same |

## Edge Function deployments

**None executed this sprint.** Remote deploy requires Supabase CLI auth + project access. Functions with changed `_shared` modules (non-exhaustive): create-checkout, stripe-webhook, razorpay-create-order, razorpay-webhook, ping, ai-feedback, analytics-dashboard, generate-answer, generate-hint, generate-debrief, ai-coach-chat, prep-tool, gap-analysis, generate-questions, generate-practice-questions, generate-star-answer, polish-star-section, company-research, parse-resume, parse-document, analyze-test-performance, parse-question-pdf, export-user-data, delete-account, deepgram-token.

## Smoke / integration tests not executed

- Electron Windows/macOS platform smoke (`docs/ELECTRON_SMOKE_CHECKLIST.md`)
- Live Stripe/Razorpay webhook integration against production/staging
- RLS integration tests against remote Postgres
- Load tests (closed-beta scale targets)
- Monitoring alert delivery
- Backup restore exercise

## Known gaps (honest)

- Production billing secrets not validated (`APP_ENV=production` preflight not run with live vars)
- `deduct_credits` client RPC block not proven on deployed database
- Full Deno webhook concurrency matrix not in CI (Vitest product-rule guards only)
- Playwright E2E not re-run locally this session (CI job configured)
- Database.ts decomposition: map only, no module extraction

## Sprint 0 agent P0 batch (2026-07-27 evening)

| Command | Exit | Result |
|---------|------|--------|
| `npm run release:gates` | 0 | OK |
| `npm run release:security-gates` | 0 | OK |
| `npm run release:capability-gates` | 0 | OK (16 AI) |
| `npm run billing:parity` | 0 | OK |
| `npm run test:run -- src/test/lib/billing` | 0 | 6 files / 33 tests (incl. 5 Razorpay logic) |
| `npm run typecheck` | 0 | OK |

### Code landed (not deployed)
- All charging EFs → `deductCreditsAtomic` + `refundCredits`
- Razorpay catalog grants + grant-before-paid + idempotency
- bulk-import-questions zod/RL/fail-closed key
- LazyMotion GovExams/MockTestHub; rooms route dedupe; calendar 501 honesty
- CSP: no script unsafe-inline; utils.deductCredits → atomic
- Ban: authStore sign-out; requireAuth fail-closed on lookup errors
