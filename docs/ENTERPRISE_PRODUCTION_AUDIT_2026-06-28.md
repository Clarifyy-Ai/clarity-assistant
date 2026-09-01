# Career Pilot — Enterprise Production Audit & Go-Live Report

**Audit date:** June 28, 2026  
**Scope:** Full-stack — 125+ pages, 76 edge functions, 63 migrations, Electron overlay, Stripe billing, AI pipeline  
**Review board:** Architecture, Security, SRE, Database, Performance, QA, UI/UX, Compliance, Product  
**Build verified:** `npm run build` ✓ (40.7s)  
**QA checklist:** 919 items — 560 Implemented, 287 Not Tested, 17 Blocked, 9 Pass, 46 N/A

---

## Final Go-Live Recommendation

### ❌ Not Production Ready — Enterprise / B2B

Enterprise customers require: reproducible infra, pen-test sign-off, multi-tenant isolation, SLA monitoring, backup drills, unified billing truth, and schema integrity. **Multiple P0/P1 blockers remain.**

### ⚠ Production Ready After Critical Fixes — B2C Limited Launch

A **controlled B2C launch** against the **existing linked Supabase project** is feasible after completing the P0/P1 checklist below (estimated 2–3 engineering weeks). Not suitable for high-traffic or enterprise contracts until scalability and security hardening complete.

---

## Executive Summary

Career Pilot is a **feature-rich, architecturally sound** interview preparation platform with mature patterns in Supabase RLS, Stripe webhook idempotency, compliance gating (capture evasion removed), and server-side AI key management. The product covers live coaching, mock interviews, gov exam engine, prep lab, debrief analytics, documents, billing, admin, and Electron overlay.

**Critical gaps blocking enterprise go-live:**

1. **Security:** Storage IDOR in parse functions (fixed this audit), hardcoded Supabase credentials (fixed), public share RLS enumeration, in-memory rate limits, permissive CSP
2. **Billing:** Broken refund RPC, 4 divergent credit-cost tables, Stripe plan sync gaps, deploy-breaking edge function issues (partially fixed)
3. **Database:** Missing table migrations for fresh deploy, duplicate timestamps, broken indexes, audit_logs never migrated
4. **Observability:** AI cost logging defined but unwired; no on-call paging; restore drill not executed
5. **CI/CD:** E2E non-blocking, no migration lint, typecheck has 30+ errors
6. **Performance:** Main bundle 653 KB gzip 195 KB; SessionDetail chunk 373 KB

**Fixes applied during this audit cycle:**

| Fix | File(s) |
|-----|---------|
| Remove hardcoded Supabase URL/anon key | `src/integrations/supabase/client.ts` → uses `@/lib/env` |
| Close storage IDOR — server-side path resolution | `supabase/functions/parse-document/index.ts`, `parse-resume/index.ts` |
| Remove deploy-breaking syntax | `supabase/functions/create-checkout/index.ts` |
| Add missing Stripe/zod imports | `cancel-subscription`, `resume-subscription` |

---

## Scorecard

| Dimension | Score | Grade |
|-----------|-------|-------|
| **Overall Production Readiness** | **68%** | C+ |
| Feature Completion | 78% | B- |
| UI/UX | 83% | B |
| Security | 62% | D+ |
| Performance | 72% | C+ |
| AI Quality & Safety | 65% | D+ |
| Payment System | 55% | F |
| Scalability | 58% | D |
| Reliability / SRE | 60% | D |
| Accessibility | 86% | B+ |
| Code Quality | 65% | D+ |

---

## 1. Feature Audit Matrix

