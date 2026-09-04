/**
 * Pure scoring derivations for government mock tests.
 * Used by `submit-test` edge function and client `TestResults` display helpers.
 */

/** Authoritative marks algorithm written to test_analyses.algorithm_version. */
export const MOCK_TEST_SCORE_ALGORITHM_VERSION = "mock_test_score_v2";

export type MockTestAnswerOutcome = "correct" | "wrong" | "unanswered";

export type MockTestScoringConfig = {
  marksPositive: number;
  marksNegative: number;
};

export type MockTestScoringInput = {
  outcomes: MockTestAnswerOutcome[];
  config: MockTestScoringConfig;
};

export type MockTestScoringResult = {
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  rawTotalScore: number;
  maxScore: number;
  /** What TestResults shows: Math.max(0, rawTotalScore) */
  displayTotalScore: number;
  accuracy: number;
  attemptPercentage: number;
};

export type MockTestQuestion = {
  id: string;
  questionType?: unknown;
  correctAnswer: unknown;
  marksPositive: number;
  marksNegative: number;
  subject?: string | null;
  topic?: string | null;
  difficulty?: string | null;
};

export type MockTestResponse = {
  questionId: string;
  userAnswer: unknown;
  isAttempted?: boolean | null;
  timeSpentSeconds?: number | null;
};

export type ScoredMockTestQuestion = {
  questionId: string;
  outcome: MockTestAnswerOutcome;
  isCorrect: boolean;
  isAttempted: boolean;
  score: number;
  positiveMarks: number;
  negativeMarks: number;
  subject: string;
  topic: string;
  difficulty: string;
  timeSpentSeconds: number;
};

export type MockTestBreakdown = {
  correct: number;
  wrong: number;
  attempted: number;
  total: number;
  accuracy: number;
  marks: number;
  avg_time: number;
  subject?: string;
};

export type AuthoritativeMockTestScore = MockTestScoringResult & {
  positiveMarks: number;
  negativeMarks: number;
  percentage: number;
  perQuestion: ScoredMockTestQuestion[];
  subjectBreakdown: Record<string, MockTestBreakdown>;
  topicBreakdown: Record<string, MockTestBreakdown>;
};

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function emptyAnswer(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normalizedArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean).sort();
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return normalizedArray(JSON.parse(trimmed));
    } catch {
      // Fall through to comma-separated input.
    }
  }
  return trimmed.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).sort();
}

