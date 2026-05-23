# Plan: Complete Remaining Audit Items (P0-B, P1, P2)

Continuing from the post-fix audit. P0-A (marketing purge) is done. Remaining work falls into three buckets.

## P0-B — Verification (no code changes, just confirm)

1. **Retention cron** — Query `cron.job` to confirm `delete_expired_session_data()` is scheduled and last run succeeded.
2. **Stripe price/metadata** — Read `stripe-webhook/index.ts` to confirm it reads `monthly_credits` from price metadata, and document the manual Stripe Dashboard checks the user must perform (price IDs, metadata keys).

**Guardrail:** No DB or webhook code changes — verification only. If misalignment is found, surface it as a separate follow-up.

## P1 — Quality Fixes (component-scoped)

3. **Dashboard readiness score** — `src/pages/app/Dashboard.tsx`: wire the existing `useConfidenceScore` hook into a new compact `ReadinessCard` component. Do not touch other dashboard widgets.
4. **Low-credit toasts** — `src/hooks/useCredits.ts` (or equivalent): emit a `sonner` warning toast when balance drops below 20 and a second at 5. One-shot per threshold per session (use `useRef` guard). No changes to deduction logic.
5. **Enterprise `∞` rendering** — `src/components/pricing/PricingCard.tsx`: render `∞` (or "Unlimited") when `monthly_credits` is null/`-1` for the Enterprise tier. Pure presentation fix.

**Guardrail:** Each change is one file + minimal additions. No refactors to credit deduction, pricing logic, or dashboard data fetching.

## P2 — Dead Code Cleanup

6. **`src/App.tsx`** — Remove 9 unused lazy imports for mock-test pages (routes already redirect to dashboard).
7. **`src/components/layout/AppSidebar.tsx`** — Remove unreachable mock-test conditional branch.
8. **`supabase/functions/_shared/cors.ts`** — Remove stale `x-byok-*` entries from allowed headers list.

**Guardrail:** Pure deletions of already-dead code. No behavior changes.

## Out of Scope

- Inert model-picker UI in settings (deferred, low-risk cosmetic).
- Any new features, schema changes, or edge function rewrites.
- Re-enabling any stealth/BYOK/multi-model functionality.

## Verification After Build

- `rg` for residual `mock-test` imports in `App.tsx` → expect 0.
- Manual click-through: Dashboard shows readiness card; trigger a credit deduction near threshold to see toast; Enterprise pricing card shows `∞`.
- `supabase--read_query` on `cron.job` to confirm retention schedule.

## Execution Order

P0-B (verify) → P2 (safe deletions) → P1 (Dashboard → toasts → pricing card), one component at a time.