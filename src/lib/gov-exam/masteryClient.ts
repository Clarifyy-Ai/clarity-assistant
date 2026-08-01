import { supabase } from "@/lib/supabase/client";
import type {
  ExamReadinessSummary,
  PreparationPlanSummary,
  TopicMasterySummary,
} from "@/lib/gov-exam/api";

/** Untyped accessor — mastery tables are not yet in generated Database types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

export async function fetchTopicMasteryForExam(
  userId: string,
  examId: string,
): Promise<TopicMasterySummary[]> {
  const { data, error } = await db()
    .from("topic_mastery")
    .select("topic, mastery_score, state, evidence_count, updated_at")
    .eq("user_id", userId)
    .eq("exam_id", examId)
    .order("mastery_score", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TopicMasterySummary[];
}

export async function fetchExamReadiness(
  userId: string,
  examId: string,
  stageId?: string | null,
): Promise<ExamReadinessSummary | null> {
  let q = db()
    .from("exam_readiness")
    .select("exam_id, stage_id, score, breakdown, updated_at")
    .eq("user_id", userId)
    .eq("exam_id", examId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (stageId) q = q.eq("stage_id", stageId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data as ExamReadinessSummary | null) ?? null;
}

export async function fetchPreparationPlan(
  userId: string,
  examId: string,
): Promise<PreparationPlanSummary | null> {
  const { data, error } = await db()
    .from("preparation_plans")
    .select("exam_id, plan_json, updated_at")
    .eq("user_id", userId)
    .eq("exam_id", examId)
    .maybeSingle();
  if (error) throw error;
  return (data as PreparationPlanSummary | null) ?? null;
}

/** Latest readiness across any exam for hub empty-or-summary card. */
export async function fetchLatestExamReadiness(
  userId: string,
): Promise<ExamReadinessSummary | null> {
  const { data, error } = await db()
    .from("exam_readiness")
    .select("exam_id, stage_id, score, breakdown, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ExamReadinessSummary | null) ?? null;
}

export async function fetchMasteryForExamIds(
  userId: string,
  examIds: string[],
): Promise<TopicMasterySummary[]> {
  if (examIds.length === 0) return [];
  const { data, error } = await db()
    .from("topic_mastery")
    .select("topic, mastery_score, state, evidence_count, updated_at, exam_id")
    .eq("user_id", userId)
    .in("exam_id", examIds)
    .gt("evidence_count", 0)
    .order("mastery_score", { ascending: true })
    .limit(40);
  if (error) throw error;
  return (data ?? []) as TopicMasterySummary[];
}
