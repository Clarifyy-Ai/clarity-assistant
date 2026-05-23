
# Clarify AI — Post-Fix Production Audit

Scope: re-verification of repository state after the P0 fix sprints. Findings anchored to current files. No new audit-from-scratch; only delta vs the prior fix plan.

---

## 1. Executive Summary

Overall posture has moved from **RED → AMBER**. Code-side P0 work (stealth removal, Gemini-only routing, BYOK shim, mock-test de-scope, pricing constants, live-page banner, CORS allowlist, retention cron) is in place. **One large P0 family is NOT fixed: marketing copy still aggressively sells the very features that were just removed** — stealth overlay invisibility, multi-model routing, BYOK, "98% undetection rate", and a 20-credit Free plan. This re-creates exactly the compliance, truth-in-advertising and consumer-protection risk the fix sprint was meant to eliminate.

Verdict: **NOT launch-ready** until Section 11 P0-A items are closed. After those, app is launchable as "AI interview practice + post-interview analytics, Gemini-only, 200/2,000/∞ credits, $0/$29/$79".

---

## 2. What Was Re-Verified From Previous Fixes

| Family | Status | Evidence |
|---|---|---|
| Stealth/covert features in app code | **FIXED** | `electron/main.cjs`: `skipTaskbar:false`, no `setContentProtection`, no panel/toolbar type. `src/lib/stealth/*` are no-op shims. `screenCaptureEvasion.ts` inert. |
| Gemini-only model routing | **FIXED** | `src/lib/ai/modelRouter.ts` returns `"gemini-flash"`; no OpenAI/Claude clients. |
| BYOK removal | **FIXED** | `byokVault.ts` is a 60-line no-op shim. `/app/settings/byok` route commented out in `App.tsx` (line 623). |
| Credit defaults 200 / 2000 / ∞ | **FIXED** | Migration `20260523172604_*.sql` sets `profiles.credits DEFAULT 200`, `subscriptions.monthly_credits DEFAULT 200`, rewrote `handle_new_user()` to seed 200. |
| Pricing constants single source of truth | **FIXED** | `src/lib/constants/pricing.ts` exports `PLAN_MONTHLY_CREDITS`, `formatMonthlyCredits`, `isUnlimited`. |
| Pricing page truth | **FIXED** | `src/pages/marketing/Pricing.tsx` — zero matches for stealth/byok/multi-model/Elite. |
| Mock-test de-scope | **FIXED (UI)** | Sidebar entry removed; all 9 `/app/mock-test/*` routes redirect to `/app/dashboard`. **Disconnected code remains** (9 lazy imports + isMockTestSection conditional in sidebar) — cleanup only. |
| Live Co-Pilot reframe banner | **FIXED** | `LiveRehearsal.tsx` setup phase renders amber "Practice only" banner. |
| CORS allowlist | **FIXED** | `_shared/cors.ts` uses `ALLOWED_ORIGINS` env + localhost dev + production fallback; no wildcard. Stale `x-byok-*` headers still in allow-list — harmless but should be pruned. |
| Retention cron | **PARTIALLY FIXED** | Migration `20260418165858_*.sql` schedules `delete_expired_session_data()` via `pg_cron`. Not yet verified live in dashboard; no admin "run now" UI. |
| Rate limiting on AI edge functions | **FIXED** | `_shared/rateLimit.ts` referenced by generate-hint, generate-answer, generate-debrief, ai-coach-chat, save-answer, save-transcript, deduct-credits, start/end-session, billing functions. |
| Account deletion + data export | **PARTIALLY FIXED** | `delete-account` and `export-user-data` edge functions exist; end-to-end verification pending. |
| Stripe webhook plan_id sync | **PARTIALLY FIXED** | `stripe-webhook` writes `plan_id` from metadata, downgrades to `free` on cancel. No verification that Stripe Dashboard price IDs match `$29 / $79`. |
| Privacy & Terms claims | **FIXED** | Zero matches for stealth/BYOK/AES-256/Claude/GPT-4 in `Privacy.tsx`, `Terms.tsx`. |

---

## 3. Manual Coverage Re-Audit Summary

