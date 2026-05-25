-- Starter PYP-style questions so exam papers can launch before full bank seeding.
-- Admin can add more via Seed Question Bank (PDF/Excel) or AI gap-fill.

INSERT INTO public.questions (
  question_text, question_type, options, correct_answer, explanation,
  subject, topic, difficulty, marks_positive, marks_negative,
  exam_type, source_year, source, is_verified, is_public, latex_present
) VALUES
(
  'If $f(x) = x^2 - 4x + 3$, what is the minimum value of $f(x)$?',
  'MCQ',
  '[{"label":"A","text":"-1"},{"label":"B","text":"0"},{"label":"C","text":"1"},{"label":"D","text":"3"}]'::jsonb,
  'A',
  'Complete the square: $f(x)=(x-2)^2-1$, minimum is $-1$.',
  'Mathematics', 'Quadratic', 'MEDIUM', 4, 1,
  'JEE Main', 2024, 'OFFICIAL_PYP', true, true, true
),
(
  'Which reagent is used to distinguish aldehydes from ketones in the Tollens test?',
  'MCQ',
  '[{"label":"A","text":"Fehling solution"},{"label":"B","text":"Tollens reagent (ammoniacal AgNO3)"},{"label":"C","text":"Lucas reagent"},{"label":"D","text":"Iodoform"}]'::jsonb,
  'B',
  'Tollens reagent oxidises aldehydes to carboxylate and reduces Ag+ to silver mirror.',
  'Chemistry', 'Organic', 'EASY', 4, 1,
  'JEE Main', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'A particle moves with velocity $v = 3t^2$ m/s. Distance travelled in first 2 s is:',
  'MCQ',
  '[{"label":"A","text":"4 m"},{"label":"B","text":"8 m"},{"label":"C","text":"12 m"},{"label":"D","text":"24 m"}]'::jsonb,
  'B',
  '$s = \\int_0^2 3t^2 dt = [t^3]_0^2 = 8$ m.',
  'Physics', 'Kinematics', 'MEDIUM', 4, 1,
  'JEE Main', 2024, 'OFFICIAL_PYP', true, true, true
),
(
  'The unit of electric flux is:',
  'MCQ',
  '[{"label":"A","text":"N/C"},{"label":"B","text":"N·m/C"},{"label":"C","text":"C/m^2"},{"label":"D","text":"V/m"}]'::jsonb,
  'B',
  'Electric flux $\\Phi_E = \\vec{E}\\cdot\\vec{A}$ has SI unit N·m/C.',
  'Physics', 'Electrostatics', 'EASY', 4, 1,
  'NEET UG', 2024, 'OFFICIAL_PYP', true, true, true
),
(
  'Which hormone regulates blood glucose by promoting glycogen breakdown?',
  'MCQ',
  '[{"label":"A","text":"Insulin"},{"label":"B","text":"Glucagon"},{"label":"C","text":"Thyroxine"},{"label":"D","text":"ADH"}]'::jsonb,
  'B',
  'Glucagon raises blood glucose; insulin lowers it.',
  'Biology', 'Endocrine', 'EASY', 4, 1,
  'NEET UG', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'Select the synonym of ''ABUNDANT'':',
  'MCQ',
  '[{"label":"A","text":"Scarce"},{"label":"B","text":"Plentiful"},{"label":"C","text":"Weak"},{"label":"D","text":"Rigid"}]'::jsonb,
  'B',
  'Abundant means existing in large quantity; plentiful is closest.',
  'English', 'Vocabulary', 'EASY', 2, 0.5,
  'SSC Exams (CGL/CHSL)', 2024, 'OFFICIAL_PYP', true, true, false
);
