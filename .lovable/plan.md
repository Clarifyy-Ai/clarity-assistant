# Audit Fix Plan — Phased

Per your standing rules, I'm splitting the audit fixes into small, component-scoped phases. Each phase ships only the named files; I'll wait for "go phase N" before moving on so you can verify no regressions.

## Guardrails (apply to every phase)
- Do NOT modify any working feature outside the named files for that phase.
- Do NOT touch locked items: stealth shims (`src/lib/stealth/*`), `docs/COMPLIANCE_GATING.md`, memory'd "do not re-add" entries (P0-2 stealth, dashboard re-add), edge functions unless explicitly named.
- Do NOT blanket-remove `@ts-nocheck` — only on files actually edited in the phase, and only if types still compile.
- Additive changes only to shared utilities (`fetchEdge`, `database.ts`, `authStore`).
- No new features. No design overhauls. No DB migrations unless explicitly listed.

---

## Phase A — CRITICAL: Supabase client consolidation
**Files:** `src/lib/supabase/client.ts`, `src/lib/supabase/index.ts`, `src/lib/env.ts`
- Make `src/lib/supabase/client.ts` re-export from `src/integrations/supabase/client.ts` (single instance, no duplicate auth listener).
- Remove duplicate `uploadFile` / `subscribeToTable` / `getSignedUrl` from `lib/supabase/client.ts` (keep the canonical ones in `lib/supabase/storage.ts` and `lib/supabase/realtime.ts`).
- Remove hardcoded Supabase URL/key fallbacks in `src/lib/env.ts` — fail loudly if env missing.
- Strip stray `console.log/warn` in `lib/supabase/client.ts:126,132,179`.

**Risk:** any consumer importing the removed helpers from `lib/supabase/client` will break. I'll grep and fix call sites in the same phase.

## Phase B — CRITICAL: Mobile table overflow
**Files (one fix per file, no other changes):**
- `src/pages/app/usage/UsageDashboard.tsx`
- `src/pages/app/mock-test/TestResults.tsx`
- `src/pages/marketing/Landing.tsx`
- `src/pages/app/admin/AdminUsers.tsx`
- `src/pages/app/admin/AdminQuestionEditor.tsx`

Wrap raw `<table>` in `<div className="overflow-x-auto">` or swap to shadcn `<Table>`. No logic changes.

## Phase C — IMPORTANT: Fixed-width responsive fixes
**Files:**
- `src/pages/app/prep/CodingHints.tsx:180` — `lg:w-[380px]` → `lg:w-80 lg:max-w-full`
- `src/pages/app/prep/SystemDesign.tsx:148` — `lg:w-[320px]` → `lg:w-80 lg:max-w-full`
- `src/pages/app/mock-test/TestSession.tsx:951` — `w-[280px]` → `w-[85vw] max-w-xs`

## Phase D — IMPORTANT: Hardcoded color tokens (UI primitives only)
**Files:**
- `src/components/ui/tooltip.tsx:56` — `text-gray-200` → `text-popover-foreground`
- `src/components/ui/avatar.tsx:50` — `text-white` → `text-primary-foreground`
- `src/components/layout/MobileNav.tsx:85` — `text-violet-500` → `text-primary`

(Skipping `PreSessionSetupWizard` full refactor — too risky for one pass; I'll flag it separately if you want it as Phase D2.)

## Phase E — NICE-TO-HAVE: Credit threshold unification + console cleanup
**Files:**
- `src/pages/app/Dashboard.tsx:212` and `src/hooks/useCredits.ts:110` — align both to a single threshold constant (warn <50, critical <20, exhausted <5).
- `src/App.tsx:423-434` — narrow the `console.warn` override to React Router future-flag messages only (don't blanket-suppress).

## Phase F — NICE-TO-HAVE: Routing consolidation
**Files:** `src/App.tsx`
- Replace eager marketing imports with `React.lazy`.
- Keep manual `lazy()` calls but group them via the existing `src/pages/app/index.ts` barrel where possible.
- No route changes, no auth changes.

---

## Explicitly DEFERRED (not in this plan)
- **Admin / Analytics UI gaps** — feature work, not bug fix. Needs a separate spec.
- **Stripe checkout** — blocked on secrets you chose to skip.
- **`as any` / `@ts-nocheck` sweep** — high regression risk; tackle file-by-file later.
- **Zustand store decoupling** (`authStore` ↔ `overlayStore`) — touches the auth-init resilience memory; needs its own phase.
- **`PreSessionSetupWizard` token refactor** — large visual surface; flag if wanted.
- **Design-token HSL migration** in `tailwind.config.ts` / `index.css` — theme-wide; needs visual QA.

---

## Order I recommend
A → B → C → D → E → F, with you saying "go phase X" between each.

Reply with **"go phase A"** (or pick a different starting phase, or adjust scope) to begin.