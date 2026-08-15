# Alternative feature implementation

Replaces remaining non-AI `BLOCKED_*` items with independently deployable product functionality. This document does not change AI provider or Org/SSO status.

## Feature matrix

| Feature | Original blocked reason | Alternative | Implementation status |
|---|---|---|---|
| Licensed full PYQ / “all exams” | `BLOCKED_CONTENT_LICENSING` | Original Question Bank Engine | READY |
| All certification exams supported | Licensing / official papers | Exam Template Engine assembled from the internal bank | READY |
| Question randomization | N/A | Server-side blueprint selection (`assemble_assessment_from_template`) | READY |
| Content licensing metadata | N/A | `license_type` + publish gate (UNKNOWN cannot publish) | READY |
| CSV/Excel/JSON import | Copyright scraping risk | Validated import with license fields and an import report | READY |
| Courses / live LMS | `FUTURE_GATED` | Learning Hub (course → module → lesson → quiz → progress) | READY |
| Recorded third-party LMS | Provider dependency | Owner-supplied video URL, PDF/PPT/DOC URL, text, external resource | READY |
| Course progress | N/A | Enrollment, lesson/quiz progress, sequential unlock | READY |
| Certificates | Official-cert claim risk | Course Completion Certificate + public verify page | READY |
| Doubt community | Third-party community | In-app Q&A with votes, accept, report, admin moderation | READY |
| Hidden-case cloud judge | `BLOCKED_PROVIDER` | JS `solve()` runner + server scoring; other languages stored for review | IMPLEMENTED_WITH_LIMITATIONS |
| Copyrighted paper scrapers | Will not implement | Personal Document Library (owner-only) | INTENTIONALLY_NOT_SUPPORTED (scraping) / READY (library) |
| Document → practice | Scraping | Practice set from user-owned documents after rights confirmation | READY |
| Undetectable overlay | Ethics / employer monitoring | Transparent Interview Practice Workspace | INTENTIONALLY_NOT_SUPPORTED (stealth) / READY (workspace) |
| Practice session mode | Tied to stealth / extra AI | Visible practice session using existing local question bank + rubric | READY |

## Database tables

New or extended:

- `questions` — `category`, `tags`, `time_limit_seconds`, `license_type`, `content_owner`, `created_by`, `license_url`, `copyright_status`, `publish_status`
- `exam_templates`
- `learning_courses`, `learning_modules`, `learning_lessons`, `learning_resources`, `learning_quizzes`
- `course_enrollments`, `lesson_progress`, `quiz_progress`, `course_certificates`
- `community_posts`, `community_answers`, `community_comments`, `community_votes`, `community_reports`
- `coding_questions`, `coding_test_cases`, `coding_submissions`
- `personal_library_documents`, `document_practice_sets`
- `practice_workspace_sessions`

RPCs:

- `assemble_assessment_from_template(uuid)` — authenticated; writes a `mock_tests` instance; does not return the full bank
- `issue_course_certificate(uuid)`
- `verify_course_certificate(text)` — anon + authenticated
- `coding_hidden_cases_for_scoring(uuid)` — `service_role` only

## Routes

| Route | Purpose |
|---|---|
| `/app/question-bank` | Create / edit / duplicate / archive / preview / search / filter / import / export / publish |
| `/app/assessments` | Exam templates |
| `/app/assessments/session/:testId` | Take a generated assessment (not India-gated) |
| `/app/assessments/results/:testId` | Results + scoring via existing `submit-test` |
| `/app/learn` | Learning Hub |
| `/app/learn/:courseId` | Course, modules, progress, quiz, certificate |
| `/app/learn/:courseId/lesson/:lessonId` | Lesson player |
| `/app/community` | Q&A list + ask |
| `/app/community/:postId` | Answer, comment, vote, accept, report |
| `/app/coding` | Coding lab |
| `/app/coding/:questionId` | Coding assessment UI |
| `/app/library` | Personal document library |
| `/app/practice-workspace` | Transparent interview practice |
| `/verify-certificate/:certificateId` | Public certificate verification |
| `/app/admin/community` | Hide / restore / lock / delete / review reports |
| `/app/admin/learning` | Create original courses |

## APIs

| API | Auth | Notes |
|---|---|---|
| RPC `assemble_assessment_from_template` | JWT | Server selection; duplicate-free; skips UNKNOWN license |
| Edge `assemble-assessment` | JWT | Same RPC via user-scoped client |
| Edge `score-coding-submission` | JWT | Ignores client scores; hidden cases never returned |
| Edge `issue-course-certificate` | JWT | Issues Course Completion Certificate only |
| RPC `verify_course_certificate` | anon | Public verify payload (no email) |
| Existing `submit-test` | JWT | Unchanged scoring / negative marking for assessments |

## Security

- User A cannot read User B personal library documents, course progress, practice sessions, or coding submissions (RLS `owner/user_id = auth.uid()`).
- User A cannot update another user’s coding submission (`FOR UPDATE USING (false)` for authenticated).
- User A cannot change certificate ownership (`FOR UPDATE USING (false)`).
- Hidden coding cases: `coding_test_cases` SELECT requires `is_hidden = false` unless author/admin. Scoring RPC is `service_role` only.
- Exam scores remain server-side via `submit-test`.
- Admin routes stay behind `ProtectedRoute requireAdmin`.
- UNKNOWN license cannot be published (trigger + client gate).
- Stealth / screen-share evasion remains disabled (`isStealthCaptureFeatureAllowed()` is false).
- Copyright scraping is not implemented in this work.

Live RLS probes still require applying `supabase/migrations/20260815140000_alternative_feature_platform.sql` to the project.

## Tests

`src/test/lib/certification/alternativeFeatures.test.ts` covers:

- license publish gate
- import report (required fields, duplicates, invalid answers/difficulty/license)
- template assembly uniqueness and UNKNOWN exclusion
- module unlock / course percentage / certificate wording
- community moderation states
- hidden-case stripping and rejection of client scores
- document access + rights confirmation
- practice rubric honesty
- tenant isolation contracts
- status strings (not renamed BLOCKED → DONE)

## Known limitations

- JavaScript `solve()` is the only automated coding language. Other languages are stored as `pending_review` with no fabricated score.
- The runner is a constrained in-process evaluator (no network, no imports). It is not a hidden-case cloud judge product.
- Seeded questions are original Clarify items, not official PYQs. Template exams fill from the licensed published bank and may be shorter than the blueprint if the bank is thin.
- Learning Hub v1 prefers text and URLs the author has rights to use. Uploaded course video CDN/transcoding is not included.
- Practice workspace scores are a local rubric, not a new AI provider.
- Certificate is a **Course Completion Certificate**, never an official professional certification.
- Edge functions must be deployed for server-side coding scores; if undeployed, submissions are stored unscored.

```text
AI PROVIDERS:
UNCHANGED

ORG/SSO:
UNCHANGED

NON-AI BLOCKED FEATURES:
ALTERNATIVES IMPLEMENTED

COPYRIGHT SCRAPING:
NOT IMPLEMENTED

STEALTH/EVASION:
NOT IMPLEMENTED
```
