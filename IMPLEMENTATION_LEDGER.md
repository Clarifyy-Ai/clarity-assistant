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
| AUG13-WS24 | P0 | Analytics not_scored vs zero | `scoreStatus.ts`, Analytics UI, EF | Deployed remotely (analytics-dashboard v140 ACTIVE) | Product UAT FP-025 |
| AUG13-WS26 | P0 | Durable deletion operations | migration + `delete-account` | Migration applied; delete-account v142 ACTIVE | Product UAT FP-012 |
| AUG13-WS25 | P0 | India region + fail-closed paper count | `indiaRegion.ts`, `select-test-questions`, `launchMockTest` | select-test-questions v141 ACTIVE | Product UAT FP-023/024 |
| AUG13-WS28 | P1 | Admin Access Denied copy | AdminLayout + ProtectedRoute | IMPLEMENTED_AND_LOCALLY_VERIFIED | Playwright Access Denied |
| AUG13-WS13 | P1 | More sheet Logout; palette Guide + prep rank | MobileNav, CommandPalette | IMPLEMENTED_AND_LOCALLY_VERIFIED | Playwright |
| AUG13-WS30 | P1 | Unit + Playwright + RLS fixtures | `src/test/lib/**`, `e2e/qa-*.spec.ts`, `rls-spot-check.mjs` | IMPLEMENTED_AND_LOCALLY_VERIFIED | Full RLS matrix needs live User A/B |
| AUG13-WS32 | P0 | Gates + build; remote migrate/deploy | lint/typecheck/test/gates/build:check | Migration + 14 EFs deployed via Management API | Frontend host release still external |

Last updated: 2026-08-14 — remaining QA master-prompt close-out (local).

| ID | Priority | Requirement | Implementation | Status | Remaining |
|----|----------|-------------|----------------|--------|-----------|
| AUG14-WS5 | P0 | OAuth cancel → login, not /app timeout | `isOAuthCancelledError`; AuthCallback `/login?error=cancelled`; Login calm copy | IMPLEMENTED_AND_LOCALLY_VERIFIED | Enable intended providers in Supabase dashboard |
| AUG14-WS9 | P0 | Practice Coach required fields | `wizardValidation.ts`; Next disabled + inline reason for interview company/role/resume | IMPLEMENTED_AND_LOCALLY_VERIFIED | Playwright setup wizard |
| AUG14-WS10 | P0 | Overlay not stuck on Listening | `ListeningTimeoutHelp` after 12s + Type a question (chat tab); mobile limitation copy | IMPLEMENTED_AND_LOCALLY_VERIFIED | Interactive mic/Deepgram UAT |
| AUG14-WS12 | P1 | Prep save confirm + numbered hints | Rephraser `SaveToAnswerBankConfirm`; `splitCodingHints` cards | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG14-WS14 | P0 | parse-document TXT adapter | UTF-8 decode, binary reject, no Gemini inline_data for text/plain | IMPLEMENTED_AND_VERIFIED | Deployed v46 |
| AUG14-WS15 | P0 | Gap Analysis persist + stale + absence copy | `gapAnalysesDB`; Resume/JD detail load on refresh; EF stores version fingerprints | IMPLEMENTED_AND_VERIFIED | Deployed v140; stale DB triggers applied |
| AUG14-WS21 | P0 | Exam auto-submit while paused / on reload | `shouldAutoSubmitAttempt`; TestSession tick from `started_at` | IMPLEMENTED_AND_LOCALLY_VERIFIED | Live `submit-test` expiry UAT |
| AUG14-WS23 | P0 | Rephraser idempotency across refresh | sessionStorage + SHA content key | IMPLEMENTED_AND_VERIFIED | `prep-tool` deployed v154 |
| AUG14-WS25 | P1 | PWA prompt layout | max-h scroll + mobile bottom sheet + safe-area footer | IMPLEMENTED_AND_LOCALLY_VERIFIED | Visual UAT maximized window |
| AUG14-WS8 | P1 | Recent Sessions + palette scroll reset | Dashboard heading; cmdk list scrollTop on query | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG14-WS10b | P0 | Overlay listening timeout + chat fallback | `ListeningTimeoutHelp` 12s + Type a question | IMPLEMENTED_AND_LOCALLY_VERIFIED | Interactive mic UAT |
| AUG14-WS11 | P0 | Scorecard empty answers + mock persist upsert | scoreQuestions on answered only; session_answers replace-by-session; scorecards update-if-exists | IMPLEMENTED_AND_LOCALLY_VERIFIED | Interactive scorecard UAT |
| AUG14-WS13 | P0 | JD/document content_hash uniqueness | Additive migration applied remote; client hash reuse before create | IMPLEMENTED_AND_VERIFIED | — |
| AUG14-WS16 | P1 | Practice prompt seeds wizard | PreSessionSetupWizard `location.state.practicePrompt` | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG14-WS19 | P1 | Debrief share also marks scorecard | `scorecardsDB.markShared` in DebriefDetail | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG14-WS22 | P0 | Billing upgrade when Stripe unset | Upgrade CTA routes to Razorpay | IMPLEMENTED_AND_LOCALLY_VERIFIED | Live Razorpay UAT |
| AUG14-WS23b | P0 | Rephraser SHA content idempotency | `prepToolContentIdempotencyKey` from input hash | IMPLEMENTED_AND_VERIFIED | `prep-tool` v154 |
| AUG14-WS14b | P0 | JD PDF/DOCX parse via parse-document | `jd_id` branch + `addJobDescriptionFromFile` | IMPLEMENTED_AND_VERIFIED | `parse-document` v46 |
| AUG14-WS6 | P0 | Edge past-due 403 `BILLING_PAST_DUE` | `billingPastDue.ts` in requireAuth; checkout/portal still allowed | IMPLEMENTED_AND_VERIFIED | Redeploy remaining non-AI EFs as needed |
| AUG14-WS4 | P0 | Reset password no email enumeration | Always success-request after send | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG14-WS7 | P1 | Onboarding hint icons + persist mic on Skip | Distinct hint icons; `audio_input_device` on skip | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG14-WS1 | P1 | QA seed preserves passwords | `QA_*_PASSWORD` env + `.env.qa.local` reuse | IMPLEMENTED_AND_LOCALLY_VERIFIED | Operator rotation still required |

