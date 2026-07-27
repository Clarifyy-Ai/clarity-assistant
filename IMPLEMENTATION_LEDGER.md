# IMPLEMENTATION_LEDGER.md — Clarify AI v1.0.0 closed-beta remediation

| ID | Priority | Requirement | Previous risk | Implementation | Files | Tests | Verification | Deployment | Status | Remaining |
|----|----------|-------------|---------------|----------------|-------|-------|--------------|------------|--------|-----------|
| A1 | P0 | Billing catalog + config validator | Env drift / test keys in prod | `billingCatalog.ts`, `billingConfig.ts`; wired into checkout/webhooks | `_shared/billingCatalog.ts`, `_shared/billingConfig.ts`, `create-checkout`, `stripe-webhook`, `razorpay-*` | `planCatalog.test.ts`, `billingGuards.test.ts` | `npm run billing:parity`, `npm run billing:preflight` | Not deployed | IMPLEMENTED_NOT_DEPLOYED | Live Stripe/Razorpay secrets in ops env |
| A2 | P0 | Stripe/Razorpay webhook hardening | Metadata trust; idempotency claim on failure | Catalog credits; livemode guard; claim release on error | `stripe-webhook`, `razorpay-*` | `billingGuards.test.ts`, `stripeWebhookLogic.test.ts` | Vitest 204 pass | Not deployed | IMPLEMENTED_NOT_DEPLOYED | Deno live webhook suite + deploy |
| A3 | P0 | Monitoring / health | Blind ops | `opsLog.ts`; ping billing + RL checks | `_shared/opsLog.ts`, `ping/index.ts`, RUNBOOK | Manual | Code review | Not deployed | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Log drain + alert routing |
| A4 | P0 | Product honesty | Enterprise/Unlimited/Rooms overclaim | Max display; Rooms removed; Unlimited UI removed; copy gates | `pricing.ts`, marketing pages, `release-copy-gates.mjs` | planCatalog + useAuth tests | `npm run release:gates` pass | N/A | IMPLEMENTED_AND_VERIFIED | Built-output crawl in CI only |
| A5 | P0 | Electron smoke docs | False overlay claims | Checklist + CSP harden | `docs/ELECTRON_SMOKE_CHECKLIST.md`, `electron/main.cjs` | Checklist | Electron build pass | N/A | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Windows/macOS manual smoke |
| B1 | P1 | Centralized plan/capability auth | Rank drift; credit-only bypass | `requireCapability` + `AI_FUNCTION_CAPABILITY`; wired on all 16 mapped AI EFs | `requireCapability.ts`, 16 AI `index.ts` files | `release:capability-gates` | Script pass | Not deployed | IMPLEMENTED_NOT_DEPLOYED | Deploy affected EFs |
| B2 | P1 | Admin EF coverage | Sparse requireAdmin | `collect-exam-papers` uses requireAdmin; admin UI uses RLS | `collect-exam-papers`, auth.ts | — | Static inventory | — | PARTIALLY_IMPLEMENTED | Runtime admin denial tests |
| B3 | P0 | Lock deduct_credits | Client RPC bypass | Migration revokes authenticated EXECUTE; client throws | `20260727010000_*.sql`, database.ts | security-gates script | Migration file reviewed; remote not applied | Pending | IMPLEMENTED_NOT_DEPLOYED | Apply migration + privilege query |
| B4 | P1 | In-memory RL leftovers | Per-process throttling | All EF handlers use async distributed RL | ai-feedback, analytics-dashboard, export-user-data, delete-account, deepgram-token | `release:security-gates` | Script pass | Not deployed | IMPLEMENTED_NOT_DEPLOYED | Redeploy EFs |
| B5 | P1 | RL outage strategy | Silent 429 vs outage | 503 + 2s RPC timeout | rateLimit.ts | — | Code | Not deployed | IMPLEMENTED_NOT_DEPLOYED | Redeploy + outage test |
| B6 | P1 | Electron CSP | unsafe-inline scripts | Removed script unsafe-inline in prod | electron/main.cjs | — | Electron build pass | — | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Launch smoke on device |
| C1 | P1 | Remove Rooms | Dead feature | Deleted room pages; routes redirect | App.tsx, rooms deleted | useAuth team_rooms | Static + gates | N/A | IMPLEMENTED_AND_VERIFIED | DB room tables later |
| C2 | P1 | Remove BYOK remnants | Key storage | authStore stripped; null migration | authStore, BYOK migration | security/copy gates | Migration not applied remote | Pending | IMPLEMENTED_NOT_DEPLOYED | Apply BYOK null migration |
| C3 | P1 | Elite/pro parity | Rank drift | Shared planCatalog FE + billingCatalog BE | planCatalog.ts, billingCatalog.ts | `billing:parity` | Script pass | N/A | IMPLEMENTED_AND_VERIFIED | Keep in sync |
| C4 | P2 | database.ts split | Maintainability | Map doc only (safe pre-beta) | DATABASE_REFACTOR_MAP.md | — | — | — | PARTIALLY_IMPLEMENTED | Post-beta incremental extract |
| D1 | P2 | Cost controls | Spend risk | creditEconomics + RUNBOOK kill-switch docs | creditEconomics, RUNBOOK | — | — | — | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Admin kill-switch UI |
| D2 | P2 | Indexes / scale | 10k myth | Explicit NO-GO 10k in RELEASE_NOTES | RELEASE_NOTES | — | — | — | IMPLEMENTED_AND_VERIFIED (docs) | Load tests in staging |
| D3 | P1 | RLS integration tests | Cross-user leakage | Not implemented this sprint | — | — | — | — | BLOCKED | Test Supabase project + auth fixtures |
| D4 | P2 | Playwright critical flows | Journey gaps | CI job exists; not re-run locally | e2e/ | — | CI only | — | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Run against staging |

Last updated: 2026-07-27 (session 2)
