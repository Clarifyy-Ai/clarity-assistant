# Government Exam Architecture (Clarify AI)

Clarify AI provides an **independent** government-exam preparation engine. It is not affiliated with UPSC, SSC, RRB, IBPS, or any recruiting body.

## Pipeline

1. **Exam registry** — configurable recruiting bodies, exams, aliases, stages  
2. **Versioned patterns & syllabus** — never overwrite; supersede with new versions  
3. **Official source registry** — link-first provenance (no unauthorized scraping)  
4. **Blueprint engine** — hard constraints from approved pattern; soft historical quotas  
5. **Paper assembly** — select from approved question bank; fail clearly if insufficient  
6. **Durable jobs** — `gov_paper_generation_jobs` with stage transitions  
7. **Mock delivery** — existing `mock_tests` / TestSession runner  
8. **Analytics** — existing mock analytics + topic mastery (iterative)

## Key tables

- `recruiting_bodies`, `gov_exams`, `gov_exam_aliases`, `gov_exam_stages`
- `gov_exam_pattern_versions`, `gov_exam_sections`, `gov_exam_syllabus_versions`
- `gov_official_sources` (+ optional `storage_path` for admin-authorized uploads)
- `previous_year_papers`, `previous_year_paper_questions`
- `source_ingestion_jobs`
- `gov_paper_generation_jobs`, `gov_generated_papers`, `gov_generated_paper_questions`
- `user_gov_exam_preferences`
- `question_translations` (human-reviewed regional text; public only when approved)
- `topic_mastery`, `exam_readiness`, `preparation_plans` (adaptive prep)

**Previous-year bank:** Prefer an empty approved `previous_year_papers` set over synthetic seeds. Populate only via admin `ingest-source-document` / `extract-question-paper` (allowlisted URL metadata + authorized upload / structured JSON / PDF). Draft / OCR / synthetic rows stay unpublished until review.

## Edge functions (implemented)

| Function | Purpose | Pilot status |
|----------|---------|--------------|
| `search-exams` | Alias-aware discovery + bank readiness | Deployed |
| `create-exam-paper` | Validate → reserve credits → quality/similarity gate → assemble → job + mock_test | Deployed |
| `get-paper-generation-job` | Poll durable job state | Deployed |
| `reconcile-paper-quality` | Admin-only re-score of `gov_generated_papers` | Deployed |
| `ingest-source-document` | Admin-only source register + durable JSON/metadata ingest (no remote scrape) | Deployed |
| `list-previous-papers` | Authenticated list of approved previous-year papers | Deployed |
| `extract-question-paper` | Admin PDF/OCR extract into unpublished bank + ingest job stages | Deployed |
| `recompute-topic-mastery` | Recompute topic mastery / readiness from attempts | Deployed |
| `submit-test` | Existing mock submit path; hooks mastery recompute | Redeployed (mastery) |

Related (shared / legacy mock tooling, not gov-registry-specific): `parse-question-pdf`, `select-test-questions`, `create-test`, `analyze-test-performance`, `generate-questions`, `bulk-import-questions`.

### Master-prompt API names not shipped as separate EFs

Deferred or covered elsewhere: `get-exam-details` / `get-exam-pattern` / `get-exam-syllabus` (client + `search-exams`), `cancel-paper-generation-job`, `analyze-paper-trends`, `report-question`, `generate-topic-practice`, `update-preparation-plan`, `admin-review-question`, `admin-publish-paper` (admin UI + RLS), separate attempt APIs (existing TestSession runner).

## Ops / monitoring

See `docs/GOV_EXAM_MONITORING.md` and `scripts/gov-exam-ops-snapshot.mjs`.

## Labels

- Affiliation disclaimer on discovery and exam surfaces  
- AI / custom practice papers never labeled as official or “predicted”

## Release posture

**CONDITIONAL_GO_PILOT** — engine + admin + ingest + mastery + validators live; **0** full-simulation-ready packs; frontend host deploy external. Do not claim GO for all exams.
