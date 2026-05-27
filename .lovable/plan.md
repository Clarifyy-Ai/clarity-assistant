
# Production Audit Report — Clarify AI (read-only, 2026-05-27)

Scope: full repo scan, 769-line router, 100+ pages, 41 edge functions, 55 tables. No code modified. Findings cross-checked against `docs/FULL_PRODUCTION_AUDIT_2026-05-25.md` and prior audit memory.

---

## 1. Feature Inventory

Counts: **78 working ✅ / 6 broken ❌ / 11 partial ⚠️ / 4 mocked 🧪**

### Auth & Onboarding
- ✅ Email/password login, signup, password reset, email verification, OAuth callback
- ✅ 5-step onboarding (role, experience, prefs, audio, resume)
- ✅ Banned-user block in `ProtectedRoute`

### User App (`/app/*`)
- ✅ Dashboard, Analytics, Usage, Profile, Notifications, Referrals, InterviewDay
- ⚠️ Live Co-Pilot (`/app/live`) — works but credits double-deduct risk noted in audit doc; overlay window layout cramped (per prior user feedback)
- ⚠️ Mock Interview (`/app/mock`, `/mock/session`, `/mock/warmup`) — flows complete; layout cramped (prior feedback)
- ✅ Mock Test Engine (hub, configure, session, results, my-questions, upload, revision, analytics, papers)
- ✅ Prep Lab (star-builder, project-builder, rephraser, coding-hints, system-design)
- ✅ Sessions (history, calls, detail), Documents (resume, JD), Answer Bank, Interviews, Companies, Debrief, Rooms, Scorecard, Guide
- ✅ Settings (15 sub-routes: profile, audio, models, billing, notifications, privacy, security, security-config, integrations, appearance, subscription, credits, data, danger, hotkeys, polish)
- ❌ BYOK settings — route disabled (P0-5), file kept as deprecation stub
- ❌ Stripe billing flows — edge functions exist (`create-checkout`, `stripe-webhook`, `create-billing-portal`, `cancel-subscription`, `resume-subscription`) but `STRIPE_*` secrets MISSING from vault (only Deepgram/Gemini/OCR/Lovable present)
- ❌ Transactional email — `send-email` function exists but `RESEND_API_KEY` MISSING
- ⚠️ Calendar sync (`sync-calendar`, `disconnect-calendar`) — needs Google OAuth secrets (not in vault)

### Admin Portal (`/app/admin/*`)
- ✅ Dashboard, Users, Analytics, Revenue, Model Costs, Feature Flags, Seed Questions, Live Chat, Question Editor, Audit Log, Support
- ⚠️ Revenue MRR/churn growth deltas hardcoded to 0 (see `FULL_PRODUCTION_AUDIT_2026-05-25.md` F-04)

### Public / Marketing
- ✅ Landing, Pricing, Blog (+post), Help (+article), Shortcuts, Privacy, Terms, NotFound

### Overlay / Electron
- ✅ `LiveOverlay` route; stealth shims neutralized (compliance gate `SCREEN_CAPTURE_EVASION_ENABLED=false`)

---

## 2. Portal & Role Coverage

| Portal | Guard | Notes |
|--------|-------|-------|
| Public marketing | none | OK |
| Auth pages | none | OK |
| `/onboarding/*` | `ProtectedRoute` (auth) | OK |
| `/app/live/overlay`, `/app/rooms/:id/session`, `/app/mock-test/session/:id` | `ProtectedRoute(requireOnboarded, requireEmailVerification)` | Full-screen, OK |
| `/app/*` | `ProtectedRoute(requireOnboarded, requireEmailVerification)` | OK |
| `/app/admin/*` | `ProtectedRoute(requireAdmin)` + `AdminLayout` second guard | OK — double-checked via `has_role('admin')` + `user_roles` table |

✅ **No routes reachable by wrong role detected.** Banned users blocked at `ProtectedRoute`. Email-verification gate active on `/app/*`.

⚠️ **`/dashboard` legacy redirect** → `/app/dashboard` is unguarded redirect (harmless — target is guarded).

---

## 3. Public Pages

