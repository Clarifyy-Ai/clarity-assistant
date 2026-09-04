# Assessment Implementation Report

## Architecture (confirmed)

Template catalog + shared `mock_tests` runner. Personalization adds:

1. Setup / Review UI (`/app/assessments/setup`, `/app/assessments/review`)
2. Role normalization + role-family blueprints
3. Readiness gate (`PROFILE_CONTEXT_INSUFFICIENT`)
4. Immutable context snapshot + blueprint + selection ledger tables
5. Explainable results copy from `mock_tests.config.why_selected`
6. Admin blueprint preview (`/app/admin/assessments`)

## Root causes addressed

| Cause | Fix |
|-------|-----|
| No profile context on start | Setup wizard + readiness evaluation |
| Same catalog for everyone | Personalized path resolves role → blueprint before assemble |
| No snapshot | `assessment_context_snapshots` + config refs |
| Category overlap | Distinct ROLE_BLUEPRINTS; Backend vs Data Analyst differ ≥15pp |
| Silent generic | General only with `force_general` |

## Taxonomy

Extended `ASSESSMENT_ROLE_SLUGS` with `qa-engineer`. Alias map covers Backend/Frontend/Data Analyst/QA/DevOps variants.

## Context fields used

target_role, role_slug, experience_level, assessment_objective, difficulty, question_count, duration, domain, skills_include/exclude, preferred_language, company, weak_topics (when provided), force_general.

## Missing-context behavior

UI banner + CTAs; assemble returns 422 `PROFILE_CONTEXT_INSUFFICIENT` when setup present but incomplete.

## Blueprint / selection

`assessment-blueprint-v1` / `assessment-selection-v1`. Deterministic client/edge scoring helpers; attempt ledger persisted via `attach_assessment_personalization`. Adaptive within-attempt: **off** (`ADAPTIVE_ASSESSMENTS_ENABLED = false`).

## Files changed (primary)

- `docs/assessments/*`
- `src/lib/assessments/{roleNormalize,assessmentContext,blueprint,selectionScore,assessmentSetupStorage,taxonomy,assessmentStart}.ts`
- `src/pages/app/assessments/{AssessmentSetup,AssessmentReview,AssessmentTemplates}.tsx`
- `src/pages/app/admin/AdminAssessmentsPreview.tsx`
- `src/pages/app/admin/AdminLayout.tsx`
- `src/pages/app/mock-test/{TestResults,MockTestHub}.tsx`
- `src/App.tsx`
- `supabase/migrations/20260904120000_assessment_personalization.sql`
- `supabase/migrations/20260904140000_assemble_assessment_with_blueprint.sql` (`assemble_assessment_with_blueprint` + history `role_slug`)
- `supabase/functions/assemble-assessment/index.ts`
- `supabase/functions/_shared/assessmentPersonalization.ts`
- `src/test/lib/assessments/assessmentPersonalization.test.ts`
- `e2e/assessments-personalization.spec.ts`

## Blueprint RPC

Personalized assembly uses Postgres RPC **`assemble_assessment_with_blueprint`** (weights, role, count, selection seed) when `setup` / `role_slug` / `force_general` is present. Catalog Start without setup still calls legacy `assemble_assessment_from_template`.

## Adaptive selection

Within-attempt adaptive question selection remains **off** (`ADAPTIVE_ASSESSMENTS_ENABLED = false` in AdminAssessmentsPreview / product kill-switch).
