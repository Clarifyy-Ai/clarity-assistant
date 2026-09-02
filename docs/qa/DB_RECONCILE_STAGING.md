# DB reconcile — staging

## Deployment actions (2026-09-02)

- Renamed duplicate migration timestamps (`20260902120100`, `20260902120200`, `20260902220100`).
- Applied **17 pending migrations** via `scripts/apply-pending-migrations-mgmt.mjs` (Management API; `db push` blocked by pooler timeout).
- Redeployed **12 edge functions** via `npm run qa:deploy-wave:live`.
- Seeded **21 missing `feature_flags`** rows (34 total).
- QA accounts refreshed via `npm run qa:seed-accounts` (17 accounts).

---

Generated: 2026-09-02T10:22:41.450Z
Project: `qzgvjrvtkwlzxpmlddkx`

Summary: **51 pass**, 0 warn, **0 fail**

| Category | ID | Status | Detail |
|----------|-----|--------|--------|
| migrations | recent_applied | PASS | 25 recent; latest=20260902072840 |
| migrations | sep_2026_enqueue_gov_paper_job | PASS | RPC present |
| migrations | sep_2026_is_auth_email_verified | PASS | RPC present |
| migrations | sep_2026_record_quiz_progress | PASS | RPC present |
| types | credit_action | PASS | 8 values |
| tables | credit_transactions | PASS | exists |
| tables | profiles | PASS | exists |
| tables | gov_paper_generation_jobs | PASS | exists |
| tables | document_processing_jobs | PASS | exists |
| tables | company_research_jobs | PASS | exists |
| tables | source_ingestion_jobs | PASS | exists |
| tables | gov_exams | PASS | exists |
| tables | gov_official_sources | PASS | exists |
| tables | questions | PASS | exists |
| tables | gov_generated_papers | PASS | exists |
| tables | gov_generated_paper_questions | PASS | exists |
| tables | previous_year_papers | PASS | exists |
| tables | mock_tests | PASS | exists |
| tables | test_responses | PASS | exists |
| tables | sessions | PASS | exists |
| tables | session_answers | PASS | exists |
| tables | session_transcripts | PASS | exists |
| tables | feature_flags | PASS | exists |
| columns | profiles.credits | PASS | exists |
| rpc | deduct_credits_service | PASS | p_user_id uuid, p_action text, p_cost integer, p_session_id uuid, p_idempotency_key text, p_request_hash text |
| rpc | get_spendable_credits | PASS | p_user_id uuid |
| rpc | enqueue_gov_paper_job | PASS | p_user_id uuid, p_exam_id uuid, p_stage_id uuid, p_pattern_version_id uuid, p_syllabus_version_id uuid, p_mode text, p_language text, p_request_json jsonb, p_source_mix jsonb, p_missing_count integer, p_idempotency_key text, p_cost integer, p_random_seed text, p_inventory_snapshot jsonb, p_inventory_version text, p_status text, p_progress_stage text |
| rpc | finalize_gov_paper_credits | PASS | p_job_id uuid |
| rpc | release_gov_paper_credits | PASS | p_job_id uuid, p_reason text |
| rpc | sweep_gov_paper_jobs | PASS | p_limit integer |
| rpc | save_owned_test_answer | PASS | p_test_id uuid, p_question_id uuid, p_user_answer text, p_is_attempted boolean, p_is_marked_review boolean, p_time_spent_seconds integer, p_client_updated_at timestamp with time zone, p_expected_version integer |
| rpc | start_owned_mock_test | PASS | p_test_id uuid |
| rpc | claim_and_complete_test | PASS | p_test_id uuid, p_user_id uuid, p_total_score numeric, p_max_score numeric, p_accuracy integer, p_attempt_percentage integer, p_subject_breakdown jsonb, p_topic_breakdown jsonb, p_weak_topics text[], p_strong_topics text[], p_time_analysis jsonb, p_predicted_percentile integer, p_responses jsonb, p_algorithm_version text |
| rpc | start_owned_session | PASS | p_user_id uuid, p_type text, p_title text, p_document_id uuid, p_jd_id uuid, p_model_used text, p_tags text[], p_practice_context_id uuid, p_source_type text, p_duration_minutes integer, p_idempotency_key text |
| rpc | finalize_owned_session | PASS | p_user_id uuid, p_session_id uuid, p_terminal_reason text, p_answers jsonb, p_transcript jsonb, p_metrics jsonb |
| rpc | is_auth_email_verified | PASS | exists |
| rpc | get_public_feature_flags | PASS | exists |
| rpc | complete_onboarding | PASS | p_target_role text, p_experience_level text, p_preferred_model text, p_experience_years integer, p_notification_prefs jsonb, p_audio_input_device text, p_industry text, p_interview_date date, p_improvement_goals text[] |
| rpc | is_admin | PASS | exists |
| rpc | record_quiz_progress | PASS | p_quiz_id uuid, p_score numeric, p_passed boolean |
| rls | session_answers.enabled | PASS | on |
| rls | session_transcripts.enabled | PASS | on |
| rls | gov_paper_generation_jobs.enabled | PASS | on |
| rls | test_responses.enabled | PASS | on |
| rls | session_answers.policies | PASS | session_answers_admin, session_answers_own, session_answers_own_delete, session_answers_own_insert, session_answers_own_select, session_answers_own_update |
| rls | session_transcripts.policies | PASS | session_transcripts_admin, session_transcripts_own_delete, session_transcripts_own_insert, session_transcripts_own_select, session_transcripts_own_update |
| indexes | gov_paper_jobs_idempotency | PASS | found |
| indexes | test_responses_test_question | PASS | found |
| indexes | credit_transactions_stripe_payment | PASS | found |
| indexes | session_debriefs_session_user | PASS | found |
| feature_flags | row_count | PASS | 34 rows |
