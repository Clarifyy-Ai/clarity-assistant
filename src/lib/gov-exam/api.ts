import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";

/** Typeahead budget — must include auth/session probe, not only the HTTP round-trip. */
export const GOV_SEARCH_TIMEOUT_MS = 12_000;

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
  /** Optional short display name from the registry. */
  shortName?: string | null;
  family: string;
  /** State / category code when the exam is jurisdiction-scoped. */
  stateCode?: string | null;
  jurisdiction?: string | null;
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
  /** ISO date/time when the exam pattern was last verified (legacy alias). */
  lastVerified: string | null;
  /** Preferred verification timestamp when the API provides it. */
  verifiedAt?: string | null;
  bankReadiness?: GovExamBankReadiness | null;
  primaryActions: readonly string[];
};

export type GovExamSearchPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages?: number;
  hasMore: boolean;
  nextCursor: string | null;
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
  message?: string;
  correlation_id?: string;
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
  message?: string;
  correlation_id?: string;
  results?: GovExamSearchResult[];
  pagination?: Partial<GovExamSearchPagination> & {
    page?: number;
    pageSize?: number;
    total?: number;
  };
  count?: number;
  disclaimer?: string;
};

export async function searchGovExams(
  params: {
    q?: string;
    family?: string;
    page?: number;
    pageSize?: number;
    cursor?: string | null;
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
      cursor: params.cursor ?? undefined,
    },
    { signal: options?.signal, timeoutMs: GOV_SEARCH_TIMEOUT_MS },
  );

  if (payload?.success === false) {
    const code = String(payload.code ?? "SERVICE_UNAVAILABLE");
    const err = new Error(
      payload.message ||
        payload.error ||
        (code === "SERVICE_UNAVAILABLE" || code === "SEARCH_SERVICE_UNAVAILABLE"
          ? "Exam search is temporarily unavailable."
          : "Exam search failed."),
    ) as Error & { code?: string; correlation_id?: string };
    err.code = code;
    err.correlation_id = payload.correlation_id;
    throw err;
  }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  const page = payload?.pagination?.page ?? params.page ?? 1;
  const pageSize = payload?.pagination?.pageSize ?? params.pageSize ?? 20;
  const total = payload?.pagination?.total ?? payload?.count ?? results.length;
  const hasMore =
    typeof payload?.pagination?.hasMore === "boolean"
      ? payload.pagination.hasMore
      : page * pageSize < total;
  const nextCursor =
    payload?.pagination?.nextCursor !== undefined
      ? payload.pagination.nextCursor
      : hasMore
        ? `p${page + 1}`
        : null;

  const pagination: GovExamSearchPagination = {
    page,
    pageSize,
    total,
    totalPages: payload?.pagination?.totalPages,
    hasMore,
    nextCursor,
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
  const code = String((err as { code?: string } | null)?.code ?? "").toUpperCase();
  const status = (err as { status?: number } | null)?.status;
  return (
    code === "SEARCH_SERVICE_UNAVAILABLE" ||
    code === "SERVICE_UNAVAILABLE" ||
    code === "PROVIDER_UNAVAILABLE" ||
    code === "SEARCH_UNAVAILABLE" ||
    code === "BAD_GATEWAY" ||
    status === 502 ||
    status === 503
  );
}

export type GovSearchErrorCode =
  | "RATE_LIMITED"
  | "INVALID_QUERY"
  | "SEARCH_UNAVAILABLE"
  | "SEARCH_FAILED"
  | "SEARCH_TIMEOUT"
  | "AUTH_REQUIRED";

