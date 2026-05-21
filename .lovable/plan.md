## Audit results

I ran a full audit. Here is the actual state:

| Check | Result |
|---|---|
| Vite dev server | Healthy on port 8080 |
| `tsc --noEmit` | **Passes — 0 errors** |
| Preview home page | Renders correctly (verified via screenshot) |
| Console `manifest.json` 401 | Lovable preview-proxy gating — not an app bug |
| Console `postMessage` origin warnings | Lovable editor-bridge noise — not an app bug |
| `npm run lint` | **Broken** — config imports `typescript-eslint` package, but only `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` are installed |

There are **no runtime errors and no TypeScript errors**. The only real defect is that the lint script can't execute at all, which means nothing is catching style/dead-code regressions.

## Proposed plan (single-component, minimal)

**Scope:** repair the lint pipeline only. No source files touched.

1. **Install the missing meta-package** `typescript-eslint@^8` (which is what `eslint.config.js` imports). Already-installed `@typescript-eslint/parser` and `/eslint-plugin` stay.
2. **Verify** `npm run lint` now executes end-to-end. Capture the actual warning/error count produced by the existing rules.
3. **Report** the lint output to you. Do **not** auto-fix lint findings in this pass — those are existing-code changes and would violate the "component-by-component" guardrail. After you see the report you can pick which files to clean up next.

### Explicit guardrails
- Do **not** modify any application source file (`src/**`, `electron/**`, `supabase/**`).
- Do **not** change `eslint.config.js` rules.
- Do **not** delete or rewrite the existing `// @ts-nocheck` directives in the 20 hook/lib files — they are pre-existing and out of scope.
- Do **not** touch `tsconfig.json` again.
- Only files changed: `package.json` + `bun.lock` (dependency add).

### Technical detail
- Command: `bun add -d typescript-eslint@^8.7.0`
- Post-install check: `npx eslint . --ext .ts,.tsx --max-warnings=999999 | tail -50`
- Success criterion: ESLint runs without `ERR_MODULE_NOT_FOUND`; we get a real findings list (count + top categories) to triage later.

## What this plan does NOT do
- Does not "fix all lint warnings" — that is a separate, opt-in cleanup per component.
- Does not address the preview-environment manifest 401 (not an app bug).
- Does not refactor the `as unknown as ...` casts added in earlier fixes (working code; out of scope).
