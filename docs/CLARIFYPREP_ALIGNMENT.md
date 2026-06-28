# Clarify AI Launch Checklist — Alignment Tracker

Maps the [Clarify AI production launch checklist](./Clarify AI_SPEC.md) (sections A–F) to this repo.  
Legend: ✅ done · ⚠️ partial · ❌ not done

**Last reviewed:** 2026-06-28 (Full launch implementation pass)

---

## Launch implementation (2026-06-28)

| Area | Status | Notes |
|------|--------|-------|
| Multi-model AI routing (edge + client) | ✅ | `resolveModel.ts`, `modelRouter.ts`, Settings/onboarding |
| Billing credit packs SSOT | ✅ | `priceCalculator.ts` `CREDIT_PACKS` |
| Low-credit UX | ✅ | `LowCreditBanner.tsx` on dashboard (≤20% monthly) |
| Brand assets | ✅ | `public/favicon.png`, `icon.png`, `images/og-cover.png` |
| Contact constants | ✅ | `src/lib/constants/contact.ts` |
| Session history merge | ✅ | `CallSessions` tabs; `/sessions/history` redirect |
| App 404 shell | ✅ | `NotFound.tsx` authenticated layout |
| Mobile More nav | ✅ | `MobileNav.tsx` sheet |
| Admin MRR + AI spend | ✅ | `AdminDashboard.tsx` subscriptions + `ai_usage_logs` |
| Unit tests (credits/routing) | ✅ | `src/test/lib/modelRouter.test.ts`, `creditPacks.test.ts` |
| E2E mock-debrief smoke | ✅ | `e2e/mock-debrief.spec.ts` |
| security.txt / RUNBOOK / Electron release | ✅ | `public/security.txt`, `docs/RUNBOOK.md`, `docs/ELECTRON_RELEASE.md` |

## A. Engineering & Infrastructure

| Item | Status | Reference |
|------|--------|-----------|
| CI: lint, typecheck, tests, build on PR | ✅ | `.github/workflows/ci.yml`, `package.json` scripts |
| Coverage thresholds (billing/auth/credits ≥80%) | ❌ | Vitest placeholders dominate `src/test/_placeholders/` |
| E2E: signup → mock → debrief → upgrade | ⚠️ | `e2e/smoke.spec.ts`, `e2e/signup-flow.spec.ts`; full funnel not covered |
| Staging mirrors prod | ⚠️ | Lovable preview + Supabase project; not documented as full mirror |
| Blue/green / canary deploy | ❌ | Manual deploy scripts only |
| Reversible DB migrations tested | ⚠️ | 55+ migrations; `db push` documented, rollback not automated |
| API / WebSocket autoscaling | ❌ | Supabase-managed; no custom gateway |
| Rate limiting on AI + auth | ✅ | `supabase/functions/_shared/rateLimit.ts`, per-function presets |
| Redis credit cache | ❌ | Credits via Postgres RPC (`deduct_credits`) |
| Load test 2–5× traffic | ❌ | Not recorded |
| Observability (Sentry, tracing) | ⚠️ | Optional `VITE_SENTRY_DSN`; edge audit logs in `_shared/audit.ts` |
| AI latency / credit dashboards | ⚠️ | `analytics-dashboard` EF; admin partial |
| Feature flags | ✅ | `feature_flags` table + `AdminFeatureFlags.tsx` |
| LLM spend caps | ❌ | Per-user rate limits only |
| Desktop auto-update + code signing | ❌ | `electron/` exists; signing not configured |
| Offline / Private Mode zero network | ⚠️ | Documented intent; not fully verified |

**Section estimate:** ~40% complete

---

## B. Security & Compliance

| Item | Status | Reference |
|------|--------|-----------|
| Penetration test | ❌ | Not recorded |
| SCA / dependency scanning in CI | ⚠️ | `npm audit` possible; no enforced gate |
| Secrets not in source | ✅ | Edge secrets via Supabase dashboard; `scripts/pre-deploy-check.mjs` lists them |
| BYOK encrypted at rest | ⚠️ | BYOK UI removed (`SettingsBYOK.tsx`); headers still forwarded in some EFs |
| TLS 1.3 / HSTS | ⚠️ | Supabase + hosting provider |
| JWT expiry + logout invalidation | ✅ | Supabase Auth |
| Cross-tenant storage isolation | ⚠️ | RLS on buckets; not pen-tested |
| Brute-force rate limiting | ✅ | Auth + edge rate limits |
| GDPR export + deletion E2E | ✅ | `export-user-data`, `delete-account` EFs |
| Privacy / ToS legal review | ⚠️ | `Privacy.tsx`, `Terms.tsx` in repo; counsel sign-off pending |
| Acceptable Use bans live deception | ✅ | `src/pages/marketing/Terms.tsx` §4 (Phase 4) |
| Session-type AI enforcement | ✅ | `_shared/sessionEnforcement.ts` + migration `20260628120000_session_ai_enforcement.sql` |
| DPAs with subprocessors | ❌ | Not in repo |
| Incident response runbook | ❌ | Not in repo |
| Compliance gating (no stealth) | ✅ | `docs/COMPLIANCE_GATING.md`, `featureGates.ts` |

