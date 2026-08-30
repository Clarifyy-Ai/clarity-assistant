-- ONE State PSC pilot pack: APPSC Group-II Screening style.
-- Pattern/syllabus are versioned practice approximations from publicly documented structures.
-- Candidates must verify on the official Andhra Pradesh PSC site (psc.ap.gov.in).
-- Does NOT claim coverage of all state PSC exams.

BEGIN;

INSERT INTO public.recruiting_bodies (code, name, jurisdiction, official_url, disclaimer_note)
VALUES (
  'APPSC',
  'Andhra Pradesh Public Service Commission',
  'state',
  'https://psc.ap.gov.in/',
  'Independent practice registry entry. Verify notifications, syllabus, and scheme on psc.ap.gov.in.'
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
SELECT b.id,
       'APPSC_GROUP2',
       'APPSC Group-II Screening',
       'state_psc',
       'Screening-style objective practice pack aligned to APPSC Group-II patterns. Independent platform — verify the active notification and scheme on psc.ap.gov.in. Not affiliated with APPSC.',
       'APPSC (Group 1/2/3/4)',
       'approved',
       true
FROM public.recruiting_bodies b
WHERE b.code = 'APPSC'
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
  ('APPSC_GROUP2', 'APPSC'),
  ('APPSC_GROUP2', 'APPSC Group 2'),
  ('APPSC_GROUP2', 'APPSC Group-II'),
  ('APPSC_GROUP2', 'APPSC Group II'),
  ('APPSC_GROUP2', 'Andhra Pradesh PSC Group 2'),
  ('APPSC_GROUP2', 'APPSC Screening')
) AS a(code, alias) ON e.code = a.code
ON CONFLICT (exam_id, alias) DO NOTHING;

INSERT INTO public.gov_exam_stages (exam_id, code, name, sort_order)
SELECT e.id, 'SCREENING', 'Screening Test', 1
FROM public.gov_exams e
WHERE e.code = 'APPSC_GROUP2'
ON CONFLICT (exam_id, code) DO NOTHING;

INSERT INTO public.gov_exam_pattern_versions (
  exam_id, stage_id, version, effective_date,
  total_questions, total_marks, duration_minutes, negative_mark, marks_per_question,
  languages, source_url, review_state, notes
)
SELECT e.id, st.id, '2024.1', '2024-01-01'::date,
       150, 150, 150, 0.33, 1.0,
       ARRAY['en','te']::text[],
       'https://psc.ap.gov.in/',
       'approved',
       'Practice pattern approximating APPSC Group-II Screening (GS & Mental Ability style). Marks, duration, sections, and negative marking change by notification — verify on psc.ap.gov.in before relying on this structure.'
FROM public.gov_exams e
JOIN public.gov_exam_stages st ON st.exam_id = e.id AND st.code = 'SCREENING'
WHERE e.code = 'APPSC_GROUP2'
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
  ('gs_mental', 'General Studies & Mental Ability', 150, 150, 1)
) AS s(code, name, q, marks, sort_order)
  ON e.code = 'APPSC_GROUP2' AND st.code = 'SCREENING' AND pv.version = '2024.1'
ON CONFLICT (pattern_version_id, code) DO NOTHING;

INSERT INTO public.gov_exam_syllabus_versions (
  exam_id, stage_id, version, effective_date, source_url, review_state, topics_json
)
SELECT e.id, st.id, '2024.1', '2024-01-01'::date, 'https://psc.ap.gov.in/', 'approved',
'[
  {"section":"gs_mental","topics":[
    "indian_history","indian_geography","indian_polity","indian_economy",
    "science_tech","current_affairs","andhra_pradesh_gk",
    "mental_ability","reasoning","data_interpretation","quantitative_aptitude"
  ]}
]'::jsonb
FROM public.gov_exams e
JOIN public.gov_exam_stages st ON st.exam_id = e.id AND st.code = 'SCREENING'
WHERE e.code = 'APPSC_GROUP2'
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
         'Link-only registry entry. Confirm live notification, syllabus, and scheme on the official APPSC site.'
       )
FROM public.gov_exams e
JOIN public.recruiting_bodies b ON b.id = e.recruiting_body_id
JOIN (VALUES
  ('APPSC_GROUP2', 'notification', 'APPSC official website / notifications', 'https://psc.ap.gov.in/'),
  ('APPSC_GROUP2', 'syllabus', 'APPSC Group-II syllabus (verify current notice)', 'https://psc.ap.gov.in/')
) AS s(exam_code, doc_type, title, url) ON e.code = s.exam_code
AND NOT EXISTS (
  SELECT 1 FROM public.gov_official_sources x
  WHERE x.exam_id = e.id AND x.document_type = s.doc_type AND x.source_url = s.url
);

COMMIT;
