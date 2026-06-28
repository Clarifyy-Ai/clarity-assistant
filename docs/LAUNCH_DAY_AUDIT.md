# Clarify AI — Launch Day Production Audit

**Audit date:** June 29, 2026 (launch: June 30, 2026)  
**Scope:** Full application — web, Supabase, Edge Functions, Electron, billing, AI  
**Automated checks run:** `validate-env` ✓ · `pre-deploy` ✓ · `build` ✓ · `test:run` ✓ (172 pass)

---

## Executive Verdict

| Launch type | Verdict | Score |
|-------------|---------|-------|
| **B2C limited launch (tomorrow)** | **CONDITIONAL GO** | **78 / 100** |
| Enterprise / B2B contracts | **NO-GO** | 62 / 100 |
| Desktop-only beta | **GO** (after installer upload) | 82 / 100 |

**Bottom line:** You can launch tomorrow for a **controlled B2C release** on your existing Supabase project **if you complete the Tonight Checklist below**. Do not sell enterprise, trials, or high-traffic campaigns until P1 items are closed.

---

## Scorecard (Launch Day)

| Dimension | Score | Grade | Launch impact |
|-----------|-------|-------|---------------|
| Feature completeness | 82 | B | Core flows built |
| UI/UX | 83 | B | See `UI_UX_PRODUCTION_AUDIT.md` |
| Web build & deploy | 88 | B+ | Build passes |
| Electron desktop | 80 | B | Fixed blank screen + slow boot |
| Security | 68 | C+ | RLS strong; share/rate-limit gaps |
| Billing / Stripe | 62 | D+ | Works but refund/trial gaps |
| AI pipeline | 72 | C+ | Gemini + Deepgram wired |
| Database / migrations | 85 | B+ | Pre-deploy checks pass |
| Observability | 65 | D+ | Sentry optional; no paging |
| QA coverage | 61 | D | 287/919 items not tested |
| Performance | 70 | C+ | Main bundle ~1MB (307 KB gzip) |

**Overall launch readiness: 78 / 100 — Conditional GO**

---

## What Passed Today (Automated)

```
✅ npm run validate-env
✅ npm run pre-deploy (19 migrations, 45 edge functions, session enforcement)
✅ npm run build (42s)
✅ npm run test:run — 172 tests passed, 776 placeholder todos skipped
✅ Electron — window opens, sign-in renders (release/Clarify AI Setup 1.0.0.exe)
✅ Compliance — capture evasion removed (COMPLIANCE_GATING.md)
```

---

## Tonight Checklist (Required Before Launch)

### 1. Backend (2–3 hours)

```powershell
cd clarity-assistant
npx supabase login
npx supabase link --project-ref qzgvjrvtkwlzxpmlddkx
npx supabase db push
node scripts/deploy-all-edge-functions.mjs
```

**Verify Supabase Edge secrets are set:**

| Secret | Required |
|--------|----------|
| `GEMINI_API_KEY` | Yes — AI hints, answers, debrief |
| `DEEPGRAM_API_KEY` | Yes — live transcription |
| `DEEPGRAM_PROJECT_ID` | Yes |
| `SYSTEM_USER_ID` | Yes — AI question owner |
| `ALLOWED_ORIGINS` | Yes — include production URL |
| `STRIPE_SECRET_KEY` | Yes — billing |
| `STRIPE_WEBHOOK_SECRET` | Yes |
| `RESEND_API_KEY` | Optional — email reminders |

**Recommended `ALLOWED_ORIGINS`:**
```
https://clarify.ai.sltfinanceindia.com,https://clarityapp.ai,https://www.clarityapp.ai,http://localhost:5173
```

### 2. Frontend deploy (30 min)

Set production env vars on host (Lovable/Vercel/etc.):

```bash
VITE_SUPABASE_URL=https://qzgvjrvtkwlzxpmlddkx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon>
VITE_SUPABASE_PUBLISHABLE_KEY=<anon>
VITE_APP_ENV=production
VITE_APP_URL=https://clarify.ai.sltfinanceindia.com
VITE_DESKTOP_DOWNLOAD_URL_WIN=<after installer upload>
VITE_STRIPE_PUBLIC_KEY=<pk_live_...>
# Stripe price IDs — all VITE_STRIPE_PRICE_* vars
```

