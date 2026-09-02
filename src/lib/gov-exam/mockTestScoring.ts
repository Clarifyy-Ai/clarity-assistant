/**
 * Client re-export of shared mock-test scoring formulas.
 * Canonical implementation: `supabase/functions/_shared/mockTestScoring.ts`
 */

export {
  computeMockTestAccuracy,
  computeMockTestAttemptPercentage,
  clampMockTestDisplayScore,
  deriveMockTestMetrics,
  answersMatch,
  scoreMockTest,
} from "../../../supabase/functions/_shared/mockTestScoring.ts";

export type {
  MockTestAnswerOutcome,
  MockTestScoringConfig,
  MockTestScoringInput,
  MockTestScoringResult,
  MockTestQuestion,
  MockTestResponse,
  ScoredMockTestQuestion,
  MockTestBreakdown,
  AuthoritativeMockTestScore,
} from "../../../supabase/functions/_shared/mockTestScoring.ts";
