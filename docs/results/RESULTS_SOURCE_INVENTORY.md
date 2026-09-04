# Results — Source Inventory

Evidence-backed inventory of score-producing surfaces. Marketing demos are non-authoritative and must not be copied into product score paths.

## Interview / Practice Coach / Mock (`sessions` + `scorecards`)

| Field | Value |
|-------|--------|
| Attempt store | `public.sessions` |
| Authoritative score | `public.scorecards` when `evaluation_status = 'completed'` |
| Edge | `generate-scorecard` (hybrid deterministic / Python / AI narrative) |
| Provenance | `rubric_version`, `evaluation_input_snapshot`, `eligibility_reason` |
| UI | Session Detail, Scorecard page, Analytics, Session History |
| Fail-closed | Incomplete / not eligible → null score, never invent mid-band defaults |

## Government Exam + Assessment (`mock_tests` + `test_analyses`)

| Field | Value |
|-------|--------|
| Attempt store | `public.mock_tests` |
| Authoritative marks | `public.test_analyses` written by `submit-test` |
| Algorithm | `MOCK_TEST_SCORE_ALGORITHM_VERSION` (`mock_test_score_v2`) via `mockTestScoring.ts` |
| Paper policy | `time_analysis.score_summary.scoring_policy_version` / `paper_snapshot_id` |
| AI role | Narrative / insight only — **never** sets `total_score` |
| UI | `TestResults`, `TestAnalytics`, Assessments results routes |

## Coding (`coding_submissions`)

| Field | Value |
|-------|--------|
| Authoritative score | Server `score-coding-submission` only (client score fields rejected) |
| Provenance | `judge_version`, `case_set_checksum` |
| Judge | `javascript_solve_v1` for approved JS solve mode |

## Gap analysis (JD / Resume)

| Field | Value |
|-------|--------|
| Store | `gap_analyses` / edge gap analysis |
| Display | `formatMatchScore` — missing → “Not available”, never `\|\| 0` |

## Live overlay / help confidence (non-authoritative UX)

| Surface | Source | Rule |
|---------|--------|------|
| `useConfidenceScore` | Measured WPM/fillers/pauses | Starts `null`; no default 50 |
| `OverlayAnswerStrength` | Store metrics | Unknown metrics do not invent strength |
| `aiHelpConfirm` | Utterance confidence | Null stays null; no hardcoded 0.75 |

## Dashboard “Activity readiness”

Synthetic activity composite from sessions/streak/setup — **not** an interview score. Relabeled accordingly.

## Explicitly non-authoritative

- Marketing `ProductDemoHero` and similar demo animations
- Client-side maps of unfinished attempts
- Session `overall_score` when scorecard evaluation is incomplete
