# Results — Data Contract

## Score status model

| Status | Meaning | Numeric display |
|--------|---------|-----------------|
| `scored` / `completed` | Authoritative finite score present | Show number (including genuine `0`) |
| `pending` / `processing` / `queued` | Evaluation in flight | “Processing” / Not available |
| `not_scored` / `not_eligible` / `excluded` | Not evaluable | “Not eligible” + reason when known |
| `failed*` | Evaluation failed | “Failed” — never coerce to `0` |
| missing evidence | No analysis / no scorecard | “Not available” |

Helpers: `src/lib/analytics/scoreStatus.ts`, `src/lib/results/resultDisplay.ts`.

## Provenance fields

| Surface | Present | Notes |
|---------|---------|-------|
| `test_analyses.algorithm_version` | FIXED | Always `mock_test_score_v2` from submit-test |
| Paper `scoring_policy_version` / snapshot id | FIXED | In `time_analysis.score_summary` |
| `scorecards.evaluation_status` | FIXED | Gate for history + detail |
| `scorecards.eligibility_reason` | FIXED | Surfaced in Session Detail |
| `scorecards.evaluation_input_snapshot` | FIXED | Persisted on generate |
| `scorecards.rubric_version` | FIXED | `scorecard_v2` |
| `coding_submissions.judge_version` | FIXED | `javascript_solve_v1` |
| `coding_submissions.case_set_checksum` | FIXED | FNV of case set |
| Immutable `result_versions` table | DEFERRED | Tracked in certification |
| Vendor invoice as score provenance | DEFERRED | Finance dashboard separate |

## Cross-page agreement

For a given attempt id:

| Page | Score source |
|------|--------------|
| Results (gov/assessment) | `test_analyses` row |
| Session History (exam) | Same analysis total / max |
| Session History (interview) | Scorecard only if `evaluation_status = completed` |
| Scorecard / Session Detail | Same completed scorecard |
| Analytics | Durable `score_status` from edge/client contract |

Missing evidence must agree as unscored / unavailable — never as a fabricated non-zero.
