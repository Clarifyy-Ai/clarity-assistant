# Audit Fix Plan

Per your saved preference (investigate first, component-by-component, with guardrails), here is the staged plan. **Guardrails for every step: do not modify working features, do not change business logic, no DB schema changes, no behavioral changes to Auth/Onboarding/Live/Mock/Prep/Sessions/Documents pipelines.**

I will pause after each phase for review before proceeding.

---

## Phase 1 — 🔴 Critical (safe, mechanical)

**1A. Consolidate Supabase client** (#1)
- Make `src/integrations/supabase/client.ts` re-export from `src/lib/supabase/client.ts` (single `createClient` instance). Keep both import paths working — no caller changes.

**1B. Consolidate `use-toast`** (#2)
- Delete `src/hooks/use-toast.ts`; re-point any importers to `@/components/ui/use-toast`. (Or vice-versa — I'll pick whichever has more importers.)

**1C. Remove `@ts-nocheck` from barrels** (#3)
- Replace `export *` in `src/types/index.ts` and `src/lib/utils/index.ts` with explicit named re-exports; resolve name collisions by aliasing.

**1D. Split `/forgot-password` vs `/reset-password`** (#4)
- `ResetPassword.tsx` already handles both flows via URL token; verify, and if not, add a `mode` prop / separate `ForgotPassword.tsx` wrapper.

**1E. `AdminUsers.fetchUsers` finally block** (#5)
- Wrap in try/finally so `loading=false` always runs.

**1F. Fix stale-closure `useEffect` deps** (#6)
- Add missing deps in `AdminDashboard`, `Interviews`, `AdminSeedQuestions` and ~7 others (will list each fix).

**1G. Theme-ize `PreSessionSetupWizard`** (#7)
- Replace `bg-[#0a0a0f] text-white` with `bg-background text-foreground`.

**1H. Tailwind safelist** (#8)
- Add safelist entries to `tailwind.config.ts` for the dynamic color classes used in `Signup`, `ResetPassword`, `ProgressBar`, `avatar`.

---

## Phase 2 — 🟠 Important (cleanup, no behavior change)

**2A. Decouple authStore→overlayStore** (#9) — move `syncOverlayFromProfile` into a `useEffect` in `App.tsx`.
**2B. Delete 9 orphaned files** (#10) — verified zero importers.
**2C. Remove `userStore.ts` ghost alias** (#11) — only if zero importers; otherwise skip.
**2D. Complete barrel exports** (#12).
**2E. Remove dead `SettingsBYOK` lazy import** (#13).
**2F. Silence-error fix in `CompanyResearch`** (#17) — add toast on fetch failure.
**2G. Add `.catch()` to high-risk awaits** (#18) — `TestSession`, `useStreakTracker`, `useAnalytics`, `ResumeDetail`. *No logic change, only error swallow → toast/log.*
**2H. Overlay color tokens** (#20, #21) — replace 6 near-black hex values + inline rgba in `OverlayQuickStart`/`OverlayHotkeyHelp` with `--overlay-bg` / semantic tokens.
**2I. Compress favicon + logo** (#22).

**Skipped from Phase 2 (require feature work, not cleanup):**
- #14 Rooms WebRTC — needs product decision.
- #15 Integration stubs — intentional "coming soon".
- #16 Unused edge functions — need your call (wire UI vs delete).
- #19 Responsive classes on 40 pages — too broad; should be done page-by-page per your guardrail.

---

## Phase 3 — 🟡 Nice-to-have

Defer unless you approve individually: memoization sweep, virtualization, lazy marketing routes, `as any` cleanup, file splits, utils consolidation, `glass-card`/`gradient-text` tokenization, `ErrorBoundary` destructive token, `net-dot-*` tokens, `SettingsAppearance` swatches, `screenShare.ts` console.info removal.

---

## Confirmation needed

Reply with one of:
- **"go phase 1"** — I execute Phase 1 only, then stop for review.
- **"go phase 1+2"** — both cleanup phases, stop before Phase 3.
- **"go all"** — execute Phases 1–3 (still skipping the four feature-work items in Phase 2).
- Or edit the plan (e.g. "skip 1D", "include #19 for Login only").