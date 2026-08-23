import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";

export const CREATE_EXAM_PAPER_CREDIT_COST = AI_CREDIT_COSTS.create_mock_test;

export type BankReadinessStatus = "ready" | "partial" | "empty";

export type GovExamBankReadiness = {
  approvedPublicCount: number;
  publicCount: number;
  requiredQuestions: number;
  status: BankReadinessStatus;
  fullSimulationAvailable: boolean;
};

export type GovExamSearchResult = {
  resultType: "official_exam";
  examId: string;
  code: string;
  name: string;
  family: string;
  description: string | null;
  legacyExamType: string | null;
  recruitingBody: {
    id: string;
    code: string;
    name: string;
    officialUrl: string | null;
  } | null;
  aliases: string[];
  stages: Array<{ id: string; code: string; name: string; sort_order: number }>;
  stage?: { id: string; code: string; name: string; sort_order: number };
  pattern: {
    version: string;
    totalQuestions: number;
    totalMarks: number;
    durationMinutes: number;
    negativeMark: number;
    sourceUrl: string | null;
  } | null;
  languages: string[];
  lastVerified: string | null;
  bankReadiness?: GovExamBankReadiness | null;
  primaryActions: readonly string[];
};

export type GovExamSearchPagination = {
  page: number;
  pageSize: number;
  total: number;
};

export type GovExamSearchSuccess = {
  success: true;
  results: GovExamSearchResult[];
  disclaimer?: string;
  count: number;
  pagination: GovExamSearchPagination;
};

export type GovExamSearchFailure = {
  success: false;
  code: string;
  error?: string;
};

/**
 * Raw shape on the wire. `success` stays a plain boolean so the success and
 * failure branches can be narrowed from one payload instead of an intersection
 * of `true` and `false` (which collapses to `never`).
 */
type GovExamSearchWire = {
  success?: boolean;
  code?: string;
  error?: string;
  results?: GovExamSearchResult[];
  pagination?: GovExamSearchPagination;
  count?: number;
  disclaimer?: string;
};

export async function searchGovExams(
  params: {
    q?: string;
    family?: string;
    page?: number;
    pageSize?: number;
  },
  options?: { signal?: AbortSignal },
): Promise<GovExamSearchSuccess> {
  const payload = await fetchEdgeJson<GovExamSearchWire>(
    "search-exams",
    {
      q: params.q ?? "",
      family: params.family ?? "",
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    },
    { signal: options?.signal },
  );

  if (payload?.success === false) {
    const code = String(payload.code ?? "SEARCH_SERVICE_UNAVAILABLE");
    const err = new Error(
      payload.error ||
        (code === "SEARCH_SERVICE_UNAVAILABLE"
          ? "Exam search is temporarily unavailable. Please try again."
          : "Exam search failed."),
    ) as Error & { code?: string };
    err.code = code;
    throw err;
  }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  const pagination = payload?.pagination ?? {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    total: payload?.count ?? results.length,
  };

  return {
    success: true,
    results,
    disclaimer: payload?.disclaimer ?? "",
    count: payload?.count ?? results.length,
    pagination,
  };
}

export function isSearchUnavailableError(err: unknown): boolean {
  const code = String((err as { code?: string } | null)?.code ?? "");
  return (
    code === "SEARCH_SERVICE_UNAVAILABLE" ||
    code === "SERVICE_UNAVAILABLE" ||
    code === "PROVIDER_UNAVAILABLE" ||
    code === "SEARCH_UNAVAILABLE"
  );
}

export function mapGovSearchError(err: unknown): {
  code: "RATE_LIMITED" | "INVALID_QUERY" | "SEARCH_UNAVAILABLE" | "SEARCH_FAILED";
  message: string;
} {
  const code = String((err as { code?: string } | null)?.code ?? "");
  if (code === "RATE_LIMITED" || code === "RATE_LIMIT_BACKEND_UNAVAILABLE") {
    return {
      code: "RATE_LIMITED",
      message: "Too many searches. Please wait a moment and try again.",
    };
  }
  if (code === "INVALID_QUERY" || code === "VALIDATION_ERROR" || code === "BAD_REQUEST") {
    return {
      code: "INVALID_QUERY",
      message: "That search query isn't valid. Try a shorter keyword.",
    };
  }
  if (isSearchUnavailableError(err)) {
    return {
      code: "SEARCH_UNAVAILABLE",
      message: "Exam search is temporarily unavailable. Please try again.",
    };
  }
  return {
    code: "SEARCH_FAILED",
    message: "Exam search failed. Please try again.",
  };
}