Last updated: 2026-08-14 evening — collected unfinished agent workstreams; remaining local close-out.

| ID | Priority | Requirement | Implementation | Status | Remaining |
|----|----------|-------------|----------------|--------|-----------|
| AUG14E-WS10 | P0 | OverlaySettings stale shortcut list (Ctrl+Shift+H/C) | OverlaySettings sourced from `OVERLAY_HOTKEYS`; `DEFAULT_HOTKEYS` C=capture, U=toggle alias | IMPLEMENTED_AND_LOCALLY_VERIFIED | Interactive overlay UAT |
| AUG14E-WS10c | P0 | Settings/mobile hide desktop shortcuts | SettingsHotkeys hides list on mobile; prominent desktop overlay notice | IMPLEMENTED_AND_LOCALLY_VERIFIED | Visual UAT |
| AUG14E-WS10d | P0 | Audio-level meter scale | OverlayListeningIndicator uses 0–1 RMS (`currentLevel * 12`) not `/100` | IMPLEMENTED_AND_LOCALLY_VERIFIED | Mic UAT |
| AUG14E-WS12b | P1 | System Design numbered section cards | `splitMarkdownSections` + numbered cards | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG14E-WS21b | P1 | Gov exam hub card spacing | Stretch grid, `p-4`, CTAs aligned | IMPLEMENTED_AND_LOCALLY_VERIFIED | Visual UAT |
| AUG14E-WS20b | P1 | Analytics chart sr-only summaries | Trend/dimension summaries skip null (Not scored) | IMPLEMENTED_AND_LOCALLY_VERIFIED | — |
| AUG14E-WS25b | P1 | PWA footer action order | Install first on mobile; Remind me later last as text link | IMPLEMENTED_AND_LOCALLY_VERIFIED | Visual UAT |

| P0-20260815-BILL | P0 | Razorpay durable payment_orders ledger | Fail-closed create-order; unique provider/idempotency; reconciliation incidents; Option A one-time UI | IMPLEMENTED_NOT_DEPLOYED for web host; Edge `razorpay-create-order`/`verify`/`webhook` deployed | Sandbox payment smoke; web release of Billing UI |
| P0-20260815-REF | P0 | Referral claim hardening | Client insert/update revoked; `record_referral_reward` service-role; unique referred_id | IMPLEMENTED_AND_RUNTIME_VERIFIED (schema/grants) | Live referral grant smoke |
| P0-20260815-GOV | P0 | gov_exam_ai_fill capability | `create-exam-paper` + `select-test-questions` call `requireCapability` before credits | IMPLEMENTED_NOT_DEPLOYED for web; Edge deployed | Free/Pro/Max live denial matrix |
| P0-20260815-ZOMB | P0 | Zombie Edge Functions | 410 stubs deployed; CI allowlist parity | IMPLEMENTED_AND_RUNTIME_VERIFIED (`ai-feedback` 410) | — |
| P0-20260815-PING | P0 | ping / ai-key-check leak | Public ping `{status:ok}`; ai-key-check JWT+admin, no fingerprints | IMPLEMENTED_AND_RUNTIME_VERIFIED (anon ping/key-check) | Enable leaked-password in Auth console |
| P0-20260815-DEL | P0 | Account deletion map | Expanded wipe + retain/anonymize billing; session revoke | IMPLEMENTED_NOT_DEPLOYED wait Edge deployed | Disposable-user E2E |
| P0-20260815-RPC | P0 | mark_gap_analyses_* PUBLIC execute | Revoked from anon/authenticated | IMPLEMENTED_AND_RUNTIME_VERIFIED (privilege query) | Trigger still works on resume/JD update |