| Feature | Business Purpose | Status | Prod Ready | UX | Perf | Sec | Priority | Effort |
|---------|------------------|--------|------------|----|----|-----|----------|--------|
| **Authentication** | Secure access | Complete | ⚠ Partial | B | A | B | P1 | 3d |
| Email/password + OAuth | Login/signup | Complete | ✓ | B+ | A | B | — | — |
| Email verification gate | Reduce abuse | Complete | ✓ | C | A | A | P2 | 1d |
| Password reset | Account recovery | Complete | ✓ | B | A | B | — | — |
| Client login lockout | Brute-force mitigation | Partial | ⚠ Client-only | B | A | C | P1 | 2d |
| **Onboarding** | Activation funnel | Complete | ✓ | B+ | B | A | P2 | 2d |
| 5-step wizard | Profile/resume/audio | Complete | ✓ | B | B | A | — | — |
| SetupChecklist | First-run guidance | Complete | ✓ | A | A | A | — | — |
| **Dashboard** | Home hub | Complete | ✓ | A | B | A | P3 | 1d |
| **Resume/JD Management** | AI context | Complete | ⚠ | B | B | B→A* | P1 | 2d |
| Upload + parse | Extract skills | Complete | ⚠ IDOR fixed | B | B | A* | — | — |
| Cover letter parse | PDF extraction | Complete | ⚠ | B | B | B | P2 | 1d |
| **Live Practice Coach** | Core product | Complete | ✓ | B+ | C+ | B | P1 | 5d |
| Deepgram transcription | Real-time STT | Complete | ✓ | B | C | B | P2 | 3d |
| AI hints/answers (SSE) | Coaching | Complete | ✓ | A | C | B | P1 | 3d |
| Calm steps | Grounding UX | Complete | ✓ | A | A | A | — | — |
| **Mock Interviews** | Practice sessions | Complete | ✓ | B+ | B | A | P2 | 2d |
| **Mock Test Engine (JEE/NEET)** | Gov exams | Complete | ⚠ India-gated | B | B | B | P2 | 3d |
| **Prep Lab** | STAR, rephraser, coding | Complete | ✓ | B | B | B | P3 | 2d |
| **Debrief/Analytics** | Post-session insights | Complete | ⚠ | B+ | B | C | P1 | 3d |
| Public share links | Viral debrief | Partial | ❌ RLS gap | B | A | **F** | **P0** | 2d |
| **Billing/Credits** | Monetization | Partial | ❌ | B | A | B | **P0** | 2w |
| Stripe checkout/webhook | Subscriptions | Complete | ⚠ | B | A | A | P0 | 1w |
| Credit packs | One-time purchase | Complete | ⚠ | B | A | A | P1 | 3d |
| Trial logic | Free trial | **Missing** | ❌ | — | — | — | P1 | 5d |
| Refunds on AI failure | Fair billing | **Broken** | ❌ | C | — | B | **P0** | 3d |
| **BYOK** | Bring own keys | Deprecated | N/A | — | — | — | — | — |
| **Settings** | User prefs | Complete | ✓ | B | A | A | P3 | 2d |
| **Admin** | Operations | Complete | ⚠ | C | B | C | P1 | 1w |
| QA Checklist (919 items) | Internal QA | Partial | ⚠ 31% untested | B | — | — | P1 | ongoing |
| **Desktop Overlay (Electron)** | Practice overlay | Complete | ✓ | B+ | B | B+ | P2 | 3d |
| **Practice Rooms** | Peer practice | Partial | ⚠ | C | B | B | P3 | 1w |
| **Company Research** | Prep intel | Complete | ⚠ | B | C | B | P2 | 2d |
| **Referrals** | Growth | Partial | ⚠ | C | A | B | P3 | 3d |
| **GDPR Export/Delete** | Compliance | Complete | ⚠ audit_logs gap | B | B | B | P1 | 3d |
| **Notifications** | Engagement | Partial | ⚠ | C | A | A | P3 | 1w |
| **Gamification (XP/streaks)** | Retention | Complete | ✓ | B+ | A | A | P3 | — |

*Security upgraded after IDOR fix this cycle.

---

## 2. User Journey Audit

| Journey | Status | Dead Ends / Issues |
|---------|--------|-------------------|
| **Visitor → Landing → Pricing** | ✓ Clear funnel | — |
| **Signup → Verify Email → Onboarding → Dashboard** | ✓ | VerifyEmail layout inconsistent with auth pages |
| **Free user → first mock session** | ✓ | Credit pre-check may block without clear upgrade path on some flows |
| **Trial user** | ❌ Broken | `isInTrial()` always false; Stripe trial not configured |
| **Paid user → Live overlay** | ✓ | Audio permission failures need better recovery (partial) |
| **Expired/cancelled user** | ⚠ | Webhook downgrades after 3 failed payments; client grace period may desync |
| **Credit exhausted** | ✓ | LowCreditBanner + UpgradeModal |
| **Enterprise user** | ❌ | No org/team model; contact-sales only |
| **Admin** | ⚠ | Client-side gate only; RLS is backstop |
| **Password reset** | ✓ | — |
| **Logout / session timeout** | ✓ | SessionTimeoutBanner present |
| **Account deletion** | ⚠ | Works; audit_logs table may be missing |
| **Shared debrief (anon)** | ⚠ | Token not enforced at RLS layer |

---

## 3. UI/UX Audit

See `docs/UI_UX_PRODUCTION_AUDIT.md` for full detail. Summary:

