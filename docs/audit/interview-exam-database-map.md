# Interview / exam database map

Tenant model: B2C `user_id = auth.uid()`. No org/SSO in this pass.

## Interview

| Table | Ownership | Notes |
|---|---|---|
| profiles | user | industry, interview_date, improvement_goals added |
| resumes / resume_versions | user | private storage bucket |
| job_descriptions | user | |
| sessions | user | status + lifecycle_status |
| session_transcripts / session_answers / session_debriefs | user | |
| scorecards | user | |
| gap_analyses | user | |
| interview_practice_plans / items | user | new |
| answer_bank | user | |
| coaching_context | user | |

## Gov exam

| Table | Ownership | Notes |
|---|---|---|
| gov_exams / stages / patterns / syllabus | platform catalog | public read |
| questions | platform + uploader | playable view omits answers |
| mock_tests | user | attempt_phase, rank_status, evaluation_version |
| test_responses | user | autosave |
| test_analyses | user | |
| topic_mastery / exam_readiness / preparation_plans | user | |
| previous_year_papers | platform | provenance required |
| exam_attempt_cohorts / exam_ranks | mixed | ranks own-select |
| current_affairs | platform | verified source required; empty |
| user_gov_exam_preferences | user | target year / hours |

Migration: `supabase/migrations/20260815120000_dual_engine_certification.sql`
