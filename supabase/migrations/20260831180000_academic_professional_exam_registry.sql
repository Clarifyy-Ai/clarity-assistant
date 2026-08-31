-- Academic / professional exam packs: JEE Main, JEE Advanced, NEET UG,
-- HPCL Engineer, and generic PSU CBT-style practice.
-- Patterns are versioned approximations from publicly documented structures;
-- candidates must verify on official websites. Independent platform — not
-- affiliated with NTA, IITs, HPCL, or any PSU. Sources are registry links only.

BEGIN;

INSERT INTO public.exam_families (code, name, sort_order) VALUES
  ('academic',     'Academic / Entrance', 80),
  ('professional', 'Professional / PSU', 85)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

INSERT INTO public.recruiting_bodies (code, name, jurisdiction, official_url, disclaimer_note)
VALUES
  (
    'NTA',
    'National Testing Agency',
    'central',
    'https://nta.ac.in/',
    'Independent practice registry entry. Verify notifications, syllabus, and scheme on nta.ac.in. Not affiliated with NTA.'
  ),
  (
    'HPCL',
    'Hindustan Petroleum Corporation Limited',
    'central',
    'https://www.hindustanpetroleum.com/',
    'Independent practice registry entry. Verify notifications, syllabus, and scheme on hindustanpetroleum.com. Not affiliated with HPCL.'
  ),
  (
    'PSU_EXAMS',
    'Public Sector Undertakings',
    'central',
    NULL,
    'Independent practice registry entry covering a generic PSU CBT-style pattern. Verify the active notification on the recruiting PSU careers site. Not affiliated with any PSU.'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  jurisdiction = EXCLUDED.jurisdiction,
  official_url = EXCLUDED.official_url,
  disclaimer_note = EXCLUDED.disclaimer_note,
  updated_at = now();

INSERT INTO public.gov_exams (
  recruiting_body_id, code, name, family, description, legacy_exam_type, review_state, is_public
)
SELECT b.id, v.code, v.name, v.family, v.description, v.legacy, 'approved', true
FROM public.recruiting_bodies b
JOIN (VALUES
  ('NTA', 'JEE_MAIN', 'JEE Main', 'academic',
   'JEE Main style objective practice pack. Independent platform — not affiliated with NTA. Verify the active information bulletin on nta.ac.in / jeemain.nta.nic.in.',
   'JEE Main'),
  ('NTA', 'JEE_ADV', 'JEE Advanced', 'academic',
   'JEE Advanced Paper 1 style practice pack. Conducted by IITs; this is an independent approximation — not affiliated with IITs or NTA. Verify on jeeadv.ac.in.',
   'JEE Advanced'),
  ('NTA', 'NEET', 'NEET UG', 'academic',
   'NEET UG style objective practice pack. Independent platform — not affiliated with NTA. Verify the active information bulletin on nta.ac.in / neet.nta.nic.in.',
   'NEET UG'),
  ('HPCL', 'HPCL_ENGINEER', 'HPCL Engineer', 'professional',
   'HPCL Engineer CBT-style practice pack. Independent platform — not affiliated with HPCL. Verify the active notification on hindustanpetroleum.com.',
   'HPCL Engineer'),
  ('PSU_EXAMS', 'PSU', 'PSU', 'professional',
   'Generic PSU CBT-style practice pack. Independent platform — not affiliated with any public sector undertaking. Verify scheme, marks, and duration on the recruiting PSU careers site.',
   'PSU')
) AS v(body_code, code, name, family, description, legacy)
  ON b.code = v.body_code
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  description = EXCLUDED.description,
  legacy_exam_type = EXCLUDED.legacy_exam_type,
  review_state = 'approved',
  is_public = true,
  updated_at = now();

INSERT INTO public.gov_exam_aliases (exam_id, alias)
SELECT e.id, a.alias
FROM public.gov_exams e
JOIN (VALUES
  ('JEE_MAIN', 'JEE Main'),
  ('JEE_MAIN', 'JEE Mains'),
  ('JEE_MAIN', 'JEE'),
  ('JEE_MAIN', 'IIT JEE'),
  ('JEE_MAIN', 'NTA JEE'),
  ('JEE_MAIN', 'Joint Entrance Examination Main'),
  ('JEE_ADV', 'JEE Advanced'),
  ('JEE_ADV', 'JEE Adv'),
  ('JEE_ADV', 'JEE Advanced Paper 1'),
  ('JEE_ADV', 'IIT JEE Advanced'),
  ('NEET', 'NEET UG'),
  ('NEET', 'NEET'),
  ('NEET', 'NEET-UG'),
  ('NEET', 'NTA NEET'),
  ('NEET', 'National Eligibility cum Entrance Test'),
  ('HPCL_ENGINEER', 'HPCL Engineer'),
  ('HPCL_ENGINEER', 'HPCL'),
  ('HPCL_ENGINEER', 'Hindustan Petroleum'),
  ('HPCL_ENGINEER', 'HPCL Engineering'),
  ('PSU', 'PSU'),
  ('PSU', 'PSU Exams'),
  ('PSU', 'Public Sector'),
  ('PSU', 'Public Sector Undertaking')
) AS a(code, alias) ON e.code = a.code
ON CONFLICT (exam_id, alias) DO NOTHING;

INSERT INTO public.gov_exam_stages (exam_id, code, name, sort_order)
SELECT e.id, s.code, s.name, s.sort_order
FROM public.gov_exams e
JOIN (VALUES
  ('JEE_MAIN', 'MAIN', 'Main', 1),
  ('JEE_ADV', 'PAPER_1', 'Paper 1', 1),
  ('NEET', 'UG', 'UG', 1),
  ('HPCL_ENGINEER', 'CBT', 'CBT', 1),
  ('PSU', 'CBT', 'CBT', 1)
) AS s(exam_code, code, name, sort_order) ON e.code = s.exam_code
ON CONFLICT (exam_id, code) DO NOTHING;

INSERT INTO public.gov_exam_pattern_versions (
  exam_id, stage_id, version, effective_date,
  total_questions, total_marks, duration_minutes, negative_mark, marks_per_question,
  languages, source_url, review_state, notes
)
SELECT e.id, st.id, p.version, p.effective_date::date,
       p.total_questions, p.total_marks, p.duration_minutes, p.negative_mark, p.marks_per_q,
       p.languages, p.source_url, 'approved', p.notes
FROM public.gov_exams e
JOIN public.gov_exam_stages st ON st.exam_id = e.id
JOIN (VALUES
  ('JEE_MAIN', 'MAIN', '2024.1', '2024-01-01', 90, 300, 180, 1.00, 4.0,
   ARRAY['en']::text[], 'https://nta.ac.in/',
   'Practice pattern approximating publicly documented JEE Main structure (90 Q, 300 marks, 180 min). Independent platform — not affiliated with NTA. Confirm marks, sections, languages, and negative marking on the active NTA information bulletin.'),
  ('JEE_ADV', 'PAPER_1', '2024.1', '2024-01-01', 54, 180, 180, 1.00, 3.33,
   ARRAY['en']::text[], 'https://jeeadv.ac.in/',
   'Practice pattern approximating a JEE Advanced Paper 1 style paper (54 Q, 180 marks, 180 min; ~3.33 marks/question). Independent platform — not affiliated with IITs or NTA. Paper structure changes yearly — verify on jeeadv.ac.in.'),
  ('NEET', 'UG', '2024.1', '2024-01-01', 180, 720, 200, 1.00, 4.0,
   ARRAY['en']::text[], 'https://nta.ac.in/',
   'Practice pattern approximating publicly documented NEET UG structure (180 Q, 720 marks, 200 min). Independent platform — not affiliated with NTA. Confirm marks, sections, and negative marking on the active NTA information bulletin.'),
  ('HPCL_ENGINEER', 'CBT', '2024.1', '2024-01-01', 100, 100, 120, 0.25, 1.0,
   ARRAY['en']::text[], 'https://www.hindustanpetroleum.com/',
   'Practice pattern approximating an HPCL Engineer CBT-style paper (100 Q, 100 marks, 120 min). Independent platform — not affiliated with HPCL. Confirm scheme on the active HPCL notification.'),
  ('PSU', 'CBT', '2024.1', '2024-01-01', 100, 100, 90, 0.25, 1.0,
   ARRAY['en']::text[], NULL,
   'Practice pattern approximating a generic PSU CBT-style paper (100 Q, 100 marks, 90 min). Independent platform — not affiliated with any PSU. Confirm scheme on the recruiting organisation''s official careers notification.')
) AS p(exam_code, stage_code, version, effective_date, total_questions, total_marks,
       duration_minutes, negative_mark, marks_per_q, languages, source_url, notes)
  ON e.code = p.exam_code AND st.code = p.stage_code
ON CONFLICT (stage_id, version) DO UPDATE SET
  total_questions = EXCLUDED.total_questions,
  total_marks = EXCLUDED.total_marks,
  duration_minutes = EXCLUDED.duration_minutes,
  negative_mark = EXCLUDED.negative_mark,
  marks_per_question = EXCLUDED.marks_per_question,
  languages = EXCLUDED.languages,
  source_url = EXCLUDED.source_url,
  review_state = 'approved',
  notes = EXCLUDED.notes;

INSERT INTO public.gov_exam_sections (pattern_version_id, code, name, question_count, marks, sort_order)
SELECT pv.id, s.code, s.name, s.q, s.marks, s.sort_order
FROM public.gov_exam_pattern_versions pv
JOIN public.gov_exam_stages st ON st.id = pv.stage_id
JOIN public.gov_exams e ON e.id = st.exam_id
JOIN (VALUES
  ('JEE_MAIN', 'MAIN', 'physics', 'Physics', 30, 120, 1),
  ('JEE_MAIN', 'MAIN', 'chemistry', 'Chemistry', 30, 120, 2),
  ('JEE_MAIN', 'MAIN', 'maths', 'Mathematics', 30, 120, 3),
  ('JEE_ADV', 'PAPER_1', 'physics', 'Physics', 18, 60, 1),
  ('JEE_ADV', 'PAPER_1', 'chemistry', 'Chemistry', 18, 60, 2),
  ('JEE_ADV', 'PAPER_1', 'maths', 'Mathematics', 18, 60, 3),
  ('NEET', 'UG', 'physics', 'Physics', 45, 180, 1),
  ('NEET', 'UG', 'chemistry', 'Chemistry', 45, 180, 2),
  ('NEET', 'UG', 'biology', 'Biology', 90, 360, 3),
  ('HPCL_ENGINEER', 'CBT', 'technical', 'Technical', 40, 40, 1),
  ('HPCL_ENGINEER', 'CBT', 'english', 'English', 20, 20, 2),
  ('HPCL_ENGINEER', 'CBT', 'quant', 'Quantitative Aptitude', 20, 20, 3),
  ('HPCL_ENGINEER', 'CBT', 'reasoning', 'Reasoning', 20, 20, 4),
  ('PSU', 'CBT', 'awareness', 'General Awareness', 25, 25, 1),
  ('PSU', 'CBT', 'english', 'English', 25, 25, 2),
  ('PSU', 'CBT', 'quant', 'Quantitative Aptitude', 25, 25, 3),
  ('PSU', 'CBT', 'reasoning', 'Reasoning', 25, 25, 4)
) AS s(exam_code, stage_code, code, name, q, marks, sort_order)
  ON e.code = s.exam_code AND st.code = s.stage_code AND pv.version = '2024.1'
ON CONFLICT (pattern_version_id, code) DO NOTHING;

INSERT INTO public.gov_exam_syllabus_versions (
  exam_id, stage_id, version, effective_date, source_url, review_state, topics_json
)
SELECT e.id, st.id, '2024.1', '2024-01-01'::date, pv.source_url, 'approved', t.topics
FROM public.gov_exams e
JOIN public.gov_exam_stages st ON st.exam_id = e.id
JOIN public.gov_exam_pattern_versions pv ON pv.stage_id = st.id AND pv.version = '2024.1'
JOIN (VALUES
  ('JEE_MAIN', 'MAIN', '[
    {"section":"physics","topics":["mechanics","thermodynamics","electrostatics","magnetism","optics","modern_physics"]},
    {"section":"chemistry","topics":["organic_chemistry","inorganic_chemistry","physical_chemistry"]},
    {"section":"maths","topics":["algebra","calculus","trigonometry","coordinate_geometry","vectors"]}
  ]'::jsonb),
  ('JEE_ADV', 'PAPER_1', '[
    {"section":"physics","topics":["mechanics","thermodynamics","electrostatics","magnetism","optics","modern_physics"]},
    {"section":"chemistry","topics":["organic_chemistry","inorganic_chemistry","physical_chemistry"]},
    {"section":"maths","topics":["algebra","calculus","trigonometry","coordinate_geometry","vectors"]}
  ]'::jsonb),
  ('NEET', 'UG', '[
    {"section":"physics","topics":["mechanics","thermodynamics","optics"]},
    {"section":"chemistry","topics":["organic_chemistry","inorganic_chemistry","physical_chemistry"]},
    {"section":"biology","topics":["cell_biology","genetics","human_physiology","plant_physiology","ecology"]}
  ]'::jsonb),
  ('HPCL_ENGINEER', 'CBT', '[
    {"section":"technical","topics":["structural_engineering","soil_mechanics","fluid_mechanics"]},
    {"section":"english","topics":["grammar","comprehension"]},
    {"section":"quant","topics":["quantitative_aptitude"]},
    {"section":"reasoning","topics":["logical_reasoning"]}
  ]'::jsonb),
  ('PSU', 'CBT', '[
    {"section":"awareness","topics":["domain_knowledge"]},
    {"section":"english","topics":["english_grammar","comprehension"]},
    {"section":"quant","topics":["quantitative_aptitude"]},
    {"section":"reasoning","topics":["analytical_reasoning"]}
  ]'::jsonb)
) AS t(exam_code, stage_code, topics) ON e.code = t.exam_code AND st.code = t.stage_code
ON CONFLICT (stage_id, version) DO UPDATE SET
  source_url = EXCLUDED.source_url,
  review_state = 'approved',
  topics_json = EXCLUDED.topics_json;

INSERT INTO public.gov_official_sources (
  recruiting_body_id, exam_id, document_type, title, source_url,
  is_official, license_class, review_state, metadata
)
SELECT b.id, e.id, s.doc_type, s.title, s.url, true, 'official_public', 'approved',
       jsonb_build_object(
         'note',
         'Link-only registry entry. Independent platform — not affiliated with the recruiting body. Verify live content on the official site.'
       )
FROM public.gov_exams e
JOIN public.recruiting_bodies b ON b.id = e.recruiting_body_id
JOIN (VALUES
  ('JEE_MAIN', 'notification', 'NTA official website', 'https://nta.ac.in/'),
  ('JEE_MAIN', 'syllabus', 'JEE Main information bulletin (verify current notice)', 'https://jeemain.nta.nic.in/'),
  ('JEE_ADV', 'notification', 'JEE Advanced official website', 'https://jeeadv.ac.in/'),
  ('JEE_ADV', 'syllabus', 'JEE Advanced information brochure (verify current notice)', 'https://jeeadv.ac.in/'),
  ('NEET', 'notification', 'NTA official website', 'https://nta.ac.in/'),
  ('NEET', 'syllabus', 'NEET UG information bulletin (verify current notice)', 'https://neet.nta.nic.in/'),
  ('HPCL_ENGINEER', 'notification', 'HPCL official website / careers', 'https://www.hindustanpetroleum.com/')
) AS s(exam_code, doc_type, title, url) ON e.code = s.exam_code
AND NOT EXISTS (
  SELECT 1 FROM public.gov_official_sources x
  WHERE x.exam_id = e.id AND x.document_type = s.doc_type AND x.source_url = s.url
);

COMMIT;
