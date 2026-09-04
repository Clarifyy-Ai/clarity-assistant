# Assessment Source Inventory

Generated for Assessments personalization (profile-aware, deterministic).

## Product surface

| Route | Component | Notes |
|-------|-----------|--------|
| `/app/assessments` | `AssessmentTemplates` | Template catalog + start |
| `/app/assessments/setup` | `AssessmentSetup` | Personalization wizard (new) |
| `/app/assessments/review` | `AssessmentReview` | Immutable review before assemble (new) |
| `/app/assessments/session/:testId` | `MockTestSession` | Shared runner |
| `/app/assessments/results/:testId` | `MockTestResults` | Shared results |

## Tables (existing)

| Table | Role in Assessments |
|-------|---------------------|
| `exam_templates` | Published blueprints (category/difficulty %) |
| `questions` | Shared MCQ bank (also gov exams) |
| `mock_tests` | Attempt rows (`config.source = exam_template`) |
| `test_responses` | Autosaved answers |
| `test_analyses` | Score / weak_topics / strong_topics |
| `coding_questions` | Separate bank — not used by MCQ assessments |

## Tables (personalization — new)

| Table | Purpose |
|-------|---------|
| `assessment_context_snapshots` | Immutable setup at generate time |
| `assessment_blueprints` | Per-attempt allocation + seed + policy versions |
| `assessment_question_selections` | Selection ledger (reasons, scores) |
| `user_skill_evidence` | Skill provenance / confidence |

## RPCs / Edge

| Phase | RPC / Edge |
|-------|------------|
| Availability | `assessment_templates_availability` / `check-assessment-availability` |
| Assemble (legacy catalog) | `assemble_assessment_from_template` / `assemble-assessment` |
| Assemble (blueprint / personalized) | `assemble_assessment_with_blueprint` / `assemble-assessment` (extended body: `role_slug`, `setup`, `force_general`) |
| Attach personalization | `attach_assessment_personalization` |
| Session history | `get_session_history` (assessment `role` from `config.role_slug`; objective via `sessionSubtype`) |
| Start clock | `start_owned_mock_test` |
| Autosave | `save_owned_test_answer` / `save-test-answer` |
| Submit | `begin_test_submission` + `claim_and_complete_test` / `submit-test` |

> Note: there is no `assemble_personalized_assessment` RPC — personalization uses `assemble_assessment_with_blueprint` (migration `20260904140000_assemble_assessment_with_blueprint.sql`) and/or legacy assemble + `attach_assessment_personalization`.

## Shared consumers (no-regression)

- Gov mock exams: `select-test-questions`, paper factory — same `questions` bank
- Coding lab: separate `coding_questions`
- MockTestHub / TestAnalytics: list `mock_tests`
- Credits / capability: `mock_test` plan gate

## Key source files

- `src/lib/assessments/taxonomy.ts`
- `src/lib/assessments/roleNormalize.ts`
- `src/lib/assessments/assessmentContext.ts`
- `src/lib/assessments/blueprint.ts`
- `src/lib/assessments/selectionScore.ts`
- `src/lib/assessments/assessmentStart.ts`
- `src/lib/assessments/examTemplateEngine.ts`
- `supabase/functions/assemble-assessment/index.ts`
- `supabase/migrations/20260903180000_assessment_lifecycle_hardening.sql`
- `supabase/migrations/20260904120000_assessment_personalization.sql`
- `supabase/migrations/20260904140000_assemble_assessment_with_blueprint.sql`
