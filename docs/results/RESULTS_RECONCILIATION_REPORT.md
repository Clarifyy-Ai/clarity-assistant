# Results — Reconciliation Report

## Known drifts (pre-fix) → status

| Drift | Was | Now |
|-------|-----|-----|
| Empty / missing → `0` in TestResults / Analytics / gap | P0 invent | FIXED — `resultDisplay` helpers |
| `useConfidenceScore` default 50 | Live invent | FIXED — null until metrics |
| Overlay unknown fillers as 0 boost | Live invent | FIXED — null metrics → off |
| `aiHelpConfirm` score `0.75` | Invent | FIXED — leave null |
| Dashboard “interview readiness” | Mislabel | FIXED — Activity readiness |
| `submit-test` `mock_test_score_v1` vs migration v2 / config | Version drift | FIXED — single `mock_test_score_v2` |
| History ignored `evaluation_status` | Could show unscored as scored | FIXED — completed gate |
| Coding / scorecard snapshots | Missing | FIXED — judge/checksum + evaluation_input_snapshot |

## Post-fix checks

1. Same `mock_tests.id` → Results marks == History marks when analysis exists
2. Same `sessions.id` → History score null unless scorecard completed; Detail agrees
3. Genuine all-wrong attempt → `0` still displays as `0` (not “Not available”)
4. Missing analysis → “Not available” on Results header metrics

## Remaining (deferred)

- Full User A/B browser matrix on live production
- Immutable `result_versions` table for every surface
- Vendor cost as result provenance
