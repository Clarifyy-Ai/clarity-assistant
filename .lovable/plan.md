## Current state

- `tsc --noEmit`: 0 errors
- Dev server: healthy
- `npm run lint`: now runs (pipeline repaired last turn)
- Total findings: **1,966** (errors + warnings combined)

## Findings breakdown

| Rule | Count | Severity | Real bug? |
|---|---|---|---|
| `@typescript-eslint/explicit-function-return-type` | 1,245 | warn | No — stylistic noise |
| `@typescript-eslint/no-explicit-any` | 239 | error | Sometimes |
| `@typescript-eslint/no-unused-vars` | 143 | error | Yes (dead code) |
| `@typescript-eslint/no-floating-promises` | 86 | error | **Yes — real async bugs** |
| `@typescript-eslint/ban-ts-comment` | 74 | warn | Pre-existing `@ts-nocheck` |
| `react-hooks/exhaustive-deps` | 59 | warn | Sometimes |
| Supabase Edge Function parse errors | 54 | error | Config — files outside tsconfig project |
| Other | ~66 | mixed | Mixed |

## Plan (safe, reversible, component-by-component)

### Pass 1 — config-only (no source changes)
1. **Demote `explicit-function-return-type`** from `warn` → `off` in `eslint.config.js`. Rationale: 1,245 of 1,966 findings are this single stylistic rule. Project convention is inferred return types (matches existing code). Removes 63% of noise so real issues surface.
2. **Exclude `supabase/functions/**`** from the lint glob. Those files run on Deno, not in the app tsconfig project — 54 parse errors are false positives.

Expected post-pass-1 count: ~670 findings, dominated by real issues.

### Pass 2 — report only
Re-run lint, group remaining findings by file, hand you the top 10 worst offenders. **No source edits yet.** You then pick which component/folder to clean first.

### Pass 3+ — per-component cleanup (only after you approve a target)
For each chosen file/folder:
- Fix `no-floating-promises` (add `void` or `await` — real bug class)
- Remove `no-unused-vars` (dead imports/locals)
- Replace `no-explicit-any` where a real type is obvious; leave the rest
- Review `react-hooks/exhaustive-deps` case-by-case (some are intentional)

## Explicit guardrails
- Pass 1 touches **only** `eslint.config.js`. No `src/**`, `electron/**`, `supabase/**`, `tsconfig*.json`, or `package.json` changes.
- No existing `@ts-nocheck` directives removed.
- No working features modified.
- Pass 3 happens **one component at a time, only after you name the target**.

## What this plan does NOT do
- Does not auto-fix 1,966 issues in bulk (would violate component-by-component guardrail)
- Does not change runtime behavior in passes 1–2
- Does not touch the `as unknown as ...` casts from earlier fixes
