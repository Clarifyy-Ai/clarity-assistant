# Results — Python Worker Report

## What Python may own

| Operation | Role |
|-----------|------|
| `session_scorecard` (hybrid) | Optional enrichment of dimensions; Edge persists and remains source of truth |
| Debrief / other AI ops | Content generation under Edge credit + eligibility gates |

## What Python must not own

| Concern | Owner |
|---------|-------|
| Gov/assessment `total_score` / accuracy | Edge `submit-test` + `mockTestScoring.ts` |
| Coding pass/fail percent | Edge `score-coding-submission` |
| Session History score projection | Postgres RPC `get_session_history` |
| Inventing scores when worker unavailable | Fail closed / deterministic fallback only |

## Status

Python scorecard path is optional hybrid — if Python fails, Edge deterministic path may still complete when eligible. Absence of Python must not invent mid-band UX defaults in the client.