Rebuild and deploy from `main`.

### 3. Desktop installer (30 min)

```powershell
npm run dist:win
# Add SUPABASE_SERVICE_ROLE_KEY to .env.local, then:
npm run publish:desktop-installer
# Redeploy web with printed VITE_DESKTOP_DOWNLOAD_URL_WIN
```

Or distribute `release\Clarify AI Setup 1.0.0.exe` directly for early users.

### 4. Stripe webhook (15 min)

- Stripe Dashboard → Webhooks → endpoint: `https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`
- Smoke: test checkout → credits update in app

### 5. Manual smoke test (45 min) — must all pass

| # | Flow | Pass? |
|---|------|-------|
| 1 | Landing → Signup → Verify email → Onboarding → Dashboard | ☐ |
| 2 | Login → Mock interview start → questions generate | ☐ |
| 3 | Live Practice Coach (desktop) → audio → transcript → AI hint | ☐ |
| 4 | Prep Lab → STAR builder / rephraser returns output | ☐ |
| 5 | Documents → upload resume → parse completes | ☐ |
| 6 | Debrief page loads after mock session | ☐ |
| 7 | Settings → Billing → upgrade modal opens | ☐ |
| 8 | Admin dashboard (admin account only) | ☐ |

```bash
SUPABASE_URL=... ANON_KEY=... bash scripts/smoke-edge.sh
```

---

## P0 Blockers — Status

| # | Issue | Status | Launch risk |
|---|-------|--------|-------------|
| 1 | Hardcoded Supabase credentials | ✅ Fixed | — |
| 2 | Storage IDOR (parse-resume/document) | ✅ Fixed | — |
| 3 | Public share RLS enumeration | ⚠ Mitigated | Token RPC in migration `20260628161000` — verify deployed |
| 4 | refund_credits RPC | ⚠ Partial | Migration `20260628160000` — test AI failure refund manually |
| 5 | Four divergent credit cost tables | ❌ Open | Low risk day-1 if costs conservative |
| 6 | create-checkout syntax | ✅ Fixed | — |
| 7 | cancel/resume-subscription imports | ✅ Fixed | — |
| 8 | Stripe plan_id sync on subscription.updated | ⚠ Open | Monitor webhook logs launch day |
| 9 | derivePlanId defaults to "pro" | ⚠ Open | Verify checkout metadata |
| 10 | audit_logs migration | ✅ In pre-deploy | Run db push |
| 11 | ai_usage_logs RLS | ✅ Migration `20260628164000` | Deploy |
| 12 | Distributed rate limiting | ❌ Open | Accept for limited launch |

---

## Feature Matrix — Launch Ready?

| Feature | Ready | Notes |
|---------|-------|-------|
| Auth (email/password) | ✅ | |
| OAuth | ⚠ | Verify providers enabled in Supabase |
| Onboarding wizard | ✅ | |
| Dashboard | ✅ | |
| Mock interviews | ⚠ | Depends on edge deploy + GEMINI_API_KEY |
| Live Practice Coach | ⚠ | **Desktop only** — web shows install gate |
| Electron desktop app | ✅ | Rebuilt; SmartScreen unsigned warning expected |
| Prep Lab | ⚠ | Test prep-tool + polish-star-section after deploy |
| Mock tests (JEE/NEET) | ⚠ | India region gate |
| Documents / resume parse | ⚠ | Test after edge deploy |
| Debrief / analytics | ✅ | |
| Billing / Stripe | ⚠ | Smoke checkout required |
| Free trial | ❌ | Disable marketing claims about trials |
| Admin panel | ⚠ | Client gate + RLS backstop |
| GDPR export/delete | ⚠ | Test after audit_logs migration |
| Referrals / rooms | ⚠ | Secondary — don't promote launch day |

---

## QA Checklist Summary

