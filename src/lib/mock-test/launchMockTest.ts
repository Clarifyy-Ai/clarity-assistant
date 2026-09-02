import { supabase } from "@/lib/supabase/client";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { ApiClientError } from "@/lib/api/apiClient";
import { formatGovExamOperationError } from "@/lib/gov-exam/examOperationErrors";
import { PLAYABLE_QUESTIONS_VIEW } from "@/lib/gov-exam/playableQuestions";
import { normalizeExamTypeForStorage, resolveExamConfigId } from "@/lib/mock-test/examTypes";

export interface MockTestLaunchConfig {
  exam_type: string;
  test_name: string;
  subjects?: string[];
  topics?: string[];
  source_types: string[];
  year_range?: { min: number; max: number } | null;
  difficulty_distribution: { EASY: number; MEDIUM: number; HARD: number };
  question_count: number;
  duration_minutes: number;
  marks_positive: number;
  marks_negative: number;
  randomize_order?: boolean;
  shuffle_options?: boolean;
  practice_mode?: boolean;
  allow_shortfall?: boolean;
  quick_drill?: boolean;
  allow_ai_fill?: boolean;
}

export interface LaunchMockTestResult {
  test_id: string;
  question_count: number;
  warning?: string;
  ai_generated_count?: number;
}

function errFromSelectPayload(payload: {
  error?: string;
  code?: string;
  available?: number;
  requested?: number;
  required?: number;
  question_ids?: string[];
}): ApiClientError {
  const available =
    typeof payload.available === "number"
      ? payload.available
      : Array.isArray(payload.question_ids)
        ? payload.question_ids.length
        : 0;
  return new ApiClientError({
    message: payload.error || "Not enough questions are available for this configuration.",
    status: 409,
    code: payload.code || "QUESTION_INVENTORY_INSUFFICIENT",
    details: {
      ...payload,
      available,
      requested: payload.requested ?? payload.required,
    },
  });
}

/** Launch a mock test: select questions from bank then create test record. */
export async function launchMockTest(
  config: MockTestLaunchConfig
): Promise<LaunchMockTestResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Session expired. Please log in again.");

  const normalizedConfig = {
    ...config,
    exam_type: normalizeExamTypeForStorage(config.exam_type) ?? config.exam_type,
    source_types:
      config.source_types.length > 0
        ? config.source_types
        : ["OFFICIAL_PYP"],
    subjects: config.subjects ?? [],
    topics: config.topics ?? [],
  };

  let selectData: {
    question_ids?: string[];
    count?: number;
    warning?: string;
    ai_generated_count?: number;
    gap_fill_failed?: boolean;
    error?: string;
  };
  try {
    selectData = await fetchEdgeJson<typeof selectData>(
      "select-test-questions",
      { config: normalizedConfig },
      { timeoutMs: 180_000 },
    );
  } catch (err) {
    throw new Error(formatGovExamOperationError(err));
  }

  if (selectData.error && (!selectData.question_ids || selectData.question_ids.length === 0)) {
    const mapped = formatGovExamOperationError(
      errFromSelectPayload(selectData),
    );
    throw new Error(mapped);
  }

  const questionIds = Array.isArray(selectData.question_ids)
    ? selectData.question_ids
    : [];

  if (questionIds.length === 0) {
    const hint = selectData.gap_fill_failed
      ? "Question bank is short — ask an admin to import more official papers."
      : "Upload questions via Admin → Seed Question Bank, or use Collect from public sources.";
    throw new Error(`No questions available for this paper. ${hint}`);
  }

  const isQuickDrill =
    Boolean(config.quick_drill) ||
    String(config.test_name ?? "").toLowerCase().includes("quick drill");

  if (isQuickDrill && questionIds.length !== config.question_count) {
    const mapped = formatGovExamOperationError(
      errFromSelectPayload({
        error: `Only ${questionIds.length} of ${config.question_count} questions are available after bank + AI fill.`,
        code: "QUESTION_INVENTORY_INSUFFICIENT",
        available: questionIds.length,
        requested: config.question_count,
        question_ids: questionIds,
      }),
    );
    throw new Error(mapped);
  }

  if (
    !config.practice_mode &&
    questionIds.length !== config.question_count &&
    questionIds.length < Math.min(20, config.question_count)
  ) {
    throw new Error(
      `Only ${questionIds.length} of ${config.question_count} questions could be prepared. Try again — generation can take a minute when the bank is short.`,
    );
  }

  const createData = await fetchEdgeJson<{ test_id: string }>("create-test", {
    test_name: config.test_name,
    config: normalizedConfig,
    question_ids: questionIds,
  });

  if (!createData.test_id) {
    throw new Error("Failed to create test session.");
  }

  return {
    test_id: createData.test_id,
    question_count: questionIds.length,
    warning: selectData.warning,
    ai_generated_count: selectData.ai_generated_count,
  };
}

/** Count public/PYP questions for an exam year (for paper readiness badges). */
export async function countQuestionsForPaper(
  examTypePaperValue: string,
  year: number,
  routeExamId?: string
): Promise<number> {
  const examType =
    normalizeExamTypeForStorage(routeExamId ?? resolveExamConfigId(examTypePaperValue)) ??
    examTypePaperValue;

  const { count, error } = await supabase
    .from(PLAYABLE_QUESTIONS_VIEW)
    .select("id", { count: "exact", head: true })
    .eq("exam_type", examType)
    .eq("source_year" as never, year as never)
    .eq("is_public", true);

  if (error) {
    console.warn("[countQuestionsForPaper]", error.message);
    return 0;
  }
  return count ?? 0;
}