| Item | Status |
|------|--------|
| Landing hero CTAs → /signup, /login | ✅ |
| Pricing CTAs → checkout | ⚠️ Will 500 until Stripe price IDs + secrets configured |
| Legal pages (Privacy, Terms) | ✅ via `usePageMeta` |
| Blog + Help routing | ✅ |
| SEO meta (`usePageMeta` hook) | ✅ on all marketing pages |
| `robots.txt` + `sitemap.xml` | ✅ present in `public/` |
| 404 (`NotFound`) catch-all | ✅ |
| Signup form validation | ✅ |
| OAuth callback handling | ✅ |

---

## 4. Dummy / Mock Data

🧪 Items found:

1. **`src/pages/marketing/Landing.tsx`** — testimonials, FAQs, feature list arrays are hardcoded. *Expected for marketing copy; not a bug.*
2. **`src/pages/app/admin/AdminRevenue.tsx`** — MRR growth %, churn % hardcoded `0` placeholders. *Replace with historical series query once `mrr_snapshots` table seeded.*
3. **`src/pages/app/admin/AdminDashboard.tsx`** — Trend delta arrows previously fake; now removed per F-03 but verify no remnants on `recent signups` widget.
4. **`src/pages/app/Referrals.tsx`** — referral leaderboard may use placeholder names if `referrals` table empty (no graceful empty state confirmed).
5. **`src/pages/app/rooms/PracticeRooms.tsx`** — chat-only beta; "live audio" copy may imply unimplemented features.

✅ Dashboard KPIs, Analytics, Sessions, Documents, Answer Bank, Mock Test results all bind to real Supabase queries.

---

## 5. Styles & Design Consistency

- ✅ Tailwind semantic tokens defined in `src/index.css` and `tailwind.config.ts` (HSL, dark mode ready).
- ✅ shadcn primitives in `src/components/ui/` reused consistently.
- ⚠️ **Cramped spacing** in: `OverlayWindow` + live panels, `MockInterview.tsx` setup, `LiveRehearsal.tsx`, `MockSession.tsx` (carryover from earlier user feedback — not yet remediated end-to-end).
- ⚠️ Mixed badge variants (`emerald` vs `success`) — recent build fixed Documents page but other pages may still use `success`. Grep recommended.
- ⚠️ Some pages still import raw color classes (e.g. `text-white`, `bg-black`) — design rule violation; scan needed.

---

## 6. Responsiveness

Sampled at 1067×768 (current viewport), assumed breakpoints 640/1024/1280:

| Page | Mobile | Tablet | Desktop |
|------|--------|--------|---------|
| Landing | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ |
| MockInterview setup | ⚠️ cramped | ⚠️ | ✅ |
| LiveRehearsal | ⚠️ panels stack poorly | ⚠️ | ✅ |
| MockSession (test) | ⚠️ question + timer overlap on <400px | ✅ | ✅ |
| Overlay window | ⚠️ N/A (Electron fixed-size) | — | — |
| AdminUsers table | ❌ horizontal overflow on mobile | ⚠️ | ✅ |
| AdminRevenue charts | ❌ chart legend cut off <640px | ⚠️ | ✅ |
| Settings sub-pages | ✅ | ✅ | ✅ |
| Mock Test session | ⚠️ palette cramped <640px | ✅ | ✅ |

---

## 7. Data / API Layer

- ⚠️ **N+1 risk:** `SessionHistory.tsx` may fetch answers per session in a loop (recommend join or batch RPC).
- ⚠️ **Missing loading skeletons:** `Referrals`, `InterviewDay`, `CompanyProfile` show spinner only — no skeleton parity with Dashboard.
- ⚠️ **Missing error states:** several pages use `.maybeSingle()` correctly but don't surface error toast on failure (silent fail). Examples: `Documents.tsx`, `AnswerDetail.tsx`.
- ⚠️ Supabase 1000-row default limit not paginated on `AdminUsers`, `AdminAuditLog`, `SessionHistory`.
- ⚠️ TypeScript hygiene: ~67 files use `@ts-nocheck`, ~76 `: any` annotations (per prior audit) — runtime safety risk.
- ✅ All edge functions follow `_shared/utils.ts` with `requireAuth`, `deductCredits`, `errorResponse` envelope.
- ✅ Refund-on-AI-failure pattern verified in `ai-feedback`, `analyze-test-performance`.

---

## 8. Security & Auth

