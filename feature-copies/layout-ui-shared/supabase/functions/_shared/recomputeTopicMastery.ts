/**
 * Persist mastery / readiness / prep plan after a scored attempt.
 * Called from submit-test (best-effort) and recompute-topic-mastery.
 */
import {
  applyBatchToMastery,
  buildPreparationPlan,
  computeExamReadiness,
  type AttemptSignal,
  type MasteryState,
  type TopicMasteryRow,
} from "./masteryEngine.ts";

type ServiceDb = {
  from: (table: string) => any;
};

export type TopicAttemptGroup = {
  topic: string;
  attempts: AttemptSignal[];
};

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    ? s
    : null;
}

export async function recomputeTopicMasteryFromAttempt(
  db: ServiceDb,
  params: {
    userId: string;
    examId: string;
    stageId?: string | null;
    topicAttempts: TopicAttemptGroup[];
    syllabusTopicCount?: number | null;
  },
): Promise<{
  updatedTopics: number;
  readinessScore: number | null;
}> {
  const examId = uuidOrNull(params.examId);
  if (!examId || params.topicAttempts.length === 0) {
    return { updatedTopics: 0, readinessScore: null };
  }

  const topics = [...new Set(params.topicAttempts.map((t) => t.topic).filter(Boolean))];
  const { data: existingRows } = await db
    .from("topic_mastery")
    .select("topic, mastery_score, state, evidence_count")
    .eq("user_id", params.userId)
    .eq("exam_id", examId)
    .in("topic", topics);

  const byTopic = new Map<string, TopicMasteryRow>();
  for (const row of existingRows ?? []) {
    byTopic.set(String(row.topic), {
      topic: String(row.topic),
      mastery_score: Number(row.mastery_score) || 0,
      state: (row.state as MasteryState) || "not_assessed",
      evidence_count: Number(row.evidence_count) || 0,
    });
  }

  const upserts: Array<{
    user_id: string;
    exam_id: string;
    topic: string;
    mastery_score: number;
    state: MasteryState;
    evidence_count: number;
    updated_at: string;
  }> = [];

  const now = new Date().toISOString();
  for (const group of params.topicAttempts) {
    if (!group.topic || group.attempts.length === 0) continue;
    const next = applyBatchToMastery(
      byTopic.get(group.topic) ?? {
        topic: group.topic,
        mastery_score: 0,
        state: "not_assessed",
        evidence_count: 0,
      },
      group.attempts,
    );
    byTopic.set(group.topic, { ...next, topic: group.topic });
    upserts.push({
      user_id: params.userId,
      exam_id: examId,
      topic: group.topic,
      mastery_score: Math.round(next.mastery_score * 10000) / 10000,
      state: next.state,
      evidence_count: next.evidence_count,
      updated_at: now,
    });
  }

  if (upserts.length > 0) {
    const { error } = await db.from("topic_mastery").upsert(upserts, {
      onConflict: "user_id,exam_id,topic",
    });
    if (error) throw error;
  }

  const { data: allRows } = await db
    .from("topic_mastery")
    .select("topic, mastery_score, state, evidence_count")
    .eq("user_id", params.userId)
    .eq("exam_id", examId);

  const masteryRows: TopicMasteryRow[] = (allRows ?? []).map((row: {
    topic: string;
    mastery_score: number;
    state: string;
    evidence_count: number;
  }) => ({
    topic: String(row.topic),
    mastery_score: Number(row.mastery_score) || 0,
    state: (row.state as MasteryState) || "not_assessed",
    evidence_count: Number(row.evidence_count) || 0,
  }));

  const readiness = computeExamReadiness(masteryRows, params.syllabusTopicCount);
  const stageId = uuidOrNull(params.stageId ?? null);

  if (stageId) {
    await db.from("exam_readiness").upsert(
      {
        user_id: params.userId,
        exam_id: examId,
        stage_id: stageId,
        score: readiness.score,
        breakdown: readiness.breakdown,
        updated_at: now,
      },
      { onConflict: "user_id,exam_id,stage_id" },
    );
  }

  const plan = buildPreparationPlan(masteryRows, readiness);
  await db.from("preparation_plans").upsert(
    {
      user_id: params.userId,
      exam_id: examId,
      plan_json: plan,
      updated_at: now,
    },
    { onConflict: "user_id,exam_id" },
  );

  return {
    updatedTopics: upserts.length,
    readinessScore: readiness.score,
  };
}