export type CreateExamPaperRequest = {
  examId: string;
  stageId: string;
  examCycleId?: string | null;
  mode: "official_previous" | "generated_mock" | "custom_mock" | "adaptive";
  language: string;
  sourceYears?: number[];
  questionCount?: number;
  durationMinutes?: number;
  includeCurrentAffairs?: boolean;
  currentAffairsCutoff?: string;
  randomSeed?: string;
  idempotencyKey: string;
};

export type PaperJobResult = {
  jobId: string;
  status: string;
  progressStage?: string | null;
  mockTestId?: string | null;
  paperId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  error?: string;
  questionCount?: number;
  paperClass?: string;
  disclaimer?: string;
  patternVersion?: string;
  syllabusVersion?: string;
  creditsCharged?: number;
  available?: number;
  required?: number;
  requested?: number;
  balance?: number;
  idempotentReplay?: boolean;
};

export async function createExamPaper(
  body: CreateExamPaperRequest,
): Promise<PaperJobResult> {
  // Idempotency lives in the JSON body (create-exam-paper reads body.idempotencyKey).
  // Avoid custom headers here — x-idempotency-key is rejected by older edge CORS allowlists.
  return fetchEdgeJson("create-exam-paper", body, { timeoutMs: 45_000 });
}

export async function getPaperGenerationJob(jobId: string): Promise<PaperJobResult> {
  return fetchEdgeJson("get-paper-generation-job", { jobId });
}

export type TopicMasterySummary = {
  topic: string;
  mastery_score: number;
  state: string;
  evidence_count: number;
  updated_at?: string;
};

export type ExamReadinessSummary = {
  exam_id: string;
  stage_id: string;
  score: number;
  breakdown: {
    assessed_count?: number;
    mean_mastery?: number | null;
    weak_topics?: string[];
    recommended_action?: string;
    coverage?: number;
    [key: string]: unknown;
  };
  updated_at?: string;
};

export type PreparationPlanSummary = {
  exam_id: string;
  plan_json: {
    next_action?: string;
    focus_topics?: Array<{ topic: string; mastery_score: number; state: string }>;
    empty?: boolean;
    readiness_score?: number;
    [key: string]: unknown;
  };
  updated_at?: string;
};

export type PreviousYearPaper = {
  id: string;
  examId: string;
  stageId: string | null;
  year: number;
  cycle: string | null;
  tier: string | null;
  shift: string | null;
  language: string;
  durationMinutes: number | null;
  marking: Record<string, unknown> | null;
  questionCount: number | null;
  title: string | null;
  officialStatus: string;
  answerKeyStatus: string;
  reviewStatus: string;
  /** UI label: official registry provenance vs practice / unverified */
  label: "official" | "practice";
  source: {
    id: string;
    title: string;
    sourceUrl: string | null;
    documentType: string;
  } | null;
};

export async function listPreviousPapers(params: {
  examId?: string;
  examCode?: string;
  stageId?: string;
}): Promise<{
  examId: string;
  stageId?: string | null;
  count: number;
  papers: PreviousYearPaper[];
  bankEmpty: boolean;
  message?: string;
  disclaimer: string;
}> {
  return fetchEdgeJson("list-previous-papers", {
    examId: params.examId ?? "",
    examCode: params.examCode ?? "",
    stageId: params.stageId ?? "",
  });
}

export type GovExamDetails = {
  exam: {
    examId: string;
    code: string;
    name: string;
    family: string;
    description: string | null;
    legacyExamType: string | null;
    aliases: string[];
  };
  body: {
    id: string;
    code: string;
    name: string;
    officialUrl: string | null;
  } | null;
  stages: Array<{ id: string; code: string; name: string; sort_order: number }>;
  primaryStage: { id: string; code: string; name: string; sort_order: number } | null;
  activePatternSummary: {
    id: string;
    version: string;
    totalQuestions: number;
    totalMarks: number;
    durationMinutes: number;
    negativeMark: number;
    sourceUrl: string | null;
    effectiveDate: string | null;
    stageId: string;
  } | null;
  syllabusSummary: {
    id: string;
    version: string;
    effectiveDate: string | null;
    sourceUrl: string | null;
    topicCount: number;
    topicsPreview: unknown[];
  } | null;
  languages: string[];
  bankReadiness: GovExamBankReadiness;
  officialSources: Array<{
    id: string;
    title: string;
    sourceUrl: string | null;
    documentType: string;
    publicationDate: string | null;
    effectiveDate: string | null;
    language: string | null;
    isOfficial: boolean;
  }>;
  previousPaperCounts: { total: number; byYear: Record<string, number> };
  disclaimers: {
    affiliation: string;
    aiGenerated: string;
    customPractice: string;
  };
};

