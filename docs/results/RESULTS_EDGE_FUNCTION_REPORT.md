# Results — Edge Function Report

| Function | Authority | Notes |
|----------|-----------|-------|
| `submit-test` | Marks for mock/assessment | Writes `test_analyses` with `mock_test_score_v2`; paper policy in `time_analysis` |
| `generate-scorecard` | Interview scorecard | Persists `evaluation_status`, snapshot, rubric; reject incomplete display |
| `generate-debrief` | Debrief narrative | `evaluation_input_snapshot` in detailed_report; not marks |
| `score-coding-submission` | Coding scores | Rejects client score fields; writes judge + checksum |
| `analytics-dashboard` | Aggregates | Uses durable score status; must not coerce failed→0 |

## Hardening completed (this pack)

- Align `p_algorithm_version` / `algorithm_version` to `MOCK_TEST_SCORE_ALGORITHM_VERSION`
- Scorecard `evaluation_input_snapshot` on persist
- Coding `judge_version` + `case_set_checksum` on scored inserts

## Deploy note

Edge bundles must be redeployed with migrations for columns to accept new fields in production.