| Manual area | Status | Notes |
|---|---|---|
| Setup & Onboarding | WORKING | Resume-driven onboarding; no `preferred_model` UI consequence (Gemini-only). |
| Dashboard | PARTIALLY WORKING | `useConfidenceScore` hook exists but **NOT imported in Dashboard.tsx** — readiness score still placeholder/disconnected (P1-1). |
| Documents / Resume | WORKING | Multi-layer extraction fallback already memoed. |
| Prep Tools | WORKING | Prep-tool edge fn deployed; STAR builder, rephraser, etc. live. |
| Mock Tests | DESCOPED | UI removed, DB tables retained per plan. ✓ |
| Overlay / Desktop | WORKING (non-covert) | Overlay renders as normal frameless window; visible in screen share by design. |
| Audio & Transcription | WORKING | Deepgram 60s tokens, dual-stream capture (Chromium only). |
| AI Answer Generation | WORKING | Gemini-only via `streamGeminiHint`; STAR enforcement, 2-credit cost. |
| Analytics & Debriefs | WORKING | `generate-debrief` deployed. |
| Billing / Credits / Subscriptions | PARTIALLY WORKING | Constants correct, but **Stripe Dashboard product/price IDs must be verified** to match `$29 / $79`; no in-app `∞` rendering for Enterprise (P1-3). |
| Settings / BYOK / Privacy / Notifications | PARTIALLY WORKING | BYOK page reads "not available"; notification toggles persist to `profiles.metadata` but no scheduled sender. |
| Troubleshooting / Export / Delete | PARTIALLY WORKING | Edge fns exist; UI wiring + smoke test needed. |

---

## 4. Feature Checklist Matrix (delta only)

| Feature | Status | Severity |
|---|---|---|
| Marketing claims of "invisible overlay" / "98% undetection" | **COMPLIANCE / POLICY RISK** | **P0** |
| Marketing claims of GPT-4o + Claude + Gemini smart routing | **MISMATCH (false advertising)** | **P0** |
| Marketing claim "BYOK on all paid plans" | **MISMATCH** | **P0** |
| HelpArticle Free plan = 20 credits / 3 live / 5 mock | **MISMATCH** (real: 200 cr) | **P0** |
| BlogPost.tsx multi-model claim | MISMATCH | P1 |
| Landing.tsx CTAs ("Stealth overlay undetectable by Zoom") | COMPLIANCE RISK | **P0** |
| Help.tsx "stealth overlay" copy | COMPLIANCE RISK | **P0** |
| Dashboard readiness score | DISCONNECTED | P1 |
| Low-credit warning toast | MISSING | P1 |
| Enterprise ∞ credit rendering | MISSING | P1 |
| Dead mock-test imports in App.tsx (lines 89-115) + sidebar conditional | DEAD CODE | P2 |
| `SettingsBYOK` lazy import still defined (line 214) for commented route | DEAD CODE | P2 |
| `x-byok-*` headers in `_shared/cors.ts` allow-list | STALE | P3 |
| pg_cron retention job verified running in prod DB | UNVERIFIED | P1 |
| Stripe price IDs match $29/$79 | UNVERIFIED (manual op) | **P0** |
| Manual chapters 6 / 8 / 11 / 13 rewritten | UNKNOWN (out of repo) | P0 |

---

## 5. End-to-End Flow Re-Audit (delta)

1. **Signup → Onboarding → Dashboard**: works; new user starts at 200 cr (verified via migration). ✓
2. **Resume + JD → gap analysis → prep**: working.
3. **Practice session → debrief**: working; rate-limited.
4. **Billing free → Pro upgrade**: code path correct, but live Stripe price IDs unverified.
5. **BYOK save → generate**: page correctly shows "not available"; vault shim wipes legacy localStorage. ✓
6. **Private Mode**: not re-audited in this sprint — placeholder.
7. **Export / delete account**: edge fns exist; UI button + signed-URL flow needs smoke test.
8. **Dashboard analytics refresh**: works for sessions; readiness score still hard-coded/placeholder.
9. **Marketing visitor → signup**: **broken at trust layer** — Landing/Help/HelpArticle promise features that no longer exist. High refund / chargeback / dispute risk after upgrade.

---

## 6–9. Frontend / Backend / DB / Billing Re-Audit (delta only)

**Frontend dead code (low risk, ship-blocking only for cleanliness):**
- `src/App.tsx` lines 89-115: 9 lazy imports of mock-test pages with no consumers.
- `src/App.tsx` lines 214-215: lazy import of `SettingsBYOK` for a commented-out route.
- `src/components/layout/AppSidebar.tsx` lines 229, 409-418: `isMockTestSection` conditional now unreachable.

**Backend / Edge:**
- `_shared/cors.ts` lines 71-74: BYOK headers still in allow-list. Prune.
- `stripe-webhook` line 246: monthly_credits read from `invoice.lines.data[0].metadata.monthly_credits`. Verify Stripe Dashboard product metadata carries `monthly_credits=2000` for Pro and `monthly_credits=` (null/large) for Enterprise.
- No `_shared/rateLimit.ts` tests; spot-check needed.

