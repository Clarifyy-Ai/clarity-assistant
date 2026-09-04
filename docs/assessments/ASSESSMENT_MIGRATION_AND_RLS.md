# Assessment Migration and RLS

## Migration

`supabase/migrations/20260904120000_assessment_personalization.sql`

### Tables

- `assessment_context_snapshots` — immutable setup at generate time
- `assessment_blueprints` — category weights, seeds, policy versions
- `assessment_question_selections` — per-question selection ledger (no answer keys)
- `user_skill_evidence` — skill provenance rows

### RPC

- `attach_assessment_personalization(p_test_id, p_setup, p_category_weights, p_selection_seed, p_why_selected, p_ledger, p_personalized, p_force_general)`
  - Owner-scoped via `auth.uid()`
  - Writes snapshot + blueprint + ledger
  - Merges personalization fields into `mock_tests.config`

### RLS

| Table | Policy |
|-------|--------|
| context_snapshots | SELECT own |
| blueprints | SELECT own |
| question_selections | SELECT own |
| user_skill_evidence | SELECT + INSERT own |

Writes for snapshots/blueprints/selections are performed by SECURITY DEFINER RPC (authenticated) or service_role.

### Preserved

- `test_responses` owner write policies from `20260902210000_assessment_response_write_rls.sql` unchanged
- Legacy `assemble_assessment_from_template` unchanged for catalog Start until edge switches

### Blueprint assemble (follow-up migration)

`supabase/migrations/20260904140000_assemble_assessment_with_blueprint.sql`

- RPC **`assemble_assessment_with_blueprint`** — optional blueprint weights, role, count, selection seed; fail-closed `CONTENT_INSUFFICIENT`
- Patches `get_session_history` to expose assessment `role` from `config.role_slug` and objective via `session_subtype`
- Seeds QA Engineer template

## Edge

`assemble-assessment` validates readiness when `setup` / `force_general` / `role_slug` present, calls **`assemble_assessment_with_blueprint`** with effective weights/role/count/seed on that path, then attaches personalization. Legacy catalog starts without setup still use `assemble_assessment_from_template`.
