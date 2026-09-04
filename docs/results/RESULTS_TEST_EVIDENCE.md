# Results — Test Evidence

## Unit

```bash
npx vitest run src/test/lib/results/resultDisplay.test.ts
npx vitest run src/test/lib/scorecard/noFakeScores.test.ts
npx vitest run src/test/lib/session/aiHelpConfirm.test.ts
```

Expected: all pass.

Covers:

- Missing → “Not available”; genuine `0` still `0`
- `resolveOverallScore` completed-only authority
- submit-test / history migration / no invent-50 / no invent-0.75 contracts
- Existing scorecard no-fake mapper + formatSessionScore

## Targeted Playwright (optional / env-dependent)

```bash
npx playwright test e2e/session-history.spec.ts e2e/assessments.spec.ts
```

History / assessments suites assert scored vs unscored labeling where fixtures allow. Full User A/B live matrix is **required for GO_PRODUCTION** and is tracked as deferred until run on the target environment.

## Blackbox

Reuse gov / session history blackbox cases for marks persistence; do not invent scores in client maps.

## Commands run in this hardening

| Command | Result |
|---------|--------|
| `npx vitest run src/test/lib/results/resultDisplay.test.ts src/test/lib/scorecard/noFakeScores.test.ts src/test/lib/session/aiHelpConfirm.test.ts` | exit 0 (17 tests) |
