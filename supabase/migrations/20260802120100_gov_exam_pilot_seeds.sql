-- Pilot exam packs: SSC CGL Tier I, RRB NTPC CBT 1, IBPS PO Prelims, UPSC CSE Prelims GS.
-- Patterns are versioned approximations from publicly documented structures;
-- candidates must verify on official websites. Sources are registry links only (no scraped PDFs).

BEGIN;

INSERT INTO public.recruiting_bodies (code, name, jurisdiction, official_url) VALUES
  ('SSC', 'Staff Selection Commission', 'central', 'https://ssc.gov.in/'),
  ('RRB', 'Railway Recruitment Boards', 'central', 'https://www.rrbcdg.gov.in/'),
  ('IBPS', 'Institute of Banking Personnel Selection', 'central', 'https://www.ibps.in/'),
  ('UPSC', 'Union Public Service Commission', 'central', 'https://upsc.gov.in/')
ON CONFLICT (code) DO NOTHING;

-- Exams
INSERT INTO public.gov_exams (recruiting_body_id, code, name, family, description, legacy_exam_type, review_state, is_public)
SELECT b.id, v.code, v.name, v.family, v.description, v.legacy, 'approved', true
FROM public.recruiting_bodies b
JOIN (VALUES
  ('SSC', 'SSC_CGL', 'SSC Combined Graduate Level', 'ssc',
   'Tier I objective paper. Independent practice pack — verify current notification on ssc.gov.in.',
   'SSC Exams (CGL/CHSL)'),
  ('RRB', 'RRB_NTPC', 'RRB NTPC', 'railways',
   'CBT 1 style practice. Verify CEN notification on official RRB websites.',
   'GENERAL'),
  ('IBPS', 'IBPS_PO', 'IBPS PO Preliminary', 'banking',
   'Preliminary objective paper practice. Verify structure on ibps.in.',
   'Banking (IBPS/SBI/RBI)'),
  ('UPSC', 'UPSC_CSE_PRELIMS', 'UPSC Civil Services Preliminary (GS)', 'upsc',
   'GS Paper I style practice. Official papers: upsc.gov.in previous question papers archive.',
   'UPSC CSE')
) AS v(body_code, code, name, family, description, legacy)
  ON b.code = v.body_code
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  legacy_exam_type = EXCLUDED.legacy_exam_type,
  review_state = 'approved',
  is_public = true,
  updated_at = now();

-- Aliases
INSERT INTO public.gov_exam_aliases (exam_id, alias)
SELECT e.id, a.alias
FROM public.gov_exams e
JOIN (VALUES
  ('SSC_CGL', 'SSC CGL'),
  ('SSC_CGL', 'CGL'),
  ('SSC_CGL', 'Combined Graduate Level'),
  ('RRB_NTPC', 'RRB NTPC'),
  ('RRB_NTPC', 'Railway NTPC'),
  ('RRB_NTPC', 'NTPC'),
  ('IBPS_PO', 'IBPS PO'),
  ('IBPS_PO', 'IBPS Probationary Officer'),
  ('IBPS_PO', 'Bank PO'),
  ('UPSC_CSE_PRELIMS', 'UPSC Prelims'),
  ('UPSC_CSE_PRELIMS', 'Civil Services Prelims'),
  ('UPSC_CSE_PRELIMS', 'IAS Prelims'),
  ('UPSC_CSE_PRELIMS', 'UPSC CSE')
) AS a(code, alias) ON e.code = a.code
ON CONFLICT (exam_id, alias) DO NOTHING;

-- Stages
INSERT INTO public.gov_exam_stages (exam_id, code, name, sort_order)
SELECT e.id, s.code, s.name, s.sort_order
FROM public.gov_exams e
JOIN (VALUES
  ('SSC_CGL', 'TIER_I', 'Tier I', 1),
  ('RRB_NTPC', 'CBT_1', 'CBT 1', 1),
  ('IBPS_PO', 'PRELIMS', 'Preliminary', 1),
  ('UPSC_CSE_PRELIMS', 'GS_PAPER_I', 'GS Paper I', 1)
) AS s(exam_code, code, name, sort_order) ON e.code = s.exam_code
ON CONFLICT (exam_id, code) DO NOTHING;

-- Pattern versions (pilot — labeled as practice patterns)
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
  ('SSC_CGL', 'TIER_I', '2024.1', '2024-01-01', 100, 200, 60, 0.50, 2.0,
   ARRAY['en','hi']::text[], 'https://ssc.gov.in/',
   'Practice pattern for Tier I style mocks. Confirm marks/sections on the active SSC notification.'),
  ('RRB_NTPC', 'CBT_1', '2024.1', '2024-01-01', 100, 100, 90, 0.33, 1.0,
   ARRAY['en','hi']::text[], 'https://www.rrbcdg.gov.in/',
   'CBT 1 style practice pattern. Confirm against the applicable CEN.'),
  ('IBPS_PO', 'PRELIMS', '2024.1', '2024-01-01', 100, 100, 60, 0.25, 1.0,
   ARRAY['en','hi']::text[], 'https://www.ibps.in/',
   'PO Prelims style practice. Confirm against the current IBPS notification.'),
  ('UPSC_CSE_PRELIMS', 'GS_PAPER_I', '2024.1', '2024-01-01', 100, 200, 120, 0.66, 2.0,
   ARRAY['en','hi']::text[], 'https://upsc.gov.in/',
   'GS Paper I style practice. Official previous papers: UPSC archive.')
) AS p(exam_code, stage_code, version, effective_date, total_questions, total_marks,
       duration_minutes, negative_mark, marks_per_q, languages, source_url, notes)
  ON e.code = p.exam_code AND st.code = p.stage_code
ON CONFLICT (stage_id, version) DO UPDATE SET
  review_state = 'approved',
  notes = EXCLUDED.notes,
  source_url = EXCLUDED.source_url;

-- Sections
INSERT INTO public.gov_exam_sections (pattern_version_id, code, name, question_count, marks, sort_order)
SELECT pv.id, s.code, s.name, s.q, s.marks, s.sort_order
FROM public.gov_exam_pattern_versions pv
JOIN public.gov_exam_stages st ON st.id = pv.stage_id
JOIN public.gov_exams e ON e.id = st.exam_id
JOIN (VALUES
  ('SSC_CGL', 'TIER_I', 'reasoning', 'General Intelligence & Reasoning', 25, 50, 1),
  ('SSC_CGL', 'TIER_I', 'awareness', 'General Awareness', 25, 50, 2),
  ('SSC_CGL', 'TIER_I', 'quant', 'Quantitative Aptitude', 25, 50, 3),
  ('SSC_CGL', 'TIER_I', 'english', 'English Comprehension', 25, 50, 4),
  ('RRB_NTPC', 'CBT_1', 'maths', 'Mathematics', 30, 30, 1),
  ('RRB_NTPC', 'CBT_1', 'reasoning', 'General Intelligence & Reasoning', 30, 30, 2),
  ('RRB_NTPC', 'CBT_1', 'awareness', 'General Awareness', 40, 40, 3),
  ('IBPS_PO', 'PRELIMS', 'english', 'English Language', 30, 30, 1),
  ('IBPS_PO', 'PRELIMS', 'quant', 'Quantitative Aptitude', 35, 35, 2),
  ('IBPS_PO', 'PRELIMS', 'reasoning', 'Reasoning Ability', 35, 35, 3),
  ('UPSC_CSE_PRELIMS', 'GS_PAPER_I', 'gs', 'General Studies', 100, 200, 1)
) AS s(exam_code, stage_code, code, name, q, marks, sort_order)
  ON e.code = s.exam_code AND st.code = s.stage_code AND pv.version = '2024.1'
