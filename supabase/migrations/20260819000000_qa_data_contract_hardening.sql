-- QA regression hardening for environments created before the current schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.interview_practice_plan_items
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF to_regclass('public.company_research') IS NOT NULL THEN
    IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.company_research'::regclass
         AND conname = 'company_research_user_company_unique'
     ) THEN
    ALTER TABLE public.company_research
      ADD CONSTRAINT company_research_user_company_unique UNIQUE (user_id, company_name);
    END IF;
  END IF;

  IF to_regclass('public.session_questions') IS NOT NULL THEN
    IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.session_questions'::regclass
         AND conname = 'session_questions_session_id_fkey'
     ) THEN
    ALTER TABLE public.session_questions
      ADD CONSTRAINT session_questions_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;
END $$;

-- Enforce Answer Bank quality server-side too, so imports and direct API calls
-- cannot bypass the client-side validation.
CREATE OR REPLACE FUNCTION public.validate_answer_bank_quality()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_answer text := lower(regexp_replace(trim(NEW.answer_text), '[[:space:]]+', ' ', 'g'));
BEGIN
  IF length(trim(NEW.answer_text)) < 10 OR length(NEW.answer_text) > 5000 THEN
    RAISE EXCEPTION 'Answer must be between 10 and 5000 characters' USING ERRCODE = '22023';
  END IF;
  IF trim(NEW.answer_text) ~ '^(.)\1{7,}$'
     OR length(regexp_replace(normalized_answer, '[^[:alnum:]]', '', 'g')) < 3 THEN
    RAISE EXCEPTION 'Answer must contain meaningful, varied content' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.answer_bank existing
    WHERE existing.user_id = NEW.user_id
      AND lower(regexp_replace(trim(existing.question_text), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(trim(NEW.question_text), '[[:space:]]+', ' ', 'g'))
      AND lower(regexp_replace(trim(existing.answer_text), '[[:space:]]+', ' ', 'g')) = normalized_answer
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'This answer is already saved for this question' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS answer_bank_quality_guard ON public.answer_bank;
CREATE TRIGGER answer_bank_quality_guard
  BEFORE INSERT OR UPDATE OF question_text, answer_text ON public.answer_bank
  FOR EACH ROW EXECUTE FUNCTION public.validate_answer_bank_quality();