export async function getExamDetails(params: {
  examId?: string;
  code?: string;
}): Promise<GovExamDetails> {
  return fetchEdgeJson("get-exam-details", {
    examId: params.examId ?? "",
    code: params.code ?? "",
  });
}

export type GovExamPatternResponse = {
  examId: string;
  stageId: string;
  pattern: {
    id: string;
    version: string;
    effectiveDate: string | null;
    totalQuestions: number;
    totalMarks: number;
    durationMinutes: number;
    negativeMark: number;
    marksPerQuestion: number;
    languages: string[];
    sourceUrl: string | null;
    notes: string | null;
  };
  sections: Array<{
    id: string;
    code: string;
    name: string;
    questionCount: number;
    marks: number;
    sortOrder: number;
  }>;
};

export async function getExamPattern(params: {
  examId: string;
  stageId: string;
}): Promise<GovExamPatternResponse> {
  return fetchEdgeJson("get-exam-pattern", {
    examId: params.examId,
    stageId: params.stageId,
  });
}

export type GovExamSyllabusResponse = {
  examId: string;
  stageId: string;
  syllabus: {
    id: string;
    version: string;
    effectiveDate: string | null;
    sourceUrl: string | null;
    topicsJson: unknown;
  };
};

export async function getExamSyllabus(params: {
  examId: string;
  stageId: string;
}): Promise<GovExamSyllabusResponse> {
  return fetchEdgeJson("get-exam-syllabus", {
    examId: params.examId,
    stageId: params.stageId,
  });
}

export type PaperTrendsResponse = {
  examId: string;
  stageId: string;
  algorithmVersion: string;
  empty: boolean;
  message?: string;
  topics: Array<{
    topic: string;
    rawCount: number;
    weightedFrequency: number;
    years: number[];
  }>;
  sourceYearsUsed: number[];
  questionCount: number;
  patternShift: {
    material: boolean;
    changes: string[];
    historicalWeightFactor: number;
    versionsCompared: number;
  } | null;
  disclaimer: string;
};

export async function analyzePaperTrends(params: {
  examId: string;
  stageId?: string;
  sourceYears?: number[];
}): Promise<PaperTrendsResponse> {
  return fetchEdgeJson("analyze-paper-trends", {
    examId: params.examId,
    stageId: params.stageId ?? "",
    sourceYears: params.sourceYears ?? [],
  });
}

export async function cancelPaperGenerationJob(jobId: string): Promise<{
  jobId: string;
  status: string;
  cancelled: boolean;
  creditsRefunded: number;
  message?: string;
}> {
  return fetchEdgeJson("cancel-paper-generation-job", { jobId });
}

export async function reportQuestion(params: {
  questionId: string;
  reason?: string;
  notes?: string;
  paperId?: string;
}): Promise<{
  ok: boolean;
  incidentId: string;
  table: string;
  questionId: string;
  reason: string;
}> {
  return fetchEdgeJson("report-question", {
    questionId: params.questionId,
    reason: params.reason ?? "poor_quality",
    notes: params.notes ?? "",
    paperId: params.paperId ?? "",
  });
}

export type GenerateTopicPracticeRequest = {
  examId: string;
  stageId?: string | null;
  topics: string[];
  questionCount?: number;
  language?: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD" | null;
  idempotencyKey?: string;
};

export type TopicPracticeResult = PaperJobResult & {
  label?: string;
  topics?: string[];
  shrunk?: boolean;
};

export async function generateTopicPractice(
  params: GenerateTopicPracticeRequest,
): Promise<TopicPracticeResult> {
  const idempotencyKey = params.idempotencyKey ?? crypto.randomUUID();
  return fetchEdgeJson(
    "generate-topic-practice",
    {
      examId: params.examId,
      stageId: params.stageId ?? null,
      topics: params.topics,
      questionCount: params.questionCount ?? 10,
      language: params.language ?? "en",
      difficulty: params.difficulty ?? null,
      idempotencyKey,
    },
    { headers: { "Idempotency-Key": idempotencyKey }, timeoutMs: 180_000 },
  );
}
