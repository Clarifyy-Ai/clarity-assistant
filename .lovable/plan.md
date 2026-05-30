# Production Hardening Plan

Two input sources are merged here:
- **Security scan findings** (from `security--get_scan_results`): admin ban broken, "Make Admin" already partially fixed (verified in code), rate limiting on `send-email`/`export-user-data`/`delete-account`, raw `err.message` leakage in `analytics-dashboard` + `parse-question-pdf`, leaked-password protection (Supabase auth), realtime topic scoping, `referrals` over-permissive UPDATE, `room_chat` INSERT missing participant check.
- **Production audit** (20 prioritized items you provided).

Per your standing rules, work ships **component-by-component**, **no changes to features outside each phase's scope**, and each phase is independently verifiable.

---

## Phase 1 — Security: DB + RLS hardening (migration only)
**Guardrail:** schema changes only; no app code touched.

1. `referrals` UPDATE policy — drop blanket policy, recreate restricted to non-sensitive columns only (status changes handled server-side via service_role).
2. `room_chat` INSERT policy — add `WITH CHECK` requiring `EXISTS (room_participants WHERE room_id = NEW.room_id AND user_id = auth.uid())`.
3. `realtime.messages` SELECT — add topic-scoped policies for `room:<id>:*` (verify participation) and `support:<thread>:*` (verify ownership).
4. Verify `profiles` UPDATE policy has `WITH CHECK` that prevents self-elevating `role`/`is_admin` (trigger `protect_admin_column` already exists; confirm no UPDATE policy bypass exists, add explicit `WITH CHECK` if missing).
5. Apply pending `refund_credits` hardening from `docs/PENDING_MIGRATION_refund_credits_hardening.sql`.

Note: Supabase **leaked-password protection** is an Auth dashboard setting — cannot be toggled from migration. Flagged for user to enable in dashboard.

---

## Phase 2 — Security: Edge functions
**Guardrail:** no signature changes; only add rate-limit + sanitize error responses.

6. `send-email/index.ts` — add `enforceRateLimit` with `{limit:3, windowMs:60_000}` after auth.
7. `export-user-data/index.ts` — add `RATE_LIMIT_PRESETS.DATA_EXPORT` (2/h).
8. `delete-account/index.ts` — add `RATE_LIMIT_PRESETS.ACCOUNT_DELETION` (1/24h).
9. `analytics-dashboard/index.ts:200` — replace `err.message` with fixed `"Internal server error"`; keep `console.error` for the real error.
10. `parse-question-pdf/index.ts:137` — same treatment, generic message client-side.

Deploy all five via `supabase--deploy_edge_functions`.

---

## Phase 3 — Admin actions correctness
**Guardrail:** AdminUsers.tsx only.

11. `AdminUsers.tsx` — `make_admin` already correctly inserts into `user_roles` (verified at line 82-92, security finding is stale → mark fixed). `ban`/`unban` already toggles `is_banned` via `bulk_update_users` RPC (verified line 98-103, finding stale → mark fixed). Action: mark both findings fixed in scanner, no code change.
12. Add server-side `is_banned` gate to `start-session` and `generate-answer` edge functions (rejects 403 if banned).

---

## Phase 4 — Critical app fixes (audit 🔴)
**Guardrail:** one file per change, no cross-feature refactors.

13. `.single()` → `.maybeSingle()` in: `SessionDetail.tsx:53`, `DebriefDetail.tsx:85`, `TestResults.tsx:171`, `ResumeDetail.tsx:71`, `JDDetail.tsx:63`, `useGamification.ts:167/251/316`. Add null-guard + empty state per touched file.
14. `AdminDashboard.tsx` — wrap `fetchStats`, `RecentSignups`, `SessionVolumeChart` in try/catch with `finally { setLoading(false) }`.
15. N+1 elimination:
    - `AdminDashboard.tsx:238` — one ranged `sessions` query, bucket in JS.
    - `AdminAnalytics.tsx:85` — new `get_signup_series(p_days int)` RPC + replace 30-call loop.
16. `AdminLayout.tsx` — `hidden md:flex` on `<aside>` + Sheet-based mobile drawer trigger in top bar.

---

## Phase 5 — SEO meta on public pages
**Guardrail:** install `react-helmet-async`, add `<HelmetProvider>` in `main.tsx`, add per-page `<Helmet>` to 11 pages; remove static canonical from `index.html` to avoid duplicates. No layout changes.

Pages: Landing, Pricing, Blog, BlogPost, Help, HelpArticle, Terms, Privacy, Login, Signup, NotFound (latter with `noindex`).

---

## Phase 6 — Audit 🟠 High
17. `AdminDashboard.tsx:64` — replace `pro * 19` with `PLAN_PRICE_CENTS_MONTHLY`.
18. `AdminRevenue.tsx` — derive `mrrGrowth`, `churnRate` from Stripe webhook tables (`subscriptions.canceled_at`, period-over-period); compute `ltv = arpu / churnRate` once churn is real.
19. Extract `<PlanCTAButton>` component; replace `bg-violet-600`/`bg-amber-500` with semantic tokens in `UpgradeModal`, `PricingCard`, `PlanGate`, `ui/Tabs`.
20. Add `zod` schemas to `Login.tsx` and `Signup.tsx` via `react-hook-form`.

---

## Phase 7 — Audit 🟡 Medium + 🟢 Low
21. Landing testimonials — add "Illustrative" label (DB-backed deferred).
22. Landing FAQ — interpolate from `PLANS` constants.
23. AdminDashboard KPI deltas — WoW comparison.
24. Practice Rooms voice/video — hide disabled buttons until shipped.
25. Remove `// @ts-nocheck` from `Analytics.tsx` and `useStreakTracker.ts`, fix surfaced type errors.
26. `useGamification`, `useStreakTracker`, `useXPSystem` — `setError` on failure.
27. Consolidate anon key in `env.ts` only; have `client.ts` import from it.
28. Add `--surface-dark` token; replace raw `#0a0a0f`/`#1a1a2e` in `ErrorBoundary`, `PreSessionSetupWizard`.
29. Tighten overlay/footer copy widths.
30. Decide `/settings/byok` — recommend **delete** (BYOK already neutered per `byokVault.ts` shim).

---

## Recommended sequencing
- **Today:** Phase 1 + Phase 2 + Phase 3 (security closeout, low blast radius).
- **Next:** Phase 4 (correctness/N+1).
- **Then:** Phase 5 (SEO is mechanical), Phase 6, Phase 7.

## What I need from you
1. **Approve the phase order** above, or pick a subset to start (e.g. "do Phases 1–3 only").
2. **Confirm:** for AdminRevenue churn (item 18), should I treat a cancellation as `subscriptions.status='canceled'` in last 30 days / active 30 days ago? Or do you have a different definition?
3. **Confirm delete** of `src/pages/app/settings/BYOK.tsx` (item 30), since the BYOK vault is already a no-op shim.

Once you approve I'll implement Phase 1 first and stop for verification before moving on.
