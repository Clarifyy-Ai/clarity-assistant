# Audit Remediation Plan — All 17 Fixes

Per your memory rules, I'll execute **component-by-component**, never touching working features beyond the listed change, and grouping fixes into 4 phases that match the audit's priority tiers. Each item lists the **only** file(s) I will touch and what I will change.

## Guardrails (apply to every step)

- Touch only the files listed for each item.
- No refactors outside the named change. No "while I'm here" edits.
- Semantic-token swaps only replace raw color classes — no layout, spacing, or copy changes.
- No migrations to data (only RLS policy migrations in Phase 1).
- After each phase: skim build output; stop on the first regression.

---

## Phase 1 — 🔴 Critical (security migrations)

**1. `request_metrics` INSERT policy**
- Migration: drop existing INSERT policy, recreate with `WITH CHECK (user_id = auth.uid())`. Keep service_role bypass.

**2. `feature_flags` SELECT policy**
- Migration: drop `USING (true)`, replace with `USING (public.has_role(auth.uid(), 'admin'))`. Frontend reads flags via an edge function or seeded defaults — verify no client-side direct read before locking down. If client reads exist, expose a public-safe `feature_flags_public` view with only non-sensitive flags.

## Phase 2 — 🟠 High

**3. `PreSessionSetupWizard.tsx`** — swap `text-gray-*` → `text-muted-foreground`/`text-foreground`, `bg-white` → `bg-card`/`bg-background`. No structural changes.

**4. Responsive grid prefixes** (5 files, 1-line edits each):
- `OnboardingStep3Preferences.tsx:108` → `grid-cols-1 sm:grid-cols-3`
- `Login.tsx:257`, `Signup.tsx:357` → `grid-cols-1 sm:grid-cols-2`
- `PreSessionSetupWizard.tsx:579,624` → `grid-cols-1 md:grid-cols-4` / `md:grid-cols-2`

**5. `AdminLayout.tsx:23`** — gate redirect on `isProfileLoaded`; show a small loader otherwise.

**6. `InterviewDay.tsx`** — add `isLoading`/`error` states with skeleton + retry. (`Profile.tsx` already has them per current code in context — will verify and skip if so.)

## Phase 3 — 🟡 Medium

**7. Tables overflow** — wrap `<table>` in `BillingHistory.tsx` and `ExcelImportTab.tsx` with `<div className="overflow-x-auto">`.

**8. `NotFound.tsx`** — add `usePageMeta({ title, description, noindex: true })`, swap `<a>` → `<Link>`. (Will extend `usePageMeta` to accept `noindex` if not already supported — see #12.)

**9. Semantic tokens** in `PricingCard.tsx`, `UpgradeModal.tsx`, `PlanGate.tsx`, `Scorecard.tsx` — swap `text-black`/`bg-black` → `text-foreground`/`bg-background` (or `bg-card`).

**10. Blog/Help CMS** — **Defer**. This is a 2-table migration + admin CRUD + content migration. Will instead add a `// STATIC-BY-DESIGN` comment header documenting the decision, and create a follow-up task. Tell me if you want me to do the full DB migration now.

**11. Anon key** — move hardcoded `CONNECTED_SUPABASE_*` constants in `src/lib/env.ts` behind `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` env-only (keep fallback throwing a clear error in prod). Verify `.env` is populated (Lovable auto-populates these).

## Phase 4 — 🔵 Low

**12. SEO depth** — extend `usePageMeta` to support `ogImage`, `ogType`, `canonical`, `noindex`, `jsonLd`. Sitewide og:* stay in `index.html`.

**13. CodingHints / SystemDesign → DB** — **Defer** (same reason as #10). Comment + follow-up.

**14. `@ts-nocheck` audit** — **Defer**. Listed ~20 files; safe removal requires per-file schema reconciliation. Will create a tracked task; not done in this batch.

**15. Typography** — `BlogPost.tsx:478` `sm:text-4xl` → `md:text-4xl`; `Login.tsx`/`Signup.tsx` heading → `text-3xl md:text-4xl`.

**16. Skeletons** — `Referrals.tsx`, `Notifications.tsx` loading skeletons.

**17. Settings grids** — `SettingsProfile.tsx:193`, `SettingsCredits.tsx:130,174` → `grid-cols-1 sm:grid-cols-2`.

---

## What I will NOT do without explicit approval

- Build full CMS for blog/help (#10) or move CodingHints/SystemDesign to DB (#13) — large scope, deserves its own plan.
- Remove `@ts-nocheck` en masse (#14) — schema-drift risk.
- Touch any feature outside the file list above.

## Execution order

Phase 1 (migration approvals) → Phase 2 → Phase 3 → Phase 4. I'll batch parallel edits per phase and pause for the security migration approvals between #1 and #2.

Reply **approve** to proceed, or tell me which items to drop/add.