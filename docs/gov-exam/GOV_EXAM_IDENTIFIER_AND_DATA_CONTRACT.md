# Government Exam — identifier and data contract

## Identifiers

| Concept | ID | Storage / API |
|---------|----|----------------|
| Registry exam | `gov_exams.id` (UUID) | Search / detail / generate `examId` |
| Stage | `gov_exam_stages.id` | `stageId` query + create body |
| Generation job | `gov_paper_generation_jobs.id` | `jobId` in URL + localStorage |
| Frozen paper | `gov_generated_papers.id` | Job `paperId`; attempt `config.gov_paper_id` |
| Attempt | `mock_tests.id` | Session/results URL `:testId` |
| Availability preflight | `availabilitySnapshotId` | Check response → create body → job inventory snapshot |

## Attempt lifecycle

1. **Start** — `start-exam` is idempotent: refresh/replay returns the same `mock_tests` row (`alreadyStarted` / same `startedAt` + `expiresAt`). No second attempt on reload.
2. **Timer** — UI remaining time is derived from server `expires_at` (and pause fields). Client countdown must not invent extra time on refresh.
3. **Pause policy** — Pause freezes remaining time server-side (`paused_at` / phase `PAUSED`); resume recomputes `expires_at`. Documented in runner UX copy.
4. **Autosave** — `save-test-answer` while `canPersistExamAnswers`. Blocked when `submitting` or `answersLocked` (`shouldBlockAnswerAutosave`) so submit does not 409-storm (`DEF-GOV-409`).
5. **Submit** — `submit-test` with `idempotencyKey: submit:<testId>`; results stay on `/app/mock-test/results/:testId` (analysis lag → Processing + Retry on same URL).
6. **Scoring** — Deterministic from frozen paper / responses; analysis row may lag briefly.

## Session History linkage

`get_session_history` unions `mock_tests` government attempts with:

- `sessionType`: `government_exam` (non–exam_template)
- `detailRoute`: `/app/mock-test/results/<mock_tests.id>`
- `sourceRoute`: `/app/mock-test/session/<mock_tests.id>`

Assessments (`config.source = exam_template`) keep `/app/assessments/...` routes.

## Ownership

RLS + `.eq("user_id", user.id)` on session/results loads. User B opening User A’s attempt/results URL gets in-place not-found (no hub bounce that looks like a soft success).
