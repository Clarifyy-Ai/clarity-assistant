# Results — AI Validation Policy

## Principles

1. **Fail closed** — invalid or incomplete evidence → failed / not eligible / Not available; never invent scores.
2. **AI never owns marks** for gov/assessment MCQ (`total_score` is Edge-deterministic).
3. **Scorecard** may use AI/Python for narrative dimensions only after eligibility + evidence guards.
4. **Debrief** requires evaluation input snapshot; no fake coverage from empty transcripts.
5. **Client scores rejected** on coding and must not bypass Edge.

## Scorecard parse / evidence

- Answer quality guard strips invalid answers before scoring
- Incomplete evaluation status must not render as scored in UI
- `evaluation_input_snapshot` captures rubric, answer ids, transcript segment count

## Factual integrity

- Gap `match_score`: missing → Not available
- Overlay / help confidence: unknown metrics stay null / off
- Marketing demos are labeled non-product and out of this policy’s authoritative path

## Related tests

- `src/test/lib/scorecard/noFakeScores.test.ts`
- `src/test/lib/results/resultDisplay.test.ts`