| Status | Count |
|--------|-------|
| Implemented | 560 |
| Not Tested | 287 |
| Blocked | 17 |
| Pass | 9 |
| N/A | 46 |
| **Total** | **919** |

**17 Blocked items** — mostly desktop/Electron, pen-test, and enterprise features. Not launch blockers for web B2C.

**Priority manual test:** Run Admin → QA Checklist and mark launch-path items Pass/ Fail tonight.

---

## Performance (Launch Acceptable)

| Asset | Size | Note |
|-------|------|------|
| Main bundle | 1,009 KB (307 KB gzip) | Large but acceptable for v1 |
| SessionDetail chunk | 372 KB | Lazy-loaded |
| vendor-charts | 383 KB | Lazy-loaded |
| Build time | ~42s | OK |

Post-launch: split SessionDetail, defer qaChecklist JSON from admin path.

---

## Security — Launch Posture

**Acceptable for limited B2C launch:**
- Supabase RLS on user data
- Server-side AI keys (no client secrets)
- Stripe webhook HMAC verification
- Session enforcement on AI edge functions
- Capture evasion removed

**Known gaps (document, don't exploit):**
- CSP allows `unsafe-inline`
- JWT in localStorage (XSS = session theft)
- In-memory rate limits (per edge isolate)
- No MFA
- npm audit non-blocking in CI

---

## Electron / Desktop

| Item | Status |
|------|--------|
| App opens | ✅ Fixed (window-state + boot splash) |
| Sign-in renders | ✅ Verified |
| Hash router | ✅ |
| Installer download (web) | ⚠ Upload to Supabase Storage + redeploy |
| Code signing | ❌ SmartScreen warning — document for users |
| GitHub Release | ❌ Not published |

---

## CI / Quality Gates

| Gate | Status |
|------|--------|
| ESLint | In CI |
| Typecheck | ⚠ Was failing (missing `baseUrl`) — fixed in tsconfig |
| Unit tests | 172 pass |
| E2E Playwright | 10 specs — run locally before launch |
| npm audit | Non-blocking |

```powershell
npm run typecheck
npm run test:e2e -- e2e/smoke.spec.ts e2e/login.spec.ts
```

---

## Do NOT Promise at Launch

- Free trials (not wired end-to-end)
- Enterprise / team accounts
- Unsigned desktop app without SmartScreen instructions
- 100% QA checklist coverage
- Pen-test sign-off
- SLA / uptime guarantees

---

## Launch Day Runbook (June 30)

**Morning (T-4h):**
1. Confirm `db push` + edge deploy completed overnight
2. Run 8-step manual smoke (above)
3. Verify Stripe webhook deliveries (last 24h)
4. Check Supabase logs for 502/CORS errors

**Go-live (T-0):**
1. Deploy frontend production build
2. Publish desktop installer URL
3. Monitor Sentry (if `VITE_SENTRY_DSN` set) + Supabase logs

**First 4 hours:**
- Watch `generate-hint`, `generate-answer`, `deepgram-token` error rates
- Watch Stripe webhook failures
- Support channel ready for: audio permission, SmartScreen, login issues

**Rollback:** See `docs/RUNBOOK.md`

---

## Post-Launch (Week 1)

1. Unify credit cost tables (billing truth)
2. Fix trial flow or remove from marketing
3. Tighten public share + rate limits
4. Wire `logAICost` for AI observability
5. Complete 287 untested QA items for top flows
6. Code-sign Electron build
7. Enable Sentry + PostHog in production

---

## Related Docs

- `docs/ENTERPRISE_PRODUCTION_AUDIT_2026-06-28.md` — full enterprise review
- `docs/UI_UX_PRODUCTION_AUDIT.md` — design system audit
- `docs/DEPLOY_PRODUCTION_CHECKLIST.md` — deploy commands
- `docs/ELECTRON_RELEASE.md` — desktop publish
- `docs/RUNBOOK.md` — incident response
- `docs/COMPLIANCE_GATING.md` — feature compliance

---

**Signed off for B2C limited launch:** Complete Tonight Checklist → run smoke tests → **GO**  
**Enterprise launch:** Re-audit after Week 1 hardening