**DB / RLS:**
- `delete_expired_session_data()` scheduled in `pg_cron` migration. **Verify in prod via:** `SELECT * FROM cron.job WHERE jobname='retention_daily';` and `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;`.
- `v_user_readiness` view from plan §7 **not yet created** (P1).
- `credit_costs` table from plan §7 **not created** — costs still TS constants. Acceptable for launch.

**Security:**
- Functions hardened (`SET search_path = public`, `SECURITY DEFINER` where needed).
- `protect_admin_column` trigger in place.
- `bulk_update_users` admin-gated.
- No new findings flagged.

---

## 10. Fixed vs Remaining

**A. Fully fixed:** stealth lib (no-op), electron flags, model collapse to Gemini, BYOK shim, mock-test sidebar/routes, live banner, pricing constants, Pricing page, Privacy/Terms, credit defaults migration, CORS allowlist, retention cron scheduling SQL, rate limiter helper, delete-account + export-user-data edge fns deployed.

**B. Partially fixed:** Stripe webhook (code OK, Dashboard product config unverified), retention cron (scheduled, not verified running), account deletion UI/flow (edge fn present, end-to-end untested), notification toggles (stored, not sent).

**C. Still broken / D. Still missing:**
- **Marketing/Help/Landing/Blog copy still sells removed features** (largest remaining risk).
- Dashboard readiness score wiring (`useConfidenceScore` import).
- Low-credit toast wiring.
- Enterprise ∞ rendering on `CreditBalance` / `PricingCard`.
- STAR Builder → Answer Bank persistence (P1-8).
- Debrief consuming real transcript + scoring (P1-9).
- Send-digest cron (P1-5).

**E. Regressions introduced:** none observed. Dead-code from de-scope is inert.

**F. Manual ↔ implementation mismatches remaining:**
- Manual ch.6 (stealth) still authoritative externally — repo `docs/STEALTH_FEATURES.md` deletion not verified.
- Help/HelpArticle/Blog claims 3-model routing, BYOK, 20-cr free, "invisible overlay".
- Landing.tsx FAQ identical mismatches.

**G. Compliance / policy risks remaining:**
- Landing.tsx lines 39, 49, 108, 113, 137, 149, 173, 195, 198, 203, 218, 233, 273, 284, 401 — covert-assistance marketing language. Must be removed before public launch.
- Help.tsx lines 34-36; HelpArticle.tsx lines 16, 19-22, 32 — same.
- BlogPost.tsx line 92 — multi-model marketing claim.

---

## 11. Exact Files to Edit Next

### P0-A — Marketing & Help copy purge (blocker for launch)

| # | File | Change | Done criteria |
|---|---|---|---|
| 1 | `src/pages/marketing/Landing.tsx` | Remove every reference to: stealth / invisible / undetect / overlay-undetection / BYOK / GPT-4o / Claude / Gemini-smart-routing / multi-model / "98% undetection rate". Rewrite hero, features grid, comparison table, FAQ, footer chips to: "AI interview practice with live coach + post-interview debriefs · Powered by Google Gemini · $29 Pro / $79 Enterprise". | rg `-i 'stealth\|invisible\|undetect\|byok\|claude\|gpt-?4\|multi-?model'` returns 0 hits. |
| 2 | `src/pages/marketing/Help.tsx` | Rewrite questions `li-1`, `li-2`, `li-3`. Replace "invisible overlay" with "on-screen prep overlay" and "during your actual interview" with "during practice sessions". Replace model list with "Powered by Gemini 2.0 Flash". | Same grep clean. |
| 3 | `src/pages/marketing/HelpArticle.tsx` | Rewrite articles `gs-1`, `gs-4`, `li-1`, `li-2`, `li-3`, `ac-2`. Free plan = **200 credits**, not 20. Remove BYOK article (or replace with "BYOK on roadmap"). | Same grep clean; Free plan number matches `PLAN_MONTHLY_CREDITS.free`. |
| 4 | `src/pages/marketing/BlogPost.tsx` line 92 | Strike the "multiple AI models … smart routing" paragraph or rewrite as forward-looking. | Same grep clean. |
| 5 | `docs/STEALTH_FEATURES.md` (if present) | Delete file. | `ls docs/STEALTH_FEATURES.md` → not found. |
| 6 | External: Stripe Dashboard | Set Pro price = $29/mo, Enterprise = $79/mo, set product metadata `monthly_credits=2000` / `monthly_credits=999999`. | `stripe-webhook` logs show correct `monthly_credits` on test `invoice.payment_succeeded`. |

