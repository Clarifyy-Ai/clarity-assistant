-- Ensure seeded Sum the numbers starter passes visible sample cases (empty-array safe).
UPDATE public.coding_questions
SET starter_code = E'function solve(input) {\n  const nums = Array.isArray(input) ? input : [];\n  return nums.reduce((sum, n) => sum + n, 0);\n}\n'
WHERE title = 'Sum the numbers'
  AND evaluation_mode = 'javascript_solve';
