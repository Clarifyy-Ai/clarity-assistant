# Implementation Plan — Sprint Roadmap (post Agent 5/5)

Supersedes the older Phase 1/2 list below for **launch gating**. Full detail: [`docs/FIX_ROADMAP_SPRINTS_2026-07-26.md`](../docs/FIX_ROADMAP_SPRINTS_2026-07-26.md).

## Verdict
- 🔴 NO-GO public GA
- 🟡 GO invite-only beta after **Sprint 0**

## Sprint 0 (beta gate) — approve to start
1. Money-path P0s #1–3, #11–12 (master list)
2. **P0-21** `cleanup_expired_documents` → `SET search_path = public`
3. **P0-22** migrate `avatars` into `storage.buckets`
4. **P0-23** share tokens ≥128 bits + live `pg_policies` verify + rate limit

## Later
- Sprint 1: billing_settings / exam anon / metrics insert / question-images drift / drop overloads
- Sprint 2: room indexes + live advisors + fresh migrate drill
- Sprint 3: Auth dashboard (MFA, leaked-password, OTP)

**Approve Sprint 0?** First PR can be the three DB items (21–23) in parallel with money-path work.

---

# Legacy plan (kept for reference)

Per your workflow rules (plan-first, component-by-component, don't break working features), I'll dispatch each fix as an isolated read-only investigation subagent, then apply edits myself component-by-component after you greenlight. **Subagents cannot edit files** — they only investigate and return exact patches. I execute the writes.

## Guardrails (applied to every task)
- Do NOT modify unrelated features.
- Do NOT re-add stealth code (`setContentProtection`, capture-evasion, panic-hide, etc.).
- Do NOT touch `profiles.is_admin` — admin lives in `user_roles`.
- Keep AI model default `gemini-2.0-flash`.
- Preserve barrel export conventions and Zustand selectors.
- No `.single()` — use `.maybeSingle()`.
- All new SQL functions must `SET search_path = public` and include GRANTs.

## Out of Scope (explicitly not touched)
- Stealth overlay code (permanently removed).
- FastAPI scraper (already shipped).
- Marketing pages, blog, help center.
- Electron main process (working, per constraint memory).
