# Assessment Test Evidence

## Unit tests

Command:

```bash
npx vitest run src/test/lib/assessments/assessmentPersonalization.test.ts src/test/lib/assessments/backendAssessmentStart.test.ts src/test/lib/session/sessionHistoryFilters.test.ts
```

Covered:

- Backend vs Data Analyst blueprints differ materially
- why_selected differs by role
- Role alias normalization
- Readiness gate / force_general
- Bounded weak-topic boost
- Deterministic selection reproducibility
- Public ledger omits internal scores
- CONTENT_INSUFFICIENT mapped in `userMessageForAssessmentError` / `mapAssessmentRpcError`
- Session history assessment context line (role + objective)

## E2E (mocked)

`e2e/assessments-personalization.spec.ts` — Setup → Review → Start; asserts assemble POST includes `setup` / `role_slug` / `force_general`; Backend vs Data Analyst paths.

## Manual / e2e acceptance checklist

1. Open `/app/assessments` → Personalize assessment
2. Leave required fields empty → readiness banner
3. Continue with general assessment → review labeled General
4. Backend Engineer setup → review shows backend-heavy allocation
5. Data Analyst setup → review shows sql/aptitude/python allocation
6. Start → session restores same `question_ids` on refresh
7. Complete → results show personalization summary
8. Session History assessment row shows role (+ objective when in config)
9. User B cannot open User A attempt URLs (existing RLS)
10. Failed readiness / CONTENT_INSUFFICIENT does not consume credits

## Deploy

1. Applied migration `20260904120000_assessment_personalization.sql` (Management API) — status 200
2. Applied migration `20260904140000_assemble_assessment_with_blueprint.sql` (Management API) — status 200; remote has `assemble_assessment_with_blueprint` + `qa-engineer` template
3. Deployed edge `assemble-assessment` **v103** (Management API) — ACTIVE; personalized path calls `assemble_assessment_with_blueprint` (legacy catalog start still uses `assemble_assessment_from_template`). Adaptive within-attempt remains off.

## Unit test run (2026-09-04)

```
npx vitest run src/test/lib/assessments src/test/lib/session/sessionHistoryFilters.test.ts
```

Exit code 0 — 51 tests (personalization + lifecycle + backend start + session history filters).
