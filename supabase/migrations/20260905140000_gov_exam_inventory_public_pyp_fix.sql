-- Fix public_pyp inventory: remove blanket OR that counted every approved question.

CREATE OR REPLACE FUNCTION public.count_gov_exam_eligible_questions(
  p_exam_id uuid,
  p_language text DEFAULT 'en',
  p_topics text[] DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_source_policy text DEFAULT 'approved_bank'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  keys text[];
  cnt integer := 0;
  topic_needles text[];
BEGIN
  keys := public.resolve_gov_exam_bank_type_keys(p_exam_id);
  IF keys IS NULL OR array_length(keys, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'available', 0,
      'exam_type_keys', '[]'::jsonb,
      'inventory_version', 'gov_inventory_v2'
    );
  END IF;

  topic_needles := (
    SELECT array_agg(lower(trim(t)))
    FROM unnest(COALESCE(p_topics, ARRAY[]::text[])) t
    WHERE trim(t) <> ''
    LIMIT 20
  );

  IF topic_needles IS NULL AND p_difficulty IS NULL THEN
    SELECT count(*)::integer INTO cnt
    FROM questions q
    WHERE q.is_public = true
      AND q.publish_status = 'published'
      AND q.review_status = 'approved'
      AND q.exam_type = ANY (keys)
      AND (
        p_source_policy <> 'public_pyp'
        OR q.is_verified = true
        OR q.source_type IN ('official_verified', 'verified_public_source')
        OR q.source IN ('OFFICIAL_PYP', 'Previous Year Paper', 'PYP', 'previous_year')
      )
      AND (p_difficulty IS NULL OR q.difficulty = upper(p_difficulty));
  ELSE
    SELECT count(*)::integer INTO cnt
    FROM questions q
    WHERE q.is_public = true
      AND q.publish_status = 'published'
      AND q.review_status = 'approved'
      AND q.exam_type = ANY (keys)
      AND (
        p_source_policy <> 'public_pyp'
        OR q.is_verified = true
        OR q.source_type IN ('official_verified', 'verified_public_source')
        OR q.source IN ('OFFICIAL_PYP', 'Previous Year Paper', 'PYP', 'previous_year')
      )
      AND (p_difficulty IS NULL OR q.difficulty = upper(p_difficulty))
      AND (
        topic_needles IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(topic_needles) needle
          WHERE lower(coalesce(q.subject, '')) LIKE '%' || needle || '%'
             OR lower(coalesce(q.topic, '')) LIKE '%' || needle || '%'
             OR needle LIKE '%' || lower(coalesce(q.subject, '')) || '%'
             OR needle LIKE '%' || lower(coalesce(q.topic, '')) || '%'
        )
      );
  END IF;

  RETURN jsonb_build_object(
    'available', COALESCE(cnt, 0),
    'exam_type_keys', to_jsonb(keys),
    'inventory_version', 'gov_inventory_v2'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_gov_exam_eligible_questions(uuid, text, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_gov_exam_eligible_questions(uuid, text, text[], text, text) TO service_role;
