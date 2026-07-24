# Implementation Plan — P0/P1 Fixes via Parallel Subagents

Per your workflow rules (plan-first, component-by-component, don't break working features), I'll dispatch each fix as an isolated read-only investigation subagent, then apply edits myself component-by-component after you greenlight. **Subagents cannot edit files** — they only investigate and return exact patches. I execute the writes.

## Guardrails (applied to every task)
- Do NOT modify unrelated features.
- Do NOT re-add stealth code (`setContentProtection`, capture-evasion, panic-hide, etc.).
- Do NOT touch `profiles.is_admin` — admin lives in `user_roles`.
- Keep AI model default `gemini-2.0-flash`.
- Preserve barrel export conventions and Zustand selectors.
- No `.single()` — use `.maybeSingle()`.
- All new SQL functions must `SET search_path = public` and include GRANTs.

## Execution Order (component-by-component)

### Phase 1 — P0 Blockers (must ship before GA)
1. **P0-1 Consolidate edge invocation** — audit all `fetch`/`supabase.functions.invoke`/`fetchEdge` call sites; migrate stragglers to `fetchEdge`/`fetchEdgeJson`. Scope: `src/**` only.
2. **P0-2 Remove `@ts-nocheck` from billing/subscription** — files under `src/lib/billing/**` and subscription managers; fix real type errors, don't mask.
3. **P0-3 Credit-touching test coverage** — add Vitest unit tests for `creditsManager`, `deduct_credits` RPC wrapper, and refund paths. No behavior changes.

### Phase 2 — P1 High-priority
4. **P1-1 Revoke public EXECUTE on sensitive RPCs** — apply pending migration `docs/PENDING_MIGRATION_refund_credits_hardening.sql` + audit siblings.
5. **P1-2 Move extensions out of `public` schema** — Supabase linter warning; migration only.
6. **P1-3 Fix onboarding redirect loop** — investigate `src/pages/onboarding/*` + auth guards.
7. **P1-4 Session a11y + mobile polish** — presentation-only in `src/pages/app/session/*`.
8. **P1-5 SECURITY DEFINER audit** — 10 linter warnings; verify each is intentional or add `SET search_path`.

## Subagent Fan-out Strategy
Phase 1 tasks (1,2,3) run in parallel — independent files.
Then I apply edits for Phase 1, verify build, and report back.
Phase 2 tasks (4,5,8) run in parallel — SQL-only or read-only.
Then (6,7) — UI changes serialized to avoid conflicts.

## Deliverable Per Phase
- Diff summary (files changed + line count)
- Build/typecheck result
- Test results where applicable
- List of skipped items with reason

## Technical Notes
- Subagents are read-only; they produce patches I apply via `line_replace`/`write`.
- SQL changes go through `supabase--migration`.
- Edge function redeploys via `supabase--deploy_edge_functions` only for functions we touch.
- No mass refactors — surgical edits only.

## Out of Scope (explicitly not touched)
- Stealth overlay code (permanently removed).
- FastAPI scraper (already shipped).
- Marketing pages, blog, help center.
- Electron main process (working, per constraint memory).

**Approve to start Phase 1?** I'll spawn 3 parallel subagents for P0-1, P0-2, P0-3, then apply edits and check in before Phase 2.
