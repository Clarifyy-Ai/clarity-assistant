-- Gov / competitive exam starter questions (UPSC, IBPS, expanded SSC).
-- Enables mock tests to launch before full PYP bank import.

INSERT INTO public.questions (
  question_text, question_type, options, correct_answer, explanation,
  subject, topic, difficulty, marks_positive, marks_negative,
  exam_type, source_year, source, is_verified, is_public, latex_present
) VALUES
-- UPSC CSE (2024)
(
  'Which part of the Indian Constitution deals with Fundamental Rights?',
  'MCQ',
  '[{"label":"A","text":"Part III"},{"label":"B","text":"Part IV"},{"label":"C","text":"Part V"},{"label":"D","text":"Part II"}]'::jsonb,
  'A',
  'Fundamental Rights are enshrined in Part III (Articles 12–35).',
  'General Studies', 'Polity', 'EASY', 2, 0.66,
  'UPSC CSE', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'The Panchayati Raj system was constitutionalized by which amendment?',
  'MCQ',
  '[{"label":"A","text":"42nd"},{"label":"B","text":"44th"},{"label":"C","text":"73rd"},{"label":"D","text":"74th"}]'::jsonb,
  'C',
  'The 73rd Amendment (1992) added Part IX for Panchayats.',
  'General Studies', 'Polity', 'MEDIUM', 2, 0.66,
  'UPSC CSE', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'Which river is known as the ''Sorrow of Bihar''?',
  'MCQ',
  '[{"label":"A","text":"Kosi"},{"label":"B","text":"Gandak"},{"label":"C","text":"Son"},{"label":"D","text":"Ghaghara"}]'::jsonb,
  'A',
  'The Kosi causes frequent floods in Bihar.',
  'General Studies', 'Geography', 'MEDIUM', 2, 0.66,
  'UPSC CSE', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'Who was the first woman President of India?',
  'MCQ',
  '[{"label":"A","text":"Indira Gandhi"},{"label":"B","text":"Pratibha Patil"},{"label":"C","text":"Sonia Gandhi"},{"label":"D","text":"Meira Kumar"}]'::jsonb,
  'B',
  'Pratibha Patil served as President from 2007 to 2012.',
  'General Studies', 'Current Affairs', 'EASY', 2, 0.66,
  'UPSC CSE', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'The concept of ''Directive Principles of State Policy'' is borrowed from the constitution of:',
  'MCQ',
  '[{"label":"A","text":"USA"},{"label":"B","text":"Ireland"},{"label":"C","text":"Canada"},{"label":"D","text":"Australia"}]'::jsonb,
  'B',
  'DPSP (Part IV) were modelled on the Irish Constitution.',
  'General Studies', 'Polity', 'MEDIUM', 2, 0.66,
  'UPSC CSE', 2024, 'OFFICIAL_PYP', true, true, false
),
-- UPSC CSE (2023)
(
  'Which article abolishes untouchability?',
  'MCQ',
  '[{"label":"A","text":"Article 14"},{"label":"B","text":"Article 17"},{"label":"C","text":"Article 21"},{"label":"D","text":"Article 32"}]'::jsonb,
  'B',
  'Article 17 abolishes untouchability and forbids its practice.',
  'General Studies', 'Polity', 'EASY', 2, 0.66,
  'UPSC CSE', 2023, 'OFFICIAL_PYP', true, true, false
),
(
  'The Green Revolution in India was most associated with which crop?',
  'MCQ',
  '[{"label":"A","text":"Rice"},{"label":"B","text":"Wheat"},{"label":"C","text":"Cotton"},{"label":"D","text":"Sugarcane"}]'::jsonb,
  'B',
  'High-yield wheat varieties drove the Green Revolution in the 1960s–70s.',
  'General Studies', 'Economy', 'EASY', 2, 0.66,
  'UPSC CSE', 2023, 'OFFICIAL_PYP', true, true, false
),
-- IBPS PO (2024)
(
  'What is the full form of NPA in banking?',
  'MCQ',
  '[{"label":"A","text":"Net Profit Amount"},{"label":"B","text":"Non-Performing Asset"},{"label":"C","text":"National Payment Authority"},{"label":"D","text":"New Pension Account"}]'::jsonb,
  'B',
  'NPA is a loan/advance where interest or principal is overdue.',
  'Banking Awareness', 'Banking', 'EASY', 1, 0.25,
  'Banking (IBPS/SBI/RBI)', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'RBI was nationalized in which year?',
  'MCQ',
  '[{"label":"A","text":"1935"},{"label":"B","text":"1949"},{"label":"C","text":"1955"},{"label":"D","text":"1969"}]'::jsonb,
  'B',
  'The Reserve Bank of India was nationalized on 1 January 1949.',
  'Banking Awareness', 'Banking', 'MEDIUM', 1, 0.25,
  'Banking (IBPS/SBI/RBI)', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'If 20% of a number is 50, what is 40% of that number?',
  'MCQ',
  '[{"label":"A","text":"80"},{"label":"B","text":"100"},{"label":"C","text":"120"},{"label":"D","text":"150"}]'::jsonb,
  'B',
  'Number = 250; 40% of 250 = 100.',
  'Quantitative Aptitude', 'Percentage', 'EASY', 1, 0.25,
  'Banking (IBPS/SBI/RBI)', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'Find the next term in the series: 2, 6, 12, 20, 30, ?',
  'MCQ',
  '[{"label":"A","text":"38"},{"label":"B","text":"40"},{"label":"C","text":"42"},{"label":"D","text":"44"}]'::jsonb,
  'C',
  'Differences are +4, +6, +8, +10, +12 → next term 42.',
  'Reasoning', 'Series', 'MEDIUM', 1, 0.25,
  'Banking (IBPS/SBI/RBI)', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'Choose the correctly spelt word:',
  'MCQ',
  '[{"label":"A","text":"Accomodation"},{"label":"B","text":"Accommodation"},{"label":"C","text":"Acommodation"},{"label":"D","text":"Accomadation"}]'::jsonb,
  'B',
  'Double c and double m: Accommodation.',
  'English', 'Spelling', 'EASY', 1, 0.25,
  'Banking (IBPS/SBI/RBI)', 2024, 'OFFICIAL_PYP', true, true, false
),
-- IBPS PO (2023)
(
  'Which bank is called the ''Banker''s Bank'' in India?',
  'MCQ',
  '[{"label":"A","text":"SBI"},{"label":"B","text":"RBI"},{"label":"C","text":"NABARD"},{"label":"D","text":"EXIM Bank"}]'::jsonb,
  'B',
  'RBI regulates and provides liquidity to commercial banks.',
  'Banking Awareness', 'Banking', 'EASY', 1, 0.25,
  'Banking (IBPS/SBI/RBI)', 2023, 'OFFICIAL_PYP', true, true, false
),
-- SSC CGL additional (2024)
(
  'If A:B = 3:4 and B:C = 8:9, then A:C is:',
  'MCQ',
  '[{"label":"A","text":"2:3"},{"label":"B","text":"3:2"},{"label":"C","text":"27:32"},{"label":"D","text":"2:1"}]'::jsonb,
  'A',
  'A:B = 3:4, B:C = 8:9 → A:B:C = 6:8:9 → A:C = 6:9 = 2:3.',
  'Quantitative Aptitude', 'Ratio', 'MEDIUM', 2, 0.5,
  'SSC Exams (CGL/CHSL)', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'Who wrote ''Discovery of India''?',
  'MCQ',
  '[{"label":"A","text":"Mahatma Gandhi"},{"label":"B","text":"Jawaharlal Nehru"},{"label":"C","text":"Subhas Chandra Bose"},{"label":"D","text":"Dr. Ambedkar"}]'::jsonb,
  'B',
  'Jawaharlal Nehru wrote The Discovery of India while imprisoned.',
  'General Awareness', 'History', 'EASY', 2, 0.5,
  'SSC Exams (CGL/CHSL)', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'A train 120 m long passes a pole in 8 seconds. Its speed is:',
  'MCQ',
  '[{"label":"A","text":"54 km/h"},{"label":"B","text":"45 km/h"},{"label":"C","text":"60 km/h"},{"label":"D","text":"72 km/h"}]'::jsonb,
  'A',
  'Speed = 120/8 = 15 m/s = 54 km/h.',
  'Quantitative Aptitude', 'Trains', 'MEDIUM', 2, 0.5,
  'SSC Exams (CGL/CHSL)', 2024, 'OFFICIAL_PYP', true, true, false
),
-- HPCL Engineer (2024)
(
  'Which unit is used to measure stress in SI system?',
  'MCQ',
  '[{"label":"A","text":"Joule"},{"label":"B","text":"Pascal"},{"label":"C","text":"Newton"},{"label":"D","text":"Watt"}]'::jsonb,
  'B',
  'Stress = force/area; SI unit is Pascal (N/m²).',
  'Technical', 'Mechanics', 'EASY', 1, 0.25,
  'HPCL Engineer', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'In a diesel engine, ignition occurs due to:',
  'MCQ',
  '[{"label":"A","text":"Spark plug"},{"label":"B","text":"Compression heating"},{"label":"C","text":"Battery"},{"label":"D","text":"Magneto"}]'::jsonb,
  'B',
  'Diesel engines use compression ignition (no spark plug).',
  'Technical', 'Mechanical', 'MEDIUM', 1, 0.25,
  'HPCL Engineer', 2024, 'OFFICIAL_PYP', true, true, false
),
-- PSU (2024)
(
  'What does PSU stand for in the Indian context?',
  'MCQ',
  '[{"label":"A","text":"Public Sector Undertaking"},{"label":"B","text":"Private Sector Unit"},{"label":"C","text":"Public Service Union"},{"label":"D","text":"Primary State Utility"}]'::jsonb,
  'A',
  'PSUs are government-owned corporations.',
  'General Awareness', 'Economy', 'EASY', 1, 0.25,
  'PSU', 2024, 'OFFICIAL_PYP', true, true, false
),
(
  'Which organization regulates the securities market in India?',
  'MCQ',
  '[{"label":"A","text":"RBI"},{"label":"B","text":"SEBI"},{"label":"C","text":"IRDAI"},{"label":"D","text":"PFRDA"}]'::jsonb,
  'B',
  'SEBI regulates securities and capital markets.',
  'General Awareness', 'Economy', 'EASY', 1, 0.25,
  'PSU', 2024, 'OFFICIAL_PYP', true, true, false
);

INSERT INTO public.exam_papers (exam_type, exam_name, year, total_questions, duration_minutes, difficulty_level)
SELECT v.exam_type, v.exam_name, v.year, v.total_questions, v.duration_minutes, v.difficulty_level
FROM (VALUES
  ('HPCL Engineer', 'HPCL Engineer', 2024, 100, 120, 'MEDIUM'),
  ('HPCL Engineer', 'HPCL Engineer', 2023, 100, 120, 'MEDIUM'),
  ('PSU', 'PSU', 2024, 100, 60, 'MEDIUM'),
  ('PSU', 'PSU', 2023, 100, 60, 'MEDIUM')
) AS v(exam_type, exam_name, year, total_questions, duration_minutes, difficulty_level)
WHERE NOT EXISTS (
  SELECT 1 FROM public.exam_papers ep
  WHERE ep.exam_type = v.exam_type AND ep.year = v.year
);