export function mapGovSearchError(err: unknown): {
  code: GovSearchErrorCode;
  message: string;
} {
  const code = String(
    (err as { code?: string } | null)?.code ??
      (err instanceof Error && "code" in err
        ? (err as Error & { code?: string }).code
        : "") ??
      "",
  ).toUpperCase();
  const status = (err as { status?: number } | null)?.status;
  if (code === "RATE_LIMITED" || status === 429) {
    return {
      code: "RATE_LIMITED",
      message: "Too many searches. Please wait a moment and try again.",
    };
  }
  if (
    status === 401 ||
    code === "AUTH_REQUIRED" ||
    code === "AUTH_EXPIRED" ||
    code === "AUTH_INVALID" ||
    code === "UNAUTHORIZED"
  ) {
    return {
      code: "AUTH_REQUIRED",
      message: "Sign in to search exams.",
    };
  }
  // Rate-limit RPC outage used to be mapped as "Too many searches" (false throttle).
  if (code === "RATE_LIMIT_BACKEND_UNAVAILABLE") {
    return {
      code: "SEARCH_UNAVAILABLE",
      message: "Exam search is temporarily unavailable. Please try again.",
    };
  }
  if (code === "INVALID_QUERY" || code === "VALIDATION_ERROR" || code === "BAD_REQUEST") {
    return {
      code: "INVALID_QUERY",
      message: "That search query isn't valid. Try a shorter keyword.",
    };
  }
  if (
    isSearchUnavailableError(err) ||
    status === 502 ||
    status === 503 ||
    code === "SERVICE_UNAVAILABLE" ||
    code === "SEARCH_SERVICE_UNAVAILABLE"
  ) {
    return {
      code: "SEARCH_UNAVAILABLE",
      message: "Exam search is temporarily unavailable. Please try again.",
    };
  }
  const msg = err instanceof Error ? err.message : "";
  if (code === "SEARCH_TIMEOUT" || /timed out|timeout/i.test(msg)) {
    return {
      code: "SEARCH_TIMEOUT",
      message: "Search timed out. Please try again.",
    };
  }
  if (status === 500 || status === 504 || code === "SEARCH_FAILED") {
    return {
      code: "SEARCH_FAILED",
      message: "Exam search failed. Please try again.",
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
  /** auto (default) | edge | python — server picks runtime when auto. */
  generator?: "auto" | "edge" | "python";
  /** Snapshot id from check-exam-paper-availability (correlation id). */
  availabilitySnapshotId?: string;
  generationConfig?: {
    examId: string;
    stageId: string;
    basis: string;
    language: string;
    durationMinutes: number;
    questionCount: number;
    topics?: string[];
    difficulty?: string;
  };
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
  /** Present when the client poll window ended while the durable job is still running. */
  progressPercent?: number | null;
  startedAt?: string | null;
  createdAt?: string | null;
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

export async function startExamAttempt(attemptId: string): Promise<{
  attemptId: string;
  status: string;
  startedAt: string | null;
  expiresAt: string | null;
  idempotentReplay?: boolean;
}> {
  const started = await startExam(attemptId);
  return {
    attemptId,
    status: started.status,
    startedAt: started.startedAt,
    expiresAt: started.expiresAt,
    idempotentReplay: started.alreadyStarted,
  };
}

export async function saveAttemptAnswers(input: {
  attemptId: string;
  answers: Array<{
    questionId: string;
    answer: string | null;
    markedForReview: boolean;
    timeSpentSeconds: number;
    version: number;
  }>;
}): Promise<{
  attemptId: string;
  saved: number;
  staleQuestionIds: string[];
  nextVersions: Record<string, number>;
}> {
  return fetchEdgeJson("save-attempt-answer", input);
}

/** Owner kick so a queued job can be claimed/assembled if Python did not finish. */
export async function processPaperGenerationJob(jobId: string): Promise<PaperJobResult> {
  return fetchEdgeJson("process-paper-generation-job", { jobId }, { timeoutMs: 60_000 });
}

export type StartExamResult = {
  success: boolean;
  alreadyStarted?: boolean;
  startedAt: string;
  expiresAt: string | null;
  status: string;
  attemptPhase?: string;
};

export async function startExam(testId: string): Promise<StartExamResult> {
  return fetchEdgeJson("start-exam", { testId });
}

export type SaveTestAnswerInput = {
  questionId: string;
  userAnswer: string | null;
  isAttempted: boolean;
  isMarkedReview: boolean;
  timeSpentSeconds: number;
  clientUpdatedAt: string;
  version?: number;
};

export async function saveTestAnswers(
  testId: string,
  answers: SaveTestAnswerInput[],
): Promise<{
  success: boolean;
  savedCount: number;
  staleQuestionIds: string[];
  nextVersions: Record<string, number>;
}> {
  return fetchEdgeJson("save-test-answer", { testId, answers });
}

export type PauseResumeResult = {
  success: boolean;
  attemptPhase?: string;
  pausedAt?: string | null;
  expiresAt?: string | null;
  totalPausedMs?: number;
  startedAt?: string | null;
  alreadyPaused?: boolean;
  alreadyActive?: boolean;
};

export async function pauseTest(testId: string): Promise<PauseResumeResult> {
  return fetchEdgeJson("pause-test", { testId });
}

export async function resumeTest(testId: string): Promise<PauseResumeResult> {
  return fetchEdgeJson("resume-test", { testId });
}

export type AssessmentAvailabilityItem = {
  success?: boolean;
  template_id?: string;
  template_slug?: string;
  template_title?: string;
  requested?: number;
  available?: number;
  requested_count?: number;
  available_count?: number;
  shortage?: number;
  attempts_used?: number;
  max_attempts?: number | null;
  resumable_test_id?: string | null;
  startable?: boolean;
  code?: string | null;
  retryable?: boolean;
};

export async function checkAssessmentAvailability(
  templateIds: string[],
): Promise<AssessmentAvailabilityItem[]> {
  if (templateIds.length === 0) return [];
  const result = await fetchEdgeJson<{
    items?: AssessmentAvailabilityItem[];
    template_id?: string;
    startable?: boolean;
  } & AssessmentAvailabilityItem>("check-assessment-availability", {
    template_ids: templateIds,
  });
  if (Array.isArray(result.items)) return result.items;
  if (result.template_id) return [result];
  return [];
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
    shortName?: string | null;
    family: string;
    stateCode?: string | null;
    jurisdiction?: string | null;
    description: string | null;
    legacyExamType: string | null;
    aliases: string[];
    verifiedAt?: string | null;
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

export type ExamPaperAvailability = {
  success: true;
  examId: string;
  stageId: string;
  language: string;
  mode: string;
  requested: number;
  eligible?: number;
  available: number;
  missing: number;
  sourceCounts?: {
    official_verified: number;
    verified_public: number;
    approved_bank: number;
    generated_practice: number;
  };
  allowedFallback?: boolean;
  durationMinutes?: number | null;
  inventoryClass?: "official_pyq" | "approved_practice";
  inventorySource?: "canonical_rpc" | "python_authoritative";
  /** Shared with create-exam-paper so Review and Generate cite the same preflight. */
  availabilitySnapshotId?: string;
  correlationId?: string;
  /** Availability is a read-only preflight and never charges credits. */
  billable?: false;
  creditCost?: 0;
  creditsCharged?: 0;
  fullMockAllowed: boolean;
  customPracticeMax: number;
  aiFillAllowed: boolean;
  blocked: boolean;
  blockCode: string | null;
  message: string;
  generationPlan?: {
    kind: string;
    generator: string;
    bankQuestions: number;
    aiQuestions: number;
    deterministicQuestions?: number;
    requested: number;
    paperClass: string;
  };
  pattern?: {
    totalQuestions: number;
    totalMarks: number;
    durationMinutes: number;
    negativeMark: number;
    languages: string[];
  };
};

export async function checkExamPaperAvailability(params: {
  examId: string;
  stageId: string;
  mode?: "official_previous" | "generated_mock" | "custom_mock" | "adaptive";
  language?: string;
  questionCount?: number;
  durationMinutes?: number;
  topics?: string[];
  difficulty?: "EASY" | "MEDIUM" | "HARD" | null;
  generator?: "auto" | "edge" | "python";
}): Promise<ExamPaperAvailability> {
  return fetchEdgeJson("check-exam-paper-availability", {
    examId: params.examId,
    stageId: params.stageId,
    mode: params.mode ?? "custom_mock",
    language: params.language ?? "en",
    questionCount: params.questionCount,
    durationMinutes: params.durationMinutes,
    topics: params.topics ?? [],
    difficulty: params.difficulty ?? null,
    generator: params.generator,
  });
}

export async function requestGovExam(params: {
  queryText: string;
  notes?: string;
}): Promise<{ id: string }> {
  const { supabase } = await import("@/lib/supabase/client");
  const queryText = params.queryText.trim().slice(0, 200);
  if (queryText.length < 2) {
    throw new Error("Enter at least 2 characters to request an exam.");
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error("Sign in to request an exam.");
  }
  const { data, error } = await supabase
    .from("gov_exam_requests")
    .insert({
      user_id: userData.user.id,
      query_text: queryText,
      notes: params.notes?.trim().slice(0, 1000) ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("Request was not saved.");
  return { id: data.id };
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
