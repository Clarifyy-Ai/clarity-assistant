-- Backfill practice tag on live overlay sessions that are not linked to a scheduled interview.
-- Required for AI generation (generate-hint / generate-answer) on legacy rows missing tags.
-- Cast session_type enum to text before trim/lower.

UPDATE public.sessions
SET tags = (
  SELECT COALESCE(array_agg(DISTINCT t), '{}')
  FROM unnest(COALESCE(sessions.tags, '{}') || ARRAY['practice']::text[]) AS t
)
WHERE lower(btrim(type::text)) = 'live'
  AND interview_id IS NULL
  AND NOT (
    COALESCE(tags, '{}') @> ARRAY['practice']::text[]
    OR COALESCE(tags, '{}') @> ARRAY['rehearsal']::text[]
  );