Priority: **P0**. Risk: low (copy-only). Effort: M (1 day). Manual verify: visit `/`, `/help`, `/help/li-1`, `/blog/*` — copy reads honestly; FAQ matches Pricing page.

### P0-B — Verify retention cron live

| # | File / op | Change | Done criteria |
|---|---|---|---|
| 7 | Run in Supabase SQL editor | `SELECT jobname, schedule, active FROM cron.job;` + `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 3;` | `retention_daily` row exists, `active=true`, last run succeeded. |

### P1 — Quality launch items

| # | File | Change |
|---|---|---|
| 8 | `src/pages/app/Dashboard.tsx` | Import `useConfidenceScore`; render value (or hide tile if score is 0). |
| 9 | `src/hooks/useCredits.ts` + `src/components/billing/CreditBalance.tsx` | When `isLow` flips true once per session, fire `sonner` warning toast with link to billing; render `∞` when `isUnlimited(plan)`. |
| 10 | `src/components/billing/PricingCard.tsx` | Use `formatMonthlyCredits(plan)` so Enterprise renders "Unlimited". |
| 11 | `supabase/functions/generate-debrief/index.ts` | Pull from `session_transcripts` + `session_answers`; persist `debriefs.overall_score`. |
| 12 | `src/store/answerBankStore.ts` + `useSTARBuilder` | Persist generated STAR answers to Answer Bank. |
| 13 | New edge fn `send-digest` or disable notification toggle UI until built. |

### P2 — Cleanup (post-launch acceptable)

| # | File | Change |
|---|---|---|
| 14 | `src/App.tsx` lines 89-115, 214-215 | Delete unused lazy imports for mock-test pages and `SettingsBYOK`. |
| 15 | `src/components/layout/AppSidebar.tsx` lines 229, 409-418 | Remove `isMockTestSection` conditional. |
| 16 | `supabase/functions/_shared/cors.ts` lines 71-74 | Drop `x-byok-openai/anthropic/gemini` from `ALLOWED_HEADERS`. |
| 17 | `src/pages/app/settings/SettingsBYOK.tsx` | Delete file (route already removed). |

---

## 12. Production Readiness Scorecard

| Dimension | Score /100 |
|---|---|
| Manual alignment | 55 (copy still off) |
| Feature completeness | 78 |
| End-to-end reliability | 75 |
| Backend integration | 82 |
| Database consistency | 88 |
| Security | 84 |
| Billing correctness | 70 (Stripe IDs unverified) |
| Privacy / retention | 80 (cron unverified live) |
| Accessibility | 72 |
| Responsiveness | 80 |
| Test coverage | 55 |
| Observability | 70 |
| Maintainability | 78 (dead code) |
| **Launch readiness** | **62** |

**Top remaining blockers (P0):** marketing/help copy purge; Stripe Dashboard price+metadata verification; live retention-cron check.
**Top quick wins (P1):** ∞ rendering, low-credit toast, dashboard readiness wiring.
**Top regressions:** none.
**Top cleanup:** dead mock-test/BYOK imports; stale CORS BYOK headers.

---

## 13. QA / Verification Checklist (pre-launch)

1. `rg -i 'stealth|invisible|undetect|byok|claude|gpt-?4|multi-?model' src/pages/marketing src/pages/app docs/` returns 0 hits.
2. Sign up new user → `SELECT credits FROM profiles WHERE email='qa+launch@…';` returns 200.
3. Stripe test-mode subscribe to Pro → webhook log shows `plan_id=pro`, `monthly_credits=2000`; profile updated.
4. Visit `/app/mock-test*` → redirects to `/app/dashboard`.
5. Visit `/app/settings/byok` → 404 / NotFound.
6. Live page setup screen shows amber "Practice only" banner.
7. Overlay window visible in Zoom share-screen test (macOS + Windows).
8. `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 3;` shows successful retention runs.
9. Delete-account flow purges profile + storage objects.
10. Export-user-data returns signed CSV URL.

---

## 14. Final Launch Verdict

**Conditional GO** — launch-ready once **P0-A copy purge** lands and **P0-B retention cron verification** + Stripe Dashboard price/metadata check pass. All other items (P1/P2) are non-blocking polish.

Approve this plan to switch to build mode and execute P0-A (marketing/help copy purge) first, then P1 quality items in order.
