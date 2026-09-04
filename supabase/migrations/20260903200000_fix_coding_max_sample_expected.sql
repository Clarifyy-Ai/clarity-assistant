-- Fix max-titled coding questions that still carry the hardcoded Two-number-sum fixtures
-- ([2,3]→5 / [9,1]→10). Do not touch Sum the numbers / Two number sum.

WITH mismatched AS (
  SELECT q.id
  FROM public.coding_questions q
  JOIN public.coding_test_cases t
    ON t.question_id = q.id
   AND t.is_hidden = false
   AND t.input_json = '[2, 3]'::jsonb
   AND t.expected_json = '5'::jsonb
  WHERE q.title ILIKE '%maximum%'
    AND q.title NOT ILIKE '%sum%'
)
UPDATE public.coding_questions q
SET
  sample_input = '[2, 3]',
  sample_output = '3',
  description = CASE
    WHEN q.description ILIKE '%sum%' THEN
      'Write a function solve(input) that receives an array of numbers and returns the maximum value.'
    ELSE q.description
  END
FROM mismatched m
WHERE q.id = m.id;

UPDATE public.coding_test_cases t
SET expected_json = '3'::jsonb
FROM public.coding_questions q
WHERE t.question_id = q.id
  AND q.title ILIKE '%maximum%'
  AND q.title NOT ILIKE '%sum%'
  AND t.is_hidden = false
  AND t.input_json = '[2, 3]'::jsonb
  AND t.expected_json = '5'::jsonb;

UPDATE public.coding_test_cases t
SET expected_json = '9'::jsonb
FROM public.coding_questions q
WHERE t.question_id = q.id
  AND q.title ILIKE '%maximum%'
  AND q.title NOT ILIKE '%sum%'
  AND t.is_hidden = true
  AND t.input_json = '[9, 1]'::jsonb
  AND t.expected_json = '10'::jsonb;