export function answersMatch(questionType: unknown, actual: unknown, expected: unknown): boolean {
  const type = String(questionType ?? "SHORT_ANSWER").trim().toUpperCase();
  if (type === "MULTI_SELECT" || type === "MULTI-SELECT") {
    const left = normalizedArray(actual);
    const right = normalizedArray(expected);
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  if (type === "NUMERIC" || type === "NUMERICAL") {
    const left = Number(actual);
    const right = Number(expected);
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-6;
  }
  return String(actual ?? "").trim().toLowerCase() === String(expected ?? "").trim().toLowerCase();
}

/** Canonical per-question and aggregate scoring used by submission and displays. */
export function scoreMockTest(
  questions: MockTestQuestion[],
  responses: MockTestResponse[],
): AuthoritativeMockTestScore {
  const responseByQuestion = new Map(responses.map((response) => [response.questionId, response]));
  const perQuestion: ScoredMockTestQuestion[] = questions.map((question) => {
    const response = responseByQuestion.get(question.id);
    const attempted = Boolean(response?.isAttempted) && !emptyAnswer(response?.userAnswer);
    const correct = attempted && answersMatch(
      question.questionType,
      response?.userAnswer,
      question.correctAnswer,
    );
    const positive = Math.max(0, finiteNumber(question.marksPositive));
    const negative = Math.max(0, finiteNumber(question.marksNegative));
    return {
      questionId: question.id,
      outcome: !attempted ? "unanswered" : correct ? "correct" : "wrong",
      isCorrect: correct,
      isAttempted: attempted,
      score: !attempted ? 0 : correct ? positive : -negative,
      positiveMarks: correct ? positive : 0,
      negativeMarks: attempted && !correct ? negative : 0,
      subject: String(question.subject ?? "General").trim() || "General",
      topic: String(question.topic ?? "General").trim() || "General",
      difficulty: String(question.difficulty ?? "unknown"),
      timeSpentSeconds: Math.max(0, finiteNumber(response?.timeSpentSeconds)),
    };
  });

  const aggregate = deriveMockTestMetrics({
    outcomes: perQuestion.map((row) => row.outcome),
    config: { marksPositive: 0, marksNegative: 0 },
  });
  aggregate.rawTotalScore = perQuestion.reduce((sum, row) => sum + row.score, 0);
  aggregate.maxScore = questions.reduce(
    (sum, question) => sum + Math.max(0, finiteNumber(question.marksPositive)),
    0,
  );
  aggregate.displayTotalScore = clampMockTestDisplayScore(aggregate.rawTotalScore);

  const buildBreakdown = (
    keyOf: (row: ScoredMockTestQuestion) => string,
    includeSubject: boolean,
  ): Record<string, MockTestBreakdown> => {
    const output: Record<string, MockTestBreakdown & { timeTotal: number; timeCount: number }> = {};
    for (const row of perQuestion) {
      const key = keyOf(row);
      const current = output[key] ?? {
        correct: 0, wrong: 0, attempted: 0, total: 0, accuracy: 0,
        marks: 0, avg_time: 0, timeTotal: 0, timeCount: 0,
        ...(includeSubject ? { subject: row.subject } : {}),
      };
      current.total += 1;
      current.marks += row.score;
      if (row.isAttempted) current.attempted += 1;
      if (row.isCorrect) current.correct += 1;
      else if (row.isAttempted) current.wrong += 1;
      if (row.timeSpentSeconds > 0) {
        current.timeTotal += row.timeSpentSeconds;
        current.timeCount += 1;
      }
      output[key] = current;
    }
    return Object.fromEntries(Object.entries(output).map(([key, row]) => [key, {
      correct: row.correct,
      wrong: row.wrong,
      attempted: row.attempted,
      total: row.total,
      accuracy: computeMockTestAccuracy(row.correct, row.attempted),
      marks: row.marks,
      avg_time: row.timeCount ? Math.round(row.timeTotal / row.timeCount) : 0,
      ...(includeSubject ? { subject: row.subject } : {}),
    }]));
  };

  return {
    ...aggregate,
    positiveMarks: perQuestion.reduce((sum, row) => sum + row.positiveMarks, 0),
    negativeMarks: perQuestion.reduce((sum, row) => sum + row.negativeMarks, 0),
    percentage: aggregate.maxScore > 0
      ? Math.round((aggregate.rawTotalScore / aggregate.maxScore) * 10_000) / 100
      : 0,
    perQuestion,
    subjectBreakdown: buildBreakdown((row) => row.subject, false),
    topicBreakdown: buildBreakdown((row) => row.topic, true),
  };
}

export function computeMockTestAccuracy(correct: number, attempted: number): number {
  return attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
}

export function computeMockTestAttemptPercentage(
  attempted: number,
  totalQuestions: number,
): number {
  return totalQuestions > 0 ? Math.round((attempted / totalQuestions) * 100) : 0;
}

/** UI clamps negative raw totals to zero; backend stores the raw value. */
export function clampMockTestDisplayScore(rawTotalScore: number): number {
  return Math.max(0, rawTotalScore);
}

export function deriveMockTestMetrics(
  input: MockTestScoringInput,
): MockTestScoringResult {
  const { outcomes, config } = input;
  const totalQuestions = outcomes.length;

  let attempted = 0;
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  let rawTotalScore = 0;
  let maxScore = 0;

  for (const outcome of outcomes) {
    maxScore += config.marksPositive;

    if (outcome === "unanswered") {
      unanswered += 1;
      continue;
    }

    attempted += 1;
    if (outcome === "correct") {
      correct += 1;
      rawTotalScore += config.marksPositive;
    } else {
      incorrect += 1;
      rawTotalScore -= config.marksNegative;
    }
  }

  return {
    totalQuestions,
    attempted,
    correct,
    incorrect,
    unanswered,
    rawTotalScore,
    maxScore,
    displayTotalScore: clampMockTestDisplayScore(rawTotalScore),
    accuracy: computeMockTestAccuracy(correct, attempted),
    attemptPercentage: computeMockTestAttemptPercentage(attempted, totalQuestions),
  };
}
