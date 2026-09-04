# Assessment Blueprint and Selection Policy

Versions: `assessment-blueprint-v1`, `assessment-selection-v1`.

## Role family blueprints (default %)

Percentages must sum to 100. Template `category_distribution` overrides when present and valid.

### Backend Engineer (`backend-developer`)

| Category | % |
|----------|---|
| backend | 35 |
| sql | 25 |
| java | 15 |
| python | 10 |
| devops | 15 |

### Frontend Engineer (`frontend-developer`)

| Category | % |
|----------|---|
| javascript | 30 |
| react | 25 |
| html | 15 |
| css | 15 |
| backend | 15 |

### Data Analyst (`data-analyst`)

| Category | % |
|----------|---|
| sql | 45 |
| aptitude | 30 |
| python | 25 |

### QA Engineer (`qa-engineer`)

| Category | % |
|----------|---|
| aptitude | 30 |
| backend | 25 |
| sql | 25 |
| javascript | 20 |

### DevOps / SRE (`devops-assessment`)

| Category | % |
|----------|---|
| devops | 55 |
| backend | 25 |
| sql | 20 |

## Weak-topic boost (bounded)

When prior `test_analyses.weak_topics` (or equivalent) match a blueprint category:

- Add up to **+10 percentage points** to that category.
- Cap any single category at **40%** of the assessment.
- Re-normalize remaining categories proportionally so total = 100.
- If no prior evidence: use baseline blueprint unchanged.

Missing / failed / pending evaluations must not invent zeros.

## Deterministic selection score

```
selection_score =
  role_relevance
  + skill_relevance
  + objective_relevance
  + weakness_priority
  + difficulty_match
  + question_quality
  + freshness_weight
  - previous_exposure_penalty
  - semantic_duplicate_penalty
```

Order by `selection_score` DESC, then stable hash of `(question_id || selection_seed)`.

**Never** use uncontrolled `ORDER BY random()` for the final set.

## Selection seed

```
selection_seed = sha256(
  user_id || attempt_idempotency_key || blueprint_version || bank_version || role_slug
)
```

Same context + seed + bank version → same question IDs.

## Objectives

- `baseline` — equal core coverage
- `role_readiness` — role blueprint
- `resume_validation` — boost resume skills
- `jd_readiness` — boost JD-required skills (verification, not assumed mastery)
- `weak_area_improvement` — bounded weak boost
- `interview_round` — prefer scenario / applied types when available
- `technical_screening` — stricter difficulty match
- `mixed` — blend role + weak areas

## Duplicate / exposure rules

- Exact fingerprint: normalized question text
- Reject IDs seen in the user's last N assessment attempts (default 3)
- Concurrent Start: unique attempt + idempotency key
- If bank insufficient after filters → `CONTENT_INSUFFICIENT` (no silent repeats)
