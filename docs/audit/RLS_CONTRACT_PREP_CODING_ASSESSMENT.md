# RLS Contract — Assessment, Prep, and Coding Tables

Authoritative policies live in `supabase/migrations/`. This doc summarizes owner/staff access for contract tests and audits.

## Assessments

See [ASSESSMENT_MIGRATION_AND_RLS.md](../assessments/ASSESSMENT_MIGRATION_AND_RLS.md).

| Table | SELECT | INSERT/UPDATE | Notes |
|-------|--------|---------------|-------|
| `assessment_context_snapshots` | own | RPC only | Immutable setup |
| `assessment_blueprints` | own | RPC only | |
| `assessment_question_selections` | own | RPC only | No answer keys |
| `user_skill_evidence` | own | own | |
| `mock_tests` | own + admin | own via edge | Assessment instances |
| `test_responses` | own | own | Per-question answers |

## Prep Lab

| Table | SELECT | INSERT/UPDATE |
|-------|--------|---------------|
| `prep_star_entries` | own | own |
| `prep_rephrase_history` | own | own |
| `prep_project_drafts` | own | own |
| `prep_system_design_notes` | own | own |

Writes go through `prep-tool` edge + RLS owner policies (`auth.uid() = user_id`).

## Coding Lab

| Table | SELECT | INSERT/UPDATE |
|-------|--------|---------------|
| `coding_questions` | published OR own draft | own create; admin publish |
| `coding_test_cases` | via question access | staff / creator |
| `coding_submissions` | own | own insert |

`publish_status = 'published'` required for catalog reads; creators see own drafts.

## Verification

- `npm run rls:spot-check` — smoke SELECT as authenticated role
- Vitest: `src/test/lib/assessments/`, `src/test/lib/cms/contentLifecycle.test.ts`
