-- Fix broken index from production_hardening: questions has no category column.
-- Schema: supabase/migrations/20260323000000_mock_test_engine.sql

DROP INDEX IF EXISTS public.idx_questions_category;

CREATE INDEX IF NOT EXISTS idx_questions_exam_subject
  ON public.questions(exam_type, subject);