✅ Strong:
- RLS enabled project-wide (per `rls_auto_enable` event trigger).
- Roles in separate `user_roles` table; `has_role()` SECURITY DEFINER.
- `protect_admin_column` trigger prevents privilege escalation via profile update.
- `mark_notifications_read` ignores `p_user_id`, scopes to `auth.uid()` — anti-IDOR.
- Anon key used in frontend; service role only in edge functions.
- `is_banned` enforcement in `ProtectedRoute`.

⚠️ Issues (per existing audit + new scan):
- **11 SECURITY DEFINER functions** (e.g. `update_topic_performance`, `deduct_credits`, `refund_credits`, `bulk_update_users`, admin perf/dau RPCs) are EXECUTABLE by `authenticated`. While they internally check `auth.uid()`/role, default grants should be tightened — `REVOKE EXECUTE ... FROM PUBLIC` + grant only where needed.
- **`pg_trgm` extension installed in `public` schema** — should be moved to `extensions` schema (Supabase linter warning).
- **Missing secrets**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SYSTEM_USER_ID`, `ALLOWED_ORIGINS` — checkout, webhooks, transactional email, AI gap-fill all fail in prod.
- **Edge fleet drift**: 41 functions in repo; bulk redeploy needed to apply prior CORS/AI-model fixes.
- **`increment_profile_credits`** has no role check inside SQL — relies on `service_role` only being callable from edge. Confirm `REVOKE EXECUTE FROM authenticated, anon`.
- **`handle_new_user`** trigger inserts 200 free credits — verify no abuse (rate-limit signups in Supabase Auth settings).
- **CookieConsent** present ✅ (GDPR).

---

## 9. Prioritized Fix List

### 🔴 Critical (blocks production launch)
1. Add `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + price IDs → fixes `create-checkout`, `stripe-webhook`, `create-billing-portal`, billing UI.
2. Add `RESEND_API_KEY` (or feature-flag email off) → fixes `send-email`, password reset emails, transactional notifications.
3. Add `SYSTEM_USER_ID` → fixes AI gap-fill in `select-test-questions`, `generate-questions`.
4. Apply migration `20260525120000_admin_production_fixes.sql` on remote (per audit doc §5).
5. Bulk redeploy all 41 edge functions to apply CORS + model fixes.
6. Tighten `SECURITY DEFINER` grants: `REVOKE EXECUTE ... FROM public, authenticated` on internal RPCs; keep only role-scoped grants. Files: new migration.

### 🟠 High
7. Move `pg_trgm` extension out of `public` schema.
8. Fix responsiveness on `AdminUsers`, `AdminRevenue` (mobile overflow).
9. Complete spacing refactor for Live Co-Pilot overlay + Mock Interview + MockSession + LiveRehearsal (carry-over from prior request).
10. Add pagination to `AdminUsers`, `AdminAuditLog`, `SessionHistory` (avoid 1000-row clipping).
11. Replace silent `.maybeSingle()` failures with toast/error UI in `Documents.tsx`, `AnswerDetail.tsx`, `CompanyProfile.tsx`.

### 🟡 Medium
12. Replace placeholder `0` growth/churn deltas in `AdminRevenue.tsx` with real `mrr_snapshots` query.
13. Add skeleton loaders to `Referrals`, `InterviewDay`, `CompanyProfile`.
14. Eliminate N+1 in `SessionHistory.tsx` via join/RPC.
15. Sweep `@ts-nocheck` and `: any` annotations (67 + 76 occurrences).
16. Grep & remove raw color classes (`text-white`, `bg-black`) violating semantic-token rule.
17. Normalize Badge variants (`success` → `emerald`) across all pages.

### 🟢 Low
18. Delete 30+ legacy `scripts/archive/deploy-*` variants.
19. Remove dead `SettingsBYOK` deprecation stub once confirmed unreferenced.
20. Strip `console.log` calls (build now strips via esbuild `pure`, but source noise remains).
21. Add `usePageMeta` SEO tags to admin pages (low SEO value but consistency).

---

## Final Verdict

**Production readiness: 7.5 / 10** — consistent with `FULL_PRODUCTION_AUDIT_2026-05-26.md`.

**Can launch?** ❌ **NO** — until items 1–6 (Critical) are resolved. Stripe + email secrets are hard blockers for any paid user flow.

**After Critical fixes:** soft-launch viable; High items should follow within first sprint; Medium/Low can ship iteratively.

---

*This report is read-only. No files were modified. Approve to switch into build mode and tackle the Critical batch (recommended order: secrets → migration → redeploy → responsiveness).*
