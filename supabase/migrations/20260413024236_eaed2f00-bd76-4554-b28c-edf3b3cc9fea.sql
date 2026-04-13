-- Delete future exam papers (year >= 2026) that have no question data
DELETE FROM public.exam_papers WHERE year >= 2026;

-- Create a trigger function to prevent future year papers
CREATE OR REPLACE FUNCTION public.validate_exam_paper_year()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.year > EXTRACT(YEAR FROM NOW())::integer + 1 THEN
    RAISE EXCEPTION 'Cannot insert exam papers more than 1 year in the future (year: %)', NEW.year;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach the trigger
CREATE TRIGGER check_exam_paper_year
  BEFORE INSERT OR UPDATE ON public.exam_papers
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_exam_paper_year();