# Public pages remediation (TC-PUB wave) — session `70dd4b`

## Hypotheses

| ID | Hypothesis | Result |
|----|------------|--------|
| H-PUB-009 | Duplicate free-plan FAQ from gs-3 + gs-4 | **CONFIRMED** → dedupe + unpublish; only `gs-3` published |
| H-PUB-004 | Help prices / arrows corrupted in DB (`?2,499`, control char) | **CONFIRMED** → ASCII-safe DB copy + client corrupt fallback |
| H-PUB-012 | Invalid share token / missing Share UI on public page | **CONFIRMED** (UX) → no-leak RPC + clearer copy; Share is in-app |
| H-PUB-011 | Certificate verify not discoverable on public pages | **CONFIRMED** → `/verify-certificate` + footer; invalid ID `{valid:false}` only |
| H-PUB-014 | Careers missing from inventory | **CONFIRMED** → honest `/careers` + footer |
| H-PUB-015 | 404 already OK; console.error looked like failure | **CONFIRMED** → `console.debug` |
| H-PUB-007/008 | mailto shows canceled in DevTools | **PRODUCT_SCOPE** → visible email + note that cancel is normal |
| H-PUB-010 | Blog deep link | **PRESERVE PASS** |

## Runtime evidence (local-evidence-pub)

- `H-PUB-012` invalid share → `empty: true`
- `H-PUB-011` invalid cert → `valid: false`, keys `["valid"]` only (no learner leak)
- `H-PUB-004` after ASCII migration → `corruptFlags: { bi-5: false, gs-3: false }`
- `H-PUB-009` published free-plan → `["gs-3"]` only

## Code / DB changes

- Help dedupe + corrupt detection (`helpArticlesFallback.ts`, `Help.tsx`, `HelpArticle.tsx`)
- Migrations: `20260826200000_*`, `20260826201000_*`, `20260826201100_help_articles_ascii_safe_prices`
- `SharedDebrief` invalid-token UX; in-app **Share link** label
- `Careers.tsx` + footer; `NotFound` quiet log
- `VerifyCertificate` landing + `/verify-certificate` route + footer link
- Terms/Privacy mailto DevTools note

## Disposition

| Case | Status |
|------|--------|
| TC-PUB-009 | Fixed |
| TC-PUB-004 | Fixed (encoding) |
| TC-PUB-012 | Fixed (no-leak + UX clarity) |
| TC-PUB-011 | Fixed (discoverable + no-leak) |
| TC-PUB-014 | Fixed (Careers inventory) |
| TC-PUB-015 | Preserve Pass |
| TC-PUB-010 | Preserve Pass |
| TC-PUB-007/008 | Product scope (mailto) |

Verify on **http://127.0.0.1:5173** (instrumented). Expect browser logs `H-PUB-009`, `H-PUB-012`, `H-PUB-014`, `H-PUB-015`, `H-PUB-011`.
