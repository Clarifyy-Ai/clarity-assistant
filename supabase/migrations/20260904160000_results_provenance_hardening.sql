-- Genuine results provenance: scorecard input snapshot, coding judge versions,
-- and session history that only surfaces completed scorecard evaluations.

ALTER TABLE public.scorecards
  ADD COLUMN IF NOT EXISTS evaluation_input_snapshot jsonb;

COMMENT ON COLUMN public.scorecards.evaluation_input_snapshot IS
  'Immutable-ish snapshot of inputs used for the latest evaluation (mirrors debrief pattern).';

ALTER TABLE public.coding_submissions
  ADD COLUMN IF NOT EXISTS judge_version text,
  ADD COLUMN IF NOT EXISTS case_set_checksum text;

COMMENT ON COLUMN public.coding_submissions.judge_version IS
  'Server judge/runner version that produced the score.';
COMMENT ON COLUMN public.coding_submissions.case_set_checksum IS
  'Checksum of test-case set used when scoring (provenance).';

CREATE OR REPLACE FUNCTION public.get_session_history(
  p_types text[] DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_score_state text DEFAULT NULL,
  p_debrief_state text DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_cursor text DEFAULT NULL,
  p_page_size int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
  v_sort text := lower(coalesce(nullif(btrim(p_sort), ''), 'newest'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_score_state text := lower(nullif(btrim(coalesce(p_score_state, '')), ''));
  v_debrief_state text := lower(nullif(btrim(coalesce(p_debrief_state, '')), ''));
  v_cursor_ts timestamptz;
  v_cursor_kind text;
  v_cursor_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_page jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_len int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_AUTHENTICATED',
      'message', 'Sign in to load session history.'
    );
  END IF;

  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    BEGIN
      v_cursor_ts := split_part(p_cursor, '|', 1)::timestamptz;
      v_cursor_kind := split_part(p_cursor, '|', 2);
      v_cursor_id := NULLIF(split_part(p_cursor, '|', 3), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'INVALID_CURSOR',
        'message', 'Pagination cursor is invalid.'
      );
    END;
  END IF;

  WITH interview AS (
    SELECT
      s.id AS session_id,
      s.id AS source_id,
      'interview'::text AS source_kind,
      s.user_id,
      CASE
        WHEN s.type = 'mock' THEN 'mock_interview'
        WHEN s.type IN ('live', 'rehearsal', 'warmup') THEN 'practice_coach'
        ELSE 'other_practice'
      END AS session_type,
      CASE
        WHEN s.type = 'live' THEN 'live_copilot'
        WHEN s.type = 'rehearsal' THEN 'rehearsal'
        WHEN s.type = 'warmup' THEN 'warmup'
        WHEN s.type = 'room' THEN 'room'
        ELSE NULL
      END AS session_subtype,
      COALESCE(NULLIF(btrim(s.title), ''), initcap(s.type::text) || ' session') AS title,
      NULLIF(btrim(s.title), '') AS role,
      NULL::text AS company,
      NULL::text AS exam_name,
      NULL::text AS assessment_name,
      CASE
        WHEN s.lifecycle_status = 'CANCELLED' THEN 'cancelled'
        WHEN s.lifecycle_status = 'EXPIRED' THEN 'expired'
        WHEN s.status = 'completed' OR s.lifecycle_status = 'COMPLETED' THEN 'completed'
        WHEN s.status = 'paused' THEN 'paused'
        WHEN s.status IN ('active', 'pending') THEN 'active'
        WHEN s.status = 'abandoned' THEN 'incomplete'
        ELSE 'incomplete'
      END AS status,
      COALESCE(s.lifecycle_status, s.status::text) AS source_status,
      s.started_at,
      COALESCE(s.updated_at, s.ended_at, s.started_at, s.created_at) AS last_activity_at,
      s.ended_at,
      s.duration_seconds,
      s.answers_generated::int AS answered_count,
      s.questions_asked AS total_question_count,
      -- Prefer completed scorecard only; never invent from sessions.overall_score.
      CASE
        WHEN sc.evaluation_status = 'completed' AND sc.overall_score IS NOT NULL
          THEN sc.overall_score
        ELSE NULL
      END AS score,
      100::numeric AS score_maximum,
      CASE
        WHEN sc.evaluation_status = 'completed' AND sc.overall_score IS NOT NULL
          THEN 'percent'
        ELSE NULL
      END AS score_unit,
      CASE
        WHEN sc.evaluation_status = 'completed' AND sc.overall_score IS NOT NULL
          THEN round(sc.overall_score)::text || '%'
        WHEN sc.evaluation_status IN ('processing', 'queued') THEN 'Processing'
        WHEN sc.evaluation_status IN ('failed_retryable', 'failed_permanent') THEN 'Failed'
        WHEN sc.evaluation_status = 'not_eligible' THEN COALESCE(NULLIF(btrim(sc.eligibility_reason), ''), 'Not eligible')
        ELSE NULL
      END AS result_label,
      CASE
        WHEN sd.id IS NOT NULL THEN 'available'
        WHEN s.type IN ('mock', 'live', 'rehearsal', 'warmup') AND s.status = 'completed' THEN 'not_requested'
        ELSE 'not_eligible'
      END AS debrief_status,
      sd.id AS debrief_id,
      '/app/sessions/' || s.id::text AS detail_route,
      CASE
        WHEN s.type = 'mock' THEN '/app/mock/session/' || s.id::text
        WHEN s.type = 'live' THEN '/app/live'
        ELSE '/app/sessions/' || s.id::text
      END AS source_route,
      s.created_at,
      s.updated_at
    FROM public.sessions s
    LEFT JOIN LATERAL (
      SELECT scx.overall_score, scx.evaluation_status, scx.eligibility_reason
      FROM public.scorecards scx
      WHERE scx.session_id = s.id AND scx.user_id = s.user_id
      ORDER BY scx.created_at DESC NULLS LAST
      LIMIT 1
    ) sc ON true
    LEFT JOIN LATERAL (
      SELECT d.id
      FROM public.session_debriefs d
      WHERE d.session_id = s.id AND d.user_id = s.user_id
      ORDER BY d.created_at DESC NULLS LAST
      LIMIT 1
    ) sd ON true
    WHERE s.user_id = v_uid
      AND s.deleted_at IS NULL
  ),
  exams AS (
    SELECT
      mt.id AS session_id,
      mt.id AS source_id,
      'mock_test'::text AS source_kind,
      mt.user_id,
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id')
          THEN 'assessment'
        ELSE 'government_exam'
      END AS session_type,
      NULL::text AS session_subtype,
      COALESCE(NULLIF(btrim(mt.test_name), ''), 'Exam attempt') AS title,
      NULL::text AS role,
      NULL::text AS company,
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id') THEN NULL
        ELSE NULLIF(btrim(mt.test_name), '')
      END AS exam_name,
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id')
          THEN NULLIF(btrim(mt.test_name), '')
        ELSE NULL
      END AS assessment_name,
      CASE upper(mt.status)
        WHEN 'DRAFT' THEN 'draft'
        WHEN 'IN_PROGRESS' THEN 'active'
        WHEN 'COMPLETED' THEN 'completed'
        WHEN 'ABANDONED' THEN 'incomplete'
        ELSE lower(mt.status)
      END AS status,
      mt.status AS source_status,
      mt.started_at,
      COALESCE(mt.submitted_at, mt.updated_at, mt.created_at) AS last_activity_at,
      mt.submitted_at AS ended_at,
      CASE
        WHEN mt.started_at IS NOT NULL AND mt.submitted_at IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (mt.submitted_at - mt.started_at))::int)
        WHEN mt.time_limit_minutes IS NOT NULL THEN mt.time_limit_minutes * 60
        ELSE NULL
      END AS duration_seconds,
      (
        SELECT COUNT(*)::int FROM public.test_responses tr
        WHERE tr.test_id = mt.id AND tr.user_id = mt.user_id AND tr.answered_at IS NOT NULL
      ) AS answered_count,
      COALESCE(cardinality(mt.question_ids), 0) AS total_question_count,
      COALESCE(ta.total_score, mt.overall_score) AS score,
      ta.max_score AS score_maximum,
      CASE
        WHEN COALESCE(ta.total_score, mt.overall_score) IS NULL THEN NULL
        WHEN ta.max_score IS NOT NULL THEN 'marks'
        ELSE 'percent'
      END AS score_unit,
      CASE
        WHEN COALESCE(ta.total_score, mt.overall_score) IS NULL THEN NULL
        WHEN ta.max_score IS NOT NULL
          THEN round(COALESCE(ta.total_score, mt.overall_score))::text || '/' || round(ta.max_score)::text
        ELSE round(COALESCE(ta.total_score, mt.overall_score))::text || '%'
      END AS result_label,
      'not_eligible'::text AS debrief_status,
      NULL::uuid AS debrief_id,
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id')
          THEN '/app/assessments/results/' || mt.id::text
        ELSE '/app/mock-test/results/' || mt.id::text
      END AS detail_route,
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id')
          THEN '/app/assessments/session/' || mt.id::text
        ELSE '/app/mock-test/session/' || mt.id::text
      END AS source_route,
      COALESCE(mt.created_at, mt.started_at, now()) AS created_at,
      COALESCE(mt.updated_at, mt.submitted_at, mt.created_at, now()) AS updated_at
    FROM public.mock_tests mt
    LEFT JOIN LATERAL (
      SELECT a.total_score, a.max_score
      FROM public.test_analyses a
      WHERE a.test_id = mt.id AND a.user_id = mt.user_id
      ORDER BY a.created_at DESC NULLS LAST
      LIMIT 1
    ) ta ON true
    WHERE mt.user_id = v_uid
  ),
  workspace AS (
    SELECT
      p.id AS session_id,
      p.id AS source_id,
      'practice_workspace'::text AS source_kind,
      p.user_id,
      'practice_workspace'::text AS session_type,
      NULL::text AS session_subtype,
      COALESCE(NULLIF(btrim(p.role), ''), initcap(p.interview_type) || ' practice') AS title,
      NULLIF(btrim(p.role), '') AS role,
      NULL::text AS company,
      NULL::text AS exam_name,
      NULL::text AS assessment_name,
      CASE p.status
        WHEN 'active' THEN 'active'
        WHEN 'completed' THEN 'completed'
        WHEN 'expired' THEN 'expired'
        ELSE 'incomplete'
      END AS status,
      p.status AS source_status,
      p.started_at,
      COALESCE(p.ended_at, p.started_at, p.created_at) AS last_activity_at,
      p.ended_at,
      NULLIF(p.elapsed_seconds, 0) AS duration_seconds,
      CASE
        WHEN jsonb_typeof(p.answers) = 'object' THEN (SELECT COUNT(*)::int FROM jsonb_object_keys(p.answers))
        WHEN jsonb_typeof(p.answers) = 'array' THEN jsonb_array_length(p.answers)
        ELSE NULL
      END AS answered_count,
      CASE
        WHEN jsonb_typeof(p.question_order) = 'array' THEN jsonb_array_length(p.question_order)
        ELSE NULL
      END AS total_question_count,
      CASE
        WHEN p.scores IS NULL THEN NULL
        WHEN jsonb_typeof(p.scores) = 'number' THEN (p.scores #>> '{}')::numeric
        WHEN p.scores ? 'overall' THEN NULLIF(p.scores->>'overall', '')::numeric
        ELSE NULL
      END AS score,
      100::numeric AS score_maximum,
      CASE
        WHEN p.scores IS NULL THEN NULL
        WHEN jsonb_typeof(p.scores) = 'number' OR (p.scores ? 'overall') THEN 'percent'
        ELSE NULL
      END AS score_unit,
      CASE
        WHEN p.scores IS NULL THEN NULL
        WHEN jsonb_typeof(p.scores) = 'number' THEN round((p.scores #>> '{}')::numeric)::text || '%'
        WHEN p.scores ? 'overall' AND NULLIF(p.scores->>'overall', '') IS NOT NULL
          THEN round((p.scores->>'overall')::numeric)::text || '%'
        ELSE NULL
      END AS result_label,
      'not_eligible'::text AS debrief_status,
      NULL::uuid AS debrief_id,
      '/app/practice-workspace?session=' || p.id::text AS detail_route,
      '/app/practice-workspace?session=' || p.id::text AS source_route,
      p.created_at,
      COALESCE(p.ended_at, p.created_at) AS updated_at
    FROM public.practice_workspace_sessions p
    WHERE p.user_id = v_uid
  ),
  coding AS (
    SELECT
      c.id AS session_id,
      c.id AS source_id,
      'coding_submission'::text AS source_kind,
      c.user_id,
      'coding_assessment'::text AS session_type,
      NULL::text AS session_subtype,
      COALESCE(NULLIF(btrim(q.title), ''), 'Coding submission') AS title,
      NULL::text AS role,
      NULL::text AS company,
      NULL::text AS exam_name,
      NULL::text AS assessment_name,
      CASE c.status
        WHEN 'scored' THEN 'completed'
        WHEN 'submitted' THEN 'submitted'
        WHEN 'pending_review' THEN 'evaluation_pending'
        WHEN 'rejected' THEN 'failed'
        WHEN 'limit_exceeded' THEN 'failed'
        ELSE 'submitted'
      END AS status,
      c.status AS source_status,
      c.submitted_at AS started_at,
      c.submitted_at AS last_activity_at,
      c.submitted_at AS ended_at,
      NULL::int AS duration_seconds,
      c.passed_tests AS answered_count,
      CASE
        WHEN c.passed_tests IS NULL AND c.failed_tests IS NULL THEN NULL
        ELSE COALESCE(c.passed_tests, 0) + COALESCE(c.failed_tests, 0)
      END AS total_question_count,
      c.score,
      100::numeric AS score_maximum,
      CASE
        WHEN c.passed_tests IS NOT NULL OR c.failed_tests IS NOT NULL THEN 'tests'
        WHEN c.score IS NOT NULL THEN 'percent'
        ELSE NULL
      END AS score_unit,
      CASE
        WHEN c.passed_tests IS NOT NULL OR c.failed_tests IS NOT NULL
          THEN COALESCE(c.passed_tests, 0)::text || '/' ||
               (COALESCE(c.passed_tests, 0) + COALESCE(c.failed_tests, 0))::text || ' tests'
        WHEN c.score IS NOT NULL THEN round(c.score)::text || '%'
        ELSE NULL
      END AS result_label,
      'not_eligible'::text AS debrief_status,
      NULL::uuid AS debrief_id,
      '/app/coding/' || c.question_id::text AS detail_route,
      '/app/coding/' || c.question_id::text AS source_route,
      c.submitted_at AS created_at,
      c.submitted_at AS updated_at
    FROM public.coding_submissions c
    LEFT JOIN public.coding_questions q ON q.id = c.question_id
    WHERE c.user_id = v_uid
  ),
  unified AS (
    SELECT * FROM interview
    UNION ALL SELECT * FROM exams
    UNION ALL SELECT * FROM workspace
    UNION ALL SELECT * FROM coding
  ),
  filtered AS (
    SELECT u.*
    FROM unified u
    WHERE (p_types IS NULL OR cardinality(p_types) = 0
           OR u.session_type = ANY (p_types)
           OR (u.session_subtype IS NOT NULL AND u.session_subtype = ANY (p_types)))
      AND (p_statuses IS NULL OR cardinality(p_statuses) = 0 OR u.status = ANY (p_statuses))
      AND (p_date_from IS NULL OR u.last_activity_at >= p_date_from)
      AND (p_date_to IS NULL OR u.last_activity_at <= p_date_to)
      AND (
        v_search IS NULL
        OR u.title ILIKE '%' || v_search || '%'
        OR coalesce(u.role, '') ILIKE '%' || v_search || '%'
        OR coalesce(u.company, '') ILIKE '%' || v_search || '%'
        OR coalesce(u.exam_name, '') ILIKE '%' || v_search || '%'
        OR coalesce(u.assessment_name, '') ILIKE '%' || v_search || '%'
        OR u.session_type ILIKE '%' || v_search || '%'
      )
      AND (
        v_score_state IS NULL OR v_score_state IN ('', 'all')
        OR (v_score_state = 'scored' AND u.score IS NOT NULL)
        OR (v_score_state = 'not_scored' AND u.score IS NULL)
      )
      AND (
        v_debrief_state IS NULL OR v_debrief_state IN ('', 'all')
        OR u.debrief_status = v_debrief_state
      )
      AND (
        v_cursor_ts IS NULL OR v_cursor_id IS NULL
        OR (
          CASE
            WHEN v_sort = 'oldest' THEN
              (u.last_activity_at > v_cursor_ts)
              OR (u.last_activity_at = v_cursor_ts AND u.source_kind > v_cursor_kind)
              OR (u.last_activity_at = v_cursor_ts AND u.source_kind = v_cursor_kind AND u.source_id > v_cursor_id)
            ELSE
              (u.last_activity_at < v_cursor_ts)
              OR (u.last_activity_at = v_cursor_ts AND u.source_kind > v_cursor_kind)
              OR (u.last_activity_at = v_cursor_ts AND u.source_kind = v_cursor_kind AND u.source_id > v_cursor_id)
          END
        )
      )
  ),
  ordered AS (
    SELECT
      session_id AS "sessionId",
      source_id AS "sourceId",
      source_kind AS "sourceKind",
      user_id AS "userId",
      session_type AS "sessionType",
      session_subtype AS "sessionSubtype",
      title,
      role,
      company,
      exam_name AS "examName",
      assessment_name AS "assessmentName",
      status,
      source_status AS "sourceStatus",
      started_at AS "startedAt",
      last_activity_at AS "lastActivityAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      answered_count AS "answeredCount",
      total_question_count AS "totalQuestionCount",
      score,
      score_maximum AS "scoreMaximum",
      score_unit AS "scoreUnit",
      result_label AS "resultLabel",
      debrief_status AS "debriefStatus",
      debrief_id AS "debriefId",
      detail_route AS "detailRoute",
      source_route AS "sourceRoute",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM filtered
    ORDER BY
      CASE WHEN v_sort = 'oldest' THEN last_activity_at END ASC NULLS LAST,
      CASE WHEN v_sort IN ('newest', 'highest_score', 'lowest_score', 'longest', 'shortest')
           OR v_sort IS NULL THEN last_activity_at END DESC NULLS LAST,
      CASE WHEN v_sort = 'highest_score' THEN score END DESC NULLS LAST,
      CASE WHEN v_sort = 'lowest_score' THEN score END ASC NULLS LAST,
      CASE WHEN v_sort = 'longest' THEN duration_seconds END DESC NULLS LAST,
      CASE WHEN v_sort = 'shortest' THEN duration_seconds END ASC NULLS LAST,
      source_kind ASC,
      source_id ASC
    LIMIT v_limit + 1
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
  INTO v_rows
  FROM ordered o;

  v_len := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb));
  IF v_len > v_limit THEN
    v_has_more := true;
    v_page := (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, ord)
      WHERE ord <= v_limit
    );
    v_last := v_page -> (v_limit - 1);
    v_next_cursor :=
      coalesce(v_last->>'lastActivityAt', '') || '|' ||
      coalesce(v_last->>'sourceKind', '') || '|' ||
      coalesce(v_last->>'sourceId', '');
  ELSE
    v_page := COALESCE(v_rows, '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'items', v_page,
    'nextCursor', v_next_cursor,
    'hasMore', v_has_more
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', false,
    'code', 'QUERY_FAILED',
    'message', 'We couldn’t load your session history.',
    'detail', SQLERRM
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_history(
  text[], text[], text, timestamptz, timestamptz, text, text, text, text, int
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_session_history(
  text[], text[], text, timestamptz, timestamptz, text, text, text, text, int
) TO authenticated;

COMMENT ON FUNCTION public.get_session_history IS
  'Owner-scoped Session History timeline. Interview scores require scorecards.evaluation_status = completed.';