| Area | Score | Key Issues |
|------|-------|------------|
| Design system | 82/100 | Dual Modal/Dialog, violet hardcoding in 100+ files |
| Page consistency | 80/100 | PageHeader added to top traffic; admin pages lag |
| Loading/empty/error | 85/100 | Standardized this cycle |
| Responsive | 82/100 | Admin mobile improved |
| Dark/light mode | 85/100 | Token migration in progress |
| Motion/a11y | 86/100 | Reduced-motion respected |

**Remaining UX debt:** LiveRehearsal vs LiveOverlay shell split; Settings sidebar isolation; dead SessionHistory route; Help search silent failure.

---

## 4. Performance Audit

| Metric | Finding | Target | Status |
|--------|---------|--------|--------|
| Main bundle | 653 KB (195 KB gzip) | <500 KB gzip | ⚠ |
| SessionDetail chunk | 373 KB (122 KB gzip) | Lazy split | ❌ |
| ExcelImportTab | 344 KB (117 KB gzip) | Admin-only lazy | ⚠ |
| vendor-charts | 383 KB | Route-level lazy | ⚠ |
| Build time | 40.7s | <60s | ✓ |
| Code splitting | Lazy routes in App.tsx | ✓ | ✓ |
| AI streaming latency | Gemini SSE proxy | <3s TTFB | ⚠ Unmeasured |
| Audio pipeline | Web Audio + Deepgram | Real-time | ✓ |
| DB indexes | Good on hot paths | — | ✓ |
| Caching | No CDN config in repo | Edge cache headers | ⚠ |
| Core Web Vitals | web-vitals wired; FID API deprecated | LCP/INP | ⚠ |

**Recommendations:** Split SessionDetail (pdf/chart deps), defer qaChecklist from main admin path, add bundle analyzer to CI, measure p95 AI TTFB in production.

---

## 5. Security Audit & OWASP Top 10

| OWASP | Rating | Key Evidence |
|-------|--------|--------------|
| A01 Broken Access Control | **High** | Public share RLS enumeration; admin UI-only gates; IDOR in parse (fixed) |
| A02 Cryptographic Failures | Medium | JWT in localStorage; hardcoded key removed |
| A03 Injection | Low–Medium | Zod + sanitizers; regex prompt injection only |
| A04 Insecure Design | Medium | In-memory rate limits; CSRF theater; ban check fails open |
| A05 Security Misconfiguration | **High** | CSP unsafe-inline; public /ping; CORS fallbacks |
| A06 Vulnerable Components | Not run | npm audit non-blocking in CI |
| A07 Auth Failures | Medium | Supabase auth solid; client lockout bypassable |
| A08 Integrity | Low | Stripe sig verification strong |
| A09 Logging | Medium | audit_logs table missing from migrations |
| A10 SSRF | Low | Known external URLs only |

**Security score: 62/100**

---

## 6. Penetration Test Simulation

| Attack | Result | Mitigation Status |
|--------|--------|-------------------|
| SQL Injection | **Blocked** | Supabase parameterized queries + RLS |
| XSS | **Partial** | React escaping; CSP weak (unsafe-inline) |
| CSRF | **N/A** | Bearer JWT (CSRF header unused) |
| Prompt injection | **Partial** | Regex blocklists; resume/JD context vulnerable |
| Session hijacking | **Risk** | localStorage JWT; XSS = takeover |
| Account takeover | **Partial** | Email verification; no MFA |
| Credential stuffing | **Weak** | Client-only lockout |
| Rate limit bypass | **Vulnerable** | Per-isolate memory limits |
| Privilege escalation | **Partial** | RLS strong; admin relies on RLS |
| File upload exploits | **Partial** | Path traversal blocked; no MIME magic-byte server check |
| Cross-tenant access | **Fixed (parse)** | IDOR closed this cycle |
| API abuse | **Partial** | Auth required; rate limits weak |
| Webhook forgery | **Blocked** | HMAC + replay window |
| Clickjacking | **Partial** | X-Frame-Options on edge |
| Business logic abuse | **Risk** | Credit cost mismatch; refund cap too low |

---

## 7. Payment & Subscription Audit

**Score: 55/100**

| Flow | Status | Edge Cases |
|------|--------|------------|
| Free signup | ✓ | 50 credits (economics aligned) |
| Checkout | ⚠ Fixed syntax | Price allowlist ✓ |
| Webhook idempotency | ✓ Strong | — |
| Monthly credit grant | ⚠ | Defaults to pro credits if metadata missing |
| Plan upgrade | ⚠ | New checkout; no in-app proration |
| Downgrade/cancel | ✓ | Cancel at period end |
| Trial | ❌ | Not wired end-to-end |
| Credit packs | ✓ | Idempotent on stripe_payment_id |
| Refunds (AI failure) | ❌ | RPC broken; MAX_REFUND=5 vs costs 8–20 |
| Payment failure retry | ✓ | 3 attempts → downgrade |
| Tax handling | ⚠ | Stripe Tax not explicitly configured |
| Razorpay | Present | India alt path; verify production config |

