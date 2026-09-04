# Results — Scoring and Algorithms

## Government / assessment MCQ (`mock_test_score_v2`)

Canonical: `supabase/functions/_shared/mockTestScoring.ts` → `scoreMockTest`.

- Correct → `+marks_positive`
- Wrong → `-marks_negative`
- Unanswered → `0`
- `total_score` = sum; display clamps negative raw totals to `0` for UI band only; raw retained in footnotes when negative
- Accuracy = correct / attempted; attempt % = attempted / total
- AI narrative must not overwrite marks

Authoritative write path: `submit-test` → `claim_and_complete_test` with `p_algorithm_version = mock_test_score_v2`.

## Interview scorecard (hybrid)

Canonical: `generate-scorecard` with `RUBRIC_VERSION = scorecard_v2`.

- Deterministic baseline from answers/transcripts
- Optional Python / AI enrichment under hybrid policy
- Persist only with `evaluation_status = completed` and finite `overall_score`
- Ineligible → `not_eligible` + `eligibility_reason`, scores cleared

## Coding percent

Canonical: `score-coding-submission`.

- `score = round(passed / case_count * 100)` when cases exist; empty set → `0` with evidence of empty set
- Client-supplied score fields rejected with 400
- Persist `judge_version` + `case_set_checksum`

## Activity readiness (dashboard)

Not a scoring algorithm for interviews — weighted practice/setup composite. Must not be labeled “interview readiness.”
