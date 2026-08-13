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

| O1 | P0 | Responsible-use + visibility gates before capture session | Sessions could start without explicit permitted-use ack | Consent helpers + wizard checkboxes + Start disabled until both acks | `responsibleUseConsent.ts`, `PreSessionSetupWizard.tsx`, `OverlayFirstRunCoach.tsx` | `responsibleUseConsent.test.ts` | Vitest | N/A | IMPLEMENTED_AND_VERIFIED | Persist preference sync across devices |
| O2 | P0 | Overlay state machine documented + unit-tested | Unclear recovery / illegal transitions | Canonical states + transition helpers + docs | `overlaySessionStates.ts`, `docs/OVERLAY_*.md` | same test file | Vitest | N/A | IMPLEMENTED_AND_VERIFIED | Wire all UI chips to canonical enum end-to-end |
| O3 | P0 | Always-on-top / content-protection opt-in defaults | Forced always-on-top reduced transparency | Electron `alwaysOnTop: false`; init no longer forces pin | `electron/main.cjs`, `electronWindowManager.ts` | Manual Electron smoke | Code review | N/A | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Windows/macOS device smoke |

| O4 | P0 | Wire pipeline state to overlay UI | Documented states unused | `session_pipeline_state` + transitions from audio/copilot; status labels | `overlayStore.ts`, `useAudioSession.ts`, `useLiveCopilot.ts`, `OverlayListeningIndicator.tsx` | overlay tests | Vitest | N/A | IMPLEMENTED_AND_VERIFIED | Interactive UAT |
| O5 | P0 | Live dedupe + idempotency | Random questionId double-charge risk | Fingerprint set + `hintIdempotencyKey` + Idempotency-Key header | `useLiveCopilot.ts`, `geminiClient.ts`, `questionDetection.ts` | questionDetection + responseFormatters tests | Vitest | generate-hint redeployed | IMPLEMENTED_AND_VERIFIED | Latency instrumentation |
| O6 | P0 | Modes / AOT / presentation-safe | Forced AOT; layout flags only | Settings toggles + layout dims + content-protection opt-in | `OverlaySettings.tsx`, `applyOverlayWindowPrefs.ts`, Electron IPC | Manual | Code | N/A | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Windows smoke |
| O7 | P0 | Remappable Electron shortcuts | Hardcoded accelerators | sync IPC + OverlayKeyboardHandler reads overrides | `electron/main.cjs`, `preload.cjs`, `hotkeyOverrides.ts`, `OverlayKeyboardHandler.tsx` | responseFormatters.test | Code | N/A | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Interactive collision UAT |
| O8 | P1 | STAR/tech/coding frameworks | Missing structure rail | Local frameworks only (no fabricated stories) | `responseFormatters.ts`, `OverlayHintPanel.tsx` | responseFormatters.test | Vitest | N/A | IMPLEMENTED_AND_VERIFIED | — |
| D5 | P0 | Remote deduct_credits revoke | Client RPC bypass | Migrations applied; privilege probe | `20260727010000_*.sql`, `20260727010001_*.sql` | SQL probe | auth EXECUTE false | Applied | IMPLEMENTED_AND_VERIFIED | — |
| D6 | P0 | Redeploy charging EFs | Stale remote shared modules | 11 functions redeployed `--use-api` | generate-hint, deduct-credits, checkout, webhooks, AI, ping, … | Deploy logs | Exit 0 | Deployed | IMPLEMENTED_AND_VERIFIED | Stripe secrets still absent |
| G1 | P0 | Gov exam registry + versioned patterns | Hardcoded exam UI / no provenance | Migrations + RLS + pilot seeds (SSC/RRB/IBPS/UPSC + APPSC) | `20260802120000_*`, `20260802120100_*`, state_psc | SQL verify | Applied remote | Applied | IMPLEMENTED_AND_VERIFIED | Broader state PSC catalog |
| G2 | P0 | create-exam-paper durable jobs | Generic LLM MCQ risk | Blueprint + bank assembly + fail-closed full sim | `create-exam-paper`, `govBlueprint.ts` | blueprintEngine.test (6) | Deployed `--use-api` | Deployed | IMPLEMENTED_AND_VERIFIED | LLM generator OFF; 0 full-sim packs |
| G3 | P0 | Search-first gov UI + disclaimers | Catalog clutter / affiliation risk | Hub search + detail + generate stepper | `MockTestHub`, `GovExamDetail`, `GenerateGovPaper` | Manual UAT doc | FE host deploy external | Code complete | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Host prod release |
| G4 | P1 | Exam pack certification docs | Overclaim all exams | Pack cert + source policy + pipeline + monitoring docs | `docs/GOV_EXAM_*`, `EXAM_PACK_CERTIFICATION.md` | — | Docs | N/A | IMPLEMENTED_AND_VERIFIED | Content certification (0 ready) |
| G5 | P0 | Admin gov content ops + RLS | Draft content invisible/uneditable | `/app/admin/gov/*` + `is_admin()` policies | AdminGov*, `gov_exam_admin_rls` | adminOps 4 | Applied + policies verified | Applied | IMPLEMENTED_AND_VERIFIED | Interactive admin UAT |
| G6 | P0 | PYQ ingest layer | No provenance path | previous_year_* + ingest/list/extract EFs | `20260802140000_*`, `20260802150000_*`, ingest EFs | ingestAllowlist + extract tests | Applied + deployed | Deployed | IMPLEMENTED_AND_VERIFIED | Empty approved PYQ bank; OCR unpublished until review |
| G7 | P0 | Adaptive mastery | Percent-only analytics | topic_mastery + submit-test hook + adaptive rank | masteryEngine, readiness UI | masteryEngine 13 | Applied + deployed | Deployed | IMPLEMENTED_AND_VERIFIED | Needs real attempt volume |
| G8 | P0 | Validators + quality gates | Weak originality/quality | multi-agent bank validation + reconcile EF; lexical similarity primary | validators/*, reconcile-paper-quality | similarity 8 + gov-exam suite | Deployed | Deployed | IMPLEMENTED_AND_VERIFIED | LLM generator OFF; embeddings optional/offline only |
| G9 | P1 | State PSC pilot + paper-class UX | Central-only packs | APPSC Group-II + session/results labels | `state_psc_pilot`, disclaimers | disclaimers 6 | Applied | Applied | IMPLEMENTED_AND_VERIFIED | One state pack only |
| G10 | P1 | Light gov ops monitoring | Blind pilot ops | Monitoring doc + ops snapshot (exams/jobs/bank/translations/incidents/ingest) | `GOV_EXAM_MONITORING.md`, `gov-exam-ops-snapshot.mjs` | Snapshot exit 0 (5 exams, 0 full-sim) | Script + evidence | N/A | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Log drain + automated alerts |

**Gov release decision:** CONDITIONAL_GO_PILOT — engine + admin + ingest + mastery + validators live; **0** full-sim ready packs (SSC 20/100, UPSC 23/100, IBPS 18/100 partial; APPSC/RRB empty); FE host deploy external; alerts/drain still external. Not GO for all exams.

Last updated: 2026-08-11 — Aug 11 QA remediation remaining work (billing redirects, OAuth allowlist, prep idempotency, verify gates, deletion CORS, fixtures).

| ID | Priority | Requirement | Implementation | Status | Remaining |
|----|----------|-------------|----------------|--------|-----------|
| AUG11-WS2 | P0 | QA credential rotation | seed-qa-accounts + QA_CREDENTIAL_ROTATION.md; scan:secrets | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Operator must rotate + MFA |
| AUG11-WS3 | P0 | Edge 502/503 / CORS | prep-tool/send-email/delete-account CORS + structured errors | IMPLEMENTED_NOT_DEPLOYED | Redeploy EFs + RESEND key |
| AUG11-WS5 | P0 | Pricing 20% + CTA | PLANS yearly true 20%; paidPlanHref plan+interval | IMPLEMENTED_AND_LOCALLY_VERIFIED | Stripe price IDs in ops |
| AUG11-WS7 | P0 | returnTo on logout | assignLoginWithReturnTo hard nav | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG11-WS8 | P0 | Email verify before onboarding | isUserEmailConfirmed gates | IMPLEMENTED_AND_LOCALLY_VERIFIED | send-email deploy |
| AUG11-WS10 | P0 | OAuth allowlist | VITE_OAUTH_PROVIDERS default google | IMPLEMENTED_AND_LOCALLY_VERIFIED | Enable providers in Supabase |
| AUG11-WS11 | P0 | Banned / past-due UX | Suspended + billing recovery UI | IMPLEMENTED_AND_LOCALLY_VERIFIED | Fixture seed banned/past_due |
| AUG11-WS13-14 | P0 | Prep shell + idempotency | PrepToolShell + prep-tool cache replay | IMPLEMENTED_NOT_DEPLOYED | Redeploy prep-tool |
| AUG11-WS15-16 | P1 | Docs TXT + Gap JD select | MIME + selectors + CAPABILITY_REQUIRED | IMPLEMENTED_NOT_DEPLOYED | Redeploy gap-analysis |
| AUG11-WS19 | P0 | Interview Day web launch | Continue in browser → /app/live | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG11-WS21 | P0 | Account deletion UX | Safe toasts + CORS on delete-account | IMPLEMENTED_NOT_DEPLOYED | Redeploy delete-account |
| AUG11-WS28 | P0 | /app/billing redirect | App.tsx → settings/billing | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG11-WS4 | P1 | Mobile header | Gov Exams short label + drawer | IMPLEMENTED_AND_LOCALLY_VERIFIED | Visual UAT |
| AUG11-WS30 | P1 | QA fixtures | banned/past_due/disposable seed keys | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | Run qa:seed-accounts |

Last updated: 2026-08-13 — remaining QA plan: local gates + Playwright passed; remote migration/EF deploy blocked (no CLI token; MCP invoke unavailable).

| ID | Priority | Requirement | Implementation | Status | Remaining |
|----|----------|-------------|----------------|--------|-----------|
| AUG13-WS2 | P0 | Strip QA password literals; CI scan:secrets; User A/B fixtures | `make_basic_qa_xlsx.py`, `qa-p0-p1-runner.mjs`, `seed-qa-accounts.mjs`, CI | IMPLEMENTED_AND_LOCALLY_VERIFIED | Operator rotation + MFA |
| AUG13-WS3 | P0 | Profile stale cache + correlation IDs | `authStore.ts`, `fetchEdge.ts` | IMPLEMENTED_AND_LOCALLY_VERIFIED | Runtime smoke after deploy |
| AUG13-WS12 | P0 | Onboarding → Dashboard; Skip; anxiety; audio devices | `OnboardingIndex.tsx`, OptionalSetup | IMPLEMENTED_AND_LOCALLY_VERIFIED | Playwright onboarding Skip |
| AUG13-WS23 | P0 | Canonical `/app/debriefs` | `App.tsx` + nav/search | IMPLEMENTED_AND_LOCALLY_VERIFIED | Playwright redirects |
| AUG13-WS29 | P0 | Rooms retired redirect | `RetiredRoomsRedirect` | IMPLEMENTED_AND_LOCALLY_VERIFIED | Playwright `/app/rooms` |
| AUG13-WS24 | P0 | Analytics not_scored vs zero | `scoreStatus.ts`, Analytics UI, EF | IMPLEMENTED_NOT_DEPLOYED | Redeploy analytics-dashboard |
| AUG13-WS26 | P0 | Durable deletion operations | migration + `delete-account` | IMPLEMENTED_NOT_DEPLOYED | Apply `20260813100000_*` + redeploy |
| AUG13-WS25 | P0 | India region + fail-closed paper count | `indiaRegion.ts`, `select-test-questions`, `launchMockTest` | IMPLEMENTED_NOT_DEPLOYED | Redeploy select-test-questions |
| AUG13-WS28 | P1 | Admin Access Denied copy | AdminLayout + ProtectedRoute | IMPLEMENTED_AND_LOCALLY_VERIFIED | Playwright Access Denied |
| AUG13-WS13 | P1 | More sheet Logout; palette Guide + prep rank | MobileNav, CommandPalette | IMPLEMENTED_AND_LOCALLY_VERIFIED | Playwright |
| AUG13-WS30 | P1 | Unit + Playwright + RLS fixtures | `src/test/lib/**`, `e2e/qa-*.spec.ts`, `rls-spot-check.mjs` | IMPLEMENTED_AND_LOCALLY_VERIFIED | Full RLS matrix needs live User A/B |
| AUG13-WS32 | P0 | Gates + build; remote migrate/deploy | lint/typecheck/test/gates/build:check | IMPLEMENTED_REQUIRES_EXTERNAL_OPS | PAT + `db push` + EF `--use-api` + FE host |