**4 credit cost sources of truth** — must unify before launch.

---

## 8. Database Audit

**Score: 58/100 for reproducibility; 75/100 for linked production project**

| Area | Status |
|------|--------|
| RLS coverage | Good — user_id scoping widespread |
| Credit RPC hardening | Excellent — client INSERT revoked |
| Missing tables (fresh deploy) | ❌ audit_logs, session_ai_interactions, user_achievements, model_cost_logs |
| Migration ordering | ❌ Indexes before tables in some files |
| Public share policy | ❌ Too permissive |
| Indexes | Good on sessions, questions; broken `questions(category,difficulty)` |
| Soft deletes | Partial — cleanup cron missing for documents |
| Backup/DR | ❌ Not drilled |
| Multi-tenancy | Single-user only (B2C) |

---

## 9. AI System Audit

**Score: 65/100**

| Area | Status |
|------|--------|
| Server-side keys | ✓ |
| Model routing | Partial — client choice often cosmetic; answers always Gemini SSE |
| Plan gating | Partial — resolveModel downgrades free; requirePlan rarely used |
| Credit deduct before AI | ✓ Edge functions |
| Streaming | ✓ generate-answer SSE; no mid-stream refund |
| Fallback chain | ✓ gemini-flash → templates |
| Prompt injection | Regex only — bypassable |
| Token/cost logging | ❌ logAICost() never called |
| Conversation persistence | ✓ session_transcripts |
| Hallucination mitigation | moderateOutput filter |

---

## 10. Traffic & Scalability

| Load | Assessment |
|------|------------|
| 100 concurrent | ✓ Likely OK on Supabase Pro + edge |
| 1,000 concurrent | ⚠ DB connection pool; edge cold starts |
| 10,000 concurrent | ❌ Needs Redis rate limits, read replicas, queue for AI |
| 100,000 concurrent | ❌ Not architected |
| 1M registered users | ⚠ Storage/transcript growth; no partitioning |

**SPOFs:** Single Supabase project, in-memory rate limits, no AI request queue.

---

## 11. Reliability Audit

**Score: 60/100**

| Component | Status |
|-----------|--------|
| Sentry | Wired in main.tsx |
| PostHog | Optional via env |
| Health checks | /ping (over-discloses) |
| Alerting | ❌ No paging |
| Runbook | ✓ docs/RUNBOOK.md |
| Retry/circuit breakers | Partial in AI provider |
| Graceful degradation | ✓ Offline templates in modelRouter |
| Backup restore drill | ❌ Not executed |

---

## 12. Accessibility Audit

**Score: 86/100 (WCAG 2.2 oriented)**

- ✓ Reduced motion global
- ✓ Focus rings on Button (fixed)
- ✓ aria-describedby on forms
- ✓ Skip links / main landmark
- ⚠ Touch targets xs buttons <44px on mobile CTAs
- ⚠ Some raw buttons outside design system

---

## 13. Code Quality Audit

**Score: 65/100**

| Area | Finding |
|------|---------|
| Architecture | Clean separation: stores, hooks, lib, pages |
| Type safety | 30+ typecheck errors (CI may not run typecheck strictly) |
| Dead code | withCreditDeduction unused; BYOK deprecated |
| Duplicate components | Modal vs Dialog; Skeleton x2 |
| Tests | Unit tests partial; billing tests TODO |
| E2E | Mocked Supabase; non-blocking |
| Documentation | Strong docs/ folder |

---

## Top 50 Critical Issues (Abbreviated — Full List in Priority Sections)

### P0 — Launch Blockers (12)

1. ~~Hardcoded Supabase credentials~~ **FIXED**
2. ~~Storage IDOR parse-document/parse-resume~~ **FIXED**
3. Public share RLS allows enumeration of all shared debriefs
4. refund_credits RPC signature mismatch + MAX_REFUND too low
5. Four divergent credit cost tables
6. ~~create-checkout deploy syntax error~~ **FIXED**
7. ~~cancel/resume-subscription missing imports~~ **FIXED**
8. Stripe subscription.updated doesn't sync plan_id
9. derivePlanId defaults to "pro" on missing metadata
10. audit_logs table never migrated — export/delete may fail
11. ai_usage_logs INSERT policy too permissive
12. Distributed rate limiting not implemented

