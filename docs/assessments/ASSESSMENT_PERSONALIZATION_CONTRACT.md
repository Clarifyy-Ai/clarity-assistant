# Assessment Personalization Contract

Policy versions: `assessment-blueprint-v1`, `assessment-selection-v1`.

## Readiness response

When required context is missing and `force_general` is not set:

```json
{
  "ready": false,
  "missingFields": ["target_role", "experience_level"],
  "recommendedFields": ["resume", "target_skills"],
  "reasonCode": "PROFILE_CONTEXT_INSUFFICIENT",
  "message": "We need a little more information to personalize your assessment."
}
```

### Required for personalized start

- `target_role` (or selectable role slug)
- `experience_level`
- `assessment_objective`
- `difficulty`
- `question_count` (or duration)

### Recommended

- Resume version
- JD version
- Target skills / domain

### General assessment

Allowed only when client sends `force_general: true`. Must be labeled **General** in UI and stored on the context snapshot as `personalized: false`.

## Assemble request (extended)

```ts
{
  template_id?: string;          // optional when role_slug resolves a template
  role_slug?: string;            // canonical AssessmentRoleSlug
  force_general?: boolean;
  setup?: AssessmentSetupPayload;
  idempotency_key?: string;
}
```

`AssessmentSetupPayload` includes: role, domain, experience_level, objective, difficulty, question_count, duration_minutes, resume_version_id, jd_version_id, skills_include, skills_exclude, preferred_language, company, interview_round, focus_areas.

## Context snapshot (immutable)

Stored in `assessment_context_snapshots` and referenced from `mock_tests.config`:

- user_id, profile snapshot, resume/jd version ids
- role_id / role_slug, domain, experience_level
- skill_snapshot, performance_snapshot, weak_topic_summary
- setup_payload, policy_versions, selection_seed
- personalized boolean

Do not re-read mutable profile/resume after attempt creation.

## Error codes (additions)

| Code | HTTP | Meaning |
|------|------|---------|
| `PROFILE_CONTEXT_INSUFFICIENT` | 422 | Missing required personalization fields |
| `ROLE_NOT_SUPPORTED` | 422 | Role cannot be mapped |
| `CONTENT_INSUFFICIENT` | 409 | Bank cannot fill blueprint without duplicates |
| `TEMPLATE_NOT_AVAILABLE` | 404 | Alias of existing availability failures |

Existing start codes remain: `INVALID_PAYLOAD`, `UNAUTHORIZED`, `INSUFFICIENT_QUESTION_INVENTORY`, `MAX_ATTEMPTS_REACHED`, etc.

## Credits

- One idempotency key per create.
- Readiness failures and `CONTENT_INSUFFICIENT` must not consume credits.
- Refresh / autosave / submit retry must not re-charge.

## Client-safe selection reason

```json
{
  "questionId": "...",
  "selectedBecause": [
    "Matches Backend Engineer role",
    "Assesses API design",
    "Addresses a previously weak topic",
    "Difficulty matches Mid-level profile"
  ],
  "selectionPolicyVersion": "assessment-selection-v1"
}
```

Never expose answer keys, internal weight numbers, or unpublished question bodies beyond the attempt snapshot.
