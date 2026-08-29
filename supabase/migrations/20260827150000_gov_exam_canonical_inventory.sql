-- Canonical Government Exam question inventory — single source for availability + assembly.

CREATE OR REPLACE FUNCTION public.resolve_gov_exam_bank_type_keys(p_exam_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_legacy text;
  v_code text;
  v_name text;
  keys text[] := ARRAY[]::text[];
  mapped text;
BEGIN
  SELECT legacy_exam_type, code, name
  INTO v_legacy, v_code, v_name
  FROM gov_exams
  WHERE id = p_exam_id;

  IF NOT FOUND THEN
    RETURN keys;
  END IF;

  FOR mapped IN
    SELECT DISTINCT val FROM (
      SELECT trim(v_legacy) AS val WHERE v_legacy IS NOT NULL AND trim(v_legacy) <> ''
      UNION SELECT trim(v_code) WHERE v_code IS NOT NULL AND trim(v_code) <> ''
      UNION SELECT trim(v_name) WHERE v_name IS NOT NULL AND trim(v_name) <> ''
      UNION SELECT trim(alias) FROM gov_exam_aliases WHERE exam_id = p_exam_id AND trim(alias) <> ''
    ) raw
  LOOP
    keys := array_append(keys, mapped);
    -- Common registry → bank mappings (mirrors examTypeMap.ts)
    CASE upper(replace(mapped, ' ', '_'))
      WHEN 'SSC_CGL', 'SSC_CHSL' THEN keys := array_append(keys, 'SSC Exams (CGL/CHSL)');
      WHEN 'IBPS_PO' THEN keys := array_append(keys, 'Banking (IBPS/SBI/RBI)');
      WHEN 'UPSC', 'UPSC_CSE', 'UPSC_CSE_PRELIMS' THEN keys := array_append(keys, 'UPSC CSE');
      WHEN 'APPSC_GROUP', 'APPSC_GROUP2' THEN keys := array_append(keys, 'APPSC (Group 1/2/3/4)');
      WHEN 'TSPSC_GROUP' THEN keys := array_append(keys, 'TSPSC (Group 1/2/3/4)');
      WHEN 'RRB_NTPC' THEN keys := array_append(keys, 'RRB NTPC');
      WHEN 'JEE_MAIN' THEN keys := array_append(keys, 'JEE Main');
      WHEN 'NEET' THEN keys := array_append(keys, 'NEET UG');
      ELSE NULL;
    END CASE;
    CASE mapped
      WHEN 'SSC CGL' THEN keys := array_append(keys, 'SSC Exams (CGL/CHSL)');
      WHEN 'IBPS PO' THEN keys := array_append(keys, 'Banking (IBPS/SBI/RBI)');
      WHEN 'UPSC CSE' THEN keys := array_append(keys, 'UPSC CSE');
      WHEN 'APPSC' THEN keys := array_append(keys, 'APPSC (Group 1/2/3/4)');
      ELSE NULL;
    END CASE;
  END LOOP;

  SELECT array_agg(DISTINCT k) INTO keys FROM unnest(keys) k WHERE k IS NOT NULL AND trim(k) <> '';
  RETURN COALESCE(keys, ARRAY[]::text[]);
END;
$$;

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
      'inventory_version', 'gov_inventory_v1'
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
        p_source_policy = 'public_pyp'
        OR q.is_verified = true
        OR q.source_type IN ('official_verified', 'verified_public_source')
        OR q.source IN ('OFFICIAL_PYP', 'Previous Year Paper', 'PYP', 'previous_year')
      )
      AND (
        p_difficulty IS NULL OR q.difficulty = upper(p_difficulty)
      );
  ELSE
    SELECT count(*)::integer INTO cnt
    FROM questions q
    WHERE q.is_public = true
      AND q.publish_status = 'published'
      AND q.review_status = 'approved'
      AND q.exam_type = ANY (keys)
      AND (
        p_source_policy = 'public_pyp'
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
    'inventory_version', 'gov_inventory_v1'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_gov_exam_bank_type_keys(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_gov_exam_eligible_questions(uuid, text, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_gov_exam_bank_type_keys(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_gov_exam_eligible_questions(uuid, text, text[], text, text) TO service_role;

ALTER TABLE public.gov_paper_generation_jobs
  ADD COLUMN IF NOT EXISTS inventory_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS inventory_version text;
