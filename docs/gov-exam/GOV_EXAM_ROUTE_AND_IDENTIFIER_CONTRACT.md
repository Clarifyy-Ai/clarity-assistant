# GOV_EXAM_ROUTE_AND_IDENTIFIER_CONTRACT

## Canonical routes (unchanged names)

| Journey | Path | Restoration |
|---------|------|-------------|
| Hub / search | `/app/mock-test` | Inline search API |
| Exam detail | `/app/mock-test/exam/:examCode` | `get-exam-details` by code |
| Legacy configure | `/app/mock-test/configure?exam=` | Query params |
| Generate | `/app/mock-test/generate?examId&stageId&code&basis&jobId&…` | Query + job poll |
| Generate job alias | `/app/mock-test/generate/job/:jobId` | Redirects to `?jobId=` |
| Attempt | `/app/mock-test/session/:testId` | `mock_tests.id` |
| Results | `/app/mock-test/results/:testId` | Same attempt id |
| Revision | `/app/mock-test/revision` | Attempt-scoped API |
| Analytics | `/app/mock-test/analytics` | Submitted results only |

## Identifier separation

| ID | Storage | Must not confuse with |
|----|---------|----------------------|
| `exam_id` | `gov_exams.id` | exam_code, job_id |
| `exam_code` | URL `:examCode` | legacy exam_type string |
| `stage_id` | `gov_exam_stages.id` | tier_id in UI copy |
| `generation_job_id` | `gov_paper_generation_jobs.id` | paper_id, attempt_id |
| `generated_paper_id` | `gov_generated_papers.id` | mock_tests.id |
| `attempt_id` | `mock_tests.id` | job_id |
| `availability_snapshot_id` | correlationId on check-availability | Distinct from job id |
| `inventory_snapshot_id` | On job `inventory_snapshot` | Question bank row ids |

Owner = JWT `user.id` only. Browser never supplies owner, score, or plan.

## Route-resolution FSM

Implemented in `src/lib/gov-exam/routeResolution.ts`:

- **AUTH_INITIALIZING** — skeleton on same URL
- **UNAUTHENTICATED / EMAIL / ONBOARDING** — preserve full `returnTo` in URL
- **TEMPORARY_BACKEND_FAILURE** — Retry on same route (429, 5xx, WORKER_UNAVAILABLE)
- **INVALID_IDENTIFIER** — in-shell Not Found
- **VALID_*** — render page content

`location.state` is optional UX enhancement only.

## Auth return path

All gates use `pathWithReturnTo` where refresh matters:

- `/login?returnTo=…`
- `/verify-email?returnTo=…`
- `/onboarding?returnTo=…`
- MFA enroll with `returnTo`

Post-onboarding: `getPostOnboardingPath(preferredReturnToFromNavigation(...))`.

## Page contracts

| Page | Missing entity | Transient error |
|------|----------------|-----------------|
| GenerateGovPaper | selection error in-page | toast + stay |
| GovExamDetail | InlineErrorRetry | Retry, no hub bounce |
| TestSession | loadFailure not_found / temporary | Retry |
| TestResults | processing / temporary | Retry on same URL |

See also: `docs/gov-exam/GOV_EXAM_IDENTIFIER_AND_DATA_CONTRACT.md`.