### P1 — High (15)

13. Trial logic broken end-to-end  
14. logAICost never wired  
15. Mid-stream AI failure no refund policy  
16. check_free_tier_limits IDOR + unwired  
17. Fresh DB migration will fail (ordering, missing tables)  
18. Typecheck errors in CI path  
19. E2E non-blocking  
20. MIME/magic-byte upload validation  
21. Admin server-side enforcement beyond RLS  
22. CSP unsafe-inline  
23. /ping information disclosure  
24. npm audit non-blocking  
25. SessionDetail 373KB chunk  
26. Ban check fails open on edge  
27. Stripe webhook user_id ↔ customer cross-check  

### P2 — Medium (15)

28–42: UI violet codemod, Help search retry, SessionHistory dead route, idempotency_log purge cron, document cleanup cron, creditEconomics vs subscriptionManager PLANS drift, inferIntervalFromPriceId bug, CSRF remove or implement, Electron IPC bounds, public share rate limit, onboarding before verify, web-vitals FID deprecation, admin mobile polish, requirePlan on premium EFs, pen-test sign-off  

### P3 — Low (8)

43–50: OAuth provider typing, duplicate indexes, qaChecklist 287 untested, referral flow polish, practice rooms maturity, notifications depth, chart dangerouslySetInnerHTML audit, bundle analyzer in CI  

---

## Missing Features

- End-to-end Stripe free trial
- MFA / step-up auth for admin
- Team/org multi-tenancy (Enterprise)
- BYOK (deprecated at launch)
- In-app proration/plan change
- Antivirus on uploads
- AI request queue for burst traffic
- On-call paging / status page automation

## Duplicate Features

- Modal.tsx vs Radix Dialog
- SkeletonLoader vs skeleton.tsx
- subscriptionManager.PLANS vs creditEconomics vs pricing.ts
- OpenAI/Anthropic clients both proxy to generate-hint

---

## Production Launch Checklist

### Infrastructure
- [ ] Set all Supabase edge secrets (see DEPLOY_PRODUCTION_CHECKLIST.md)
- [ ] Deploy all 76 edge functions
- [ ] Run `npx supabase db push` on production
- [ ] Verify ALLOWED_ORIGINS includes production domains
- [ ] Enable Supabase leaked-password protection
- [ ] Configure PITR + execute restore drill

### Security
- [x] Remove hardcoded Supabase credentials
- [x] Fix parse storage IDOR
- [ ] Tighten public share RLS
- [ ] Implement distributed rate limiting
- [ ] Penetration test sign-off
- [ ] Rotate anon key (was in git history)

### Payments
- [x] Fix create-checkout syntax
- [x] Fix cancel/resume imports
- [ ] Unify credit costs
- [ ] Fix refund_credits RPC
- [ ] Sync plan_id on subscription.updated
- [ ] Smoke test checkout → webhook → credits

### AI
- [ ] Wire logAICost to all edge AI calls
- [ ] Define mid-stream refund policy
- [ ] Load test generate-answer p95 latency

### Testing
- [ ] Make E2E blocking in CI
- [ ] Add supabase db lint to CI
- [ ] Fix typecheck errors
- [ ] Complete 287 "Not Tested" QA items for launch paths

### Compliance
- [x] Capture evasion removed (COMPLIANCE_GATING.md)
- [ ] Legal review recorded
- [ ] GDPR export/delete verified with audit_logs

### Deployment
- [ ] `npm run pre-deploy` passes
- [ ] Smoke: login → live overlay → debrief → mock test
- [ ] Electron signed build for overlay release

---

## 30-Day Improvement Plan

**Week 1:** P0 security + billing (share RLS, refund RPC, credit unification, plan sync)  
**Week 2:** Database baseline migration squash; CI gates (typecheck, E2E blocking)  
**Week 3:** AI observability (logAICost), rate limit Redis/Upstash, performance splits  
**Week 4:** Restore drill, pen-test prep, trial flow, launch smoke on staging  

---

## 90-Day Product Roadmap

| Month | Focus |
|-------|-------|
| M1 | Production hardening, B2C launch, billing truth |
| M2 | Trial/MFA, admin server gates, bundle perf, real E2E against staging Supabase |
| M3 | Enterprise team model design, AI queue, read replicas, SOC2 prep |

---

*Generated by enterprise production audit — June 28, 2026.*

**Implementation pass (agents):** P0/P1 fixes applied — see `docs/DEPLOY_PRODUCTION_CHECKLIST.md` for new migrations `20260628160000`–`20260628165000`. Typecheck 0 errors; pre-deploy ✓; build ✓.