**Section estimate:** ~55% complete

---

## C. Billing & Subscriptions

| Item | Status | Reference |
|------|--------|-----------|
| Stripe webhooks idempotent | ✅ | `stripe-webhook/index.ts` |
| Dunning / failed payment flow | ⚠️ | Webhook handles events; email retry not fully verified |
| Proration mid-cycle | ⚠️ | Stripe Checkout; not integration-tested in docs |
| Credit ledger vs Stripe reconcile | ❌ | No nightly job |
| Free tier limits server-side | ✅ | `deduct_credits` RPC, plan checks in EFs |
| Stripe Tax | ❌ | Not configured |
| Branded invoice emails | ⚠️ | `send-email` EF; templates partial |
| Enterprise CRM flow | ❌ | Marketing contact only |
| Refund policy documented | ⚠️ | `Terms.tsx` §6 |
| Credit rollover disclosure | ⚠️ | `Pricing.tsx` |

**Section estimate:** ~45% complete

---

## D. Support & Documentation

| Item | Status | Reference |
|------|--------|-----------|
| Help center live | ✅ | `src/pages/marketing/Help.tsx`, seeded FAQ migration |
| In-app support / ticketing SLA | ⚠️ | Support threads; `AdminLiveChat` partial |
| Status page | ❌ | Not linked |
| Internal runbooks | ⚠️ | `docs/QA_MANUAL.md`, deploy checklist |
| Onboarding email sequence | ⚠️ | `send-email` EF; sequences not verified |
| Changelog process | ❌ | Not established |

**Section estimate:** ~40% complete

---

## E. Legal & Trust

| Item | Status | Reference |
|------|--------|-----------|
| Terms of Service | ✅ | `src/pages/marketing/Terms.tsx` |
| Privacy Policy | ✅ | `src/pages/marketing/Privacy.tsx` |
| Cookie / consent banner (EU) | ❌ | Not implemented |
| Accessibility statement | ❌ | Not published |
| Trademark clearance | ❌ | Out of repo scope |
| security.txt / bug bounty | ❌ | Not published |
| AI-output disclaimer in ToS | ✅ | `Terms.tsx` §7 |

**Section estimate:** ~45% complete

---

## F. Go-Live Checklist

| Item | Status | Reference |
|------|--------|-----------|
| DNS / SSL / CDN | ⚠️ | `clarityapp.ai` + Lovable preview documented in deploy checklist |
| Production secrets rotated | ⚠️ | Manual; `DEPLOY_PRODUCTION_CHECKLIST.md` |
| DB backups + restore drill | ❌ | Supabase default; drill not recorded |
| On-call alerting | ❌ | Not configured |
| Rollback plan rehearsed | ❌ | Not documented |
| Launch-day support staffing | ❌ | Operational |
| Marketing / app tier consistency | ⚠️ | `Pricing.tsx` vs `src/lib/constants/plans.ts` — verify before launch |
| Post-deploy smoke test | ⚠️ | `scripts/smoke-edge.sh`, manual steps in deploy checklist |
| Pre-deploy validation script | ✅ | `scripts/pre-deploy-check.mjs` (Phase 4: session migration + secrets) |

**Section estimate:** ~30% complete

---

## Overall completion estimate

| Section | Weight | Est. |
|---------|--------|------|
| A Engineering | 25% | 40% |
| B Security | 25% | 55% |
| C Billing | 15% | 45% |
| D Support | 10% | 40% |
| E Legal | 10% | 45% |
| F Go-live | 15% | 30% |

**Weighted overall: ~43%** toward full Clarify AI launch checklist.

**P0 before public launch (from audits):** apply security migrations, deploy edge functions, set secrets, Stripe round-trip, block or gate practice rooms WebRTC, enable leaked-password protection in Supabase Auth.

---

## Phase 4 deliverables (this pass)

| Deliverable | Status |
|-------------|--------|
| Server-side session-type AI enforcement | ✅ |
| `Clarify AI_ALIGNMENT.md` | ✅ |
| `Clarify AI_SPEC.md` | ✅ |
| `pre-deploy-check.mjs` session migration check | ✅ |
| Terms Acceptable Use deception ban | ✅ |