ON CONFLICT (pattern_version_id, code) DO NOTHING;

-- Syllabus versions (topic lists for blueprint soft constraints)
INSERT INTO public.gov_exam_syllabus_versions (
  exam_id, stage_id, version, effective_date, source_url, review_state, topics_json
)
SELECT e.id, st.id, '2024.1', '2024-01-01'::date, pv.source_url, 'approved',
  CASE e.code
    WHEN 'SSC_CGL' THEN '[
      {"section":"reasoning","topics":["analogy","classification","series","coding_decoding","syllogism","blood_relations","directions","seating"]},
      {"section":"awareness","topics":["history","geography","polity","economy","science","current_affairs"]},
      {"section":"quant","topics":["arithmetic","algebra","geometry","mensuration","data_interpretation","trigonometry"]},
      {"section":"english","topics":["grammar","vocabulary","comprehension","error_spotting","fillers"]}
    ]'::jsonb
    WHEN 'RRB_NTPC' THEN '[
      {"section":"maths","topics":["number_system","percentages","ratio","time_work","speed","algebra","geometry","di"]},
      {"section":"reasoning","topics":["series","analogy","coding","puzzles","syllogism","directions"]},
      {"section":"awareness","topics":["current_affairs","history","geography","polity","science","railways"]}
    ]'::jsonb
    WHEN 'IBPS_PO' THEN '[
      {"section":"english","topics":["rc","cloze","error","para_jumbles","vocab"]},
      {"section":"quant","topics":["simplification","di","arithmetic","quadratic","number_series"]},
      {"section":"reasoning","topics":["puzzles","seating","inequality","syllogism","coding","blood_relations"]}
    ]'::jsonb
    ELSE '[
      {"section":"gs","topics":["history","geography","polity","economy","environment","science_tech","current_affairs"]}
    ]'::jsonb
  END
FROM public.gov_exams e
JOIN public.gov_exam_stages st ON st.exam_id = e.id
JOIN public.gov_exam_pattern_versions pv ON pv.stage_id = st.id AND pv.version = '2024.1'
ON CONFLICT (stage_id, version) DO UPDATE SET
  review_state = 'approved',
  topics_json = EXCLUDED.topics_json;

-- Official source registry links (no file payloads)
INSERT INTO public.gov_official_sources (
  recruiting_body_id, exam_id, document_type, title, source_url,
  is_official, license_class, review_state, metadata
)
SELECT b.id, e.id, s.doc_type, s.title, s.url, true, 'official_public', 'approved',
       jsonb_build_object('note', 'Link-only registry entry. Verify live content on the official site.')
FROM public.gov_exams e
JOIN public.recruiting_bodies b ON b.id = e.recruiting_body_id
JOIN (VALUES
  ('SSC_CGL', 'notification', 'SSC official website / notifications', 'https://ssc.gov.in/'),
  ('SSC_CGL', 'syllabus', 'SSC CGL syllabus (verify current notice)', 'https://ssc.gov.in/'),
  ('RRB_NTPC', 'notification', 'RRB CEN notices & mock links', 'https://www.rrbcdg.gov.in/'),
  ('IBPS_PO', 'notification', 'IBPS notifications', 'https://www.ibps.in/'),
  ('UPSC_CSE_PRELIMS', 'previous_paper', 'UPSC previous question papers archive', 'https://upsc.gov.in/examinations/previous-question-papers'),
  ('UPSC_CSE_PRELIMS', 'syllabus', 'UPSC CSE notification / syllabus', 'https://upsc.gov.in/')
) AS s(exam_code, doc_type, title, url) ON e.code = s.exam_code
AND NOT EXISTS (
  SELECT 1 FROM public.gov_official_sources x
  WHERE x.exam_id = e.id AND x.document_type = s.doc_type AND x.source_url = s.url
);

COMMIT;
