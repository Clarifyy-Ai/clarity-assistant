/**
 * Server-side eligible question inventory for Government Exam papers.
 * Count is approved (public + verified) bank items for the exam type keys.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { examBankTypeKeys } from "./examTypeMap.ts";

export type ExamInventoryInput = {
  exam: {
    code?: string | null;
    name?: string | null;
    legacy_exam_type?: string | null;
  };
  language?: string | null;
  topics?: string[] | null;
  difficulty?: "EASY" | "MEDIUM" | "HARD" | null;
  sourcePolicy?: "approved_public" | "public_pyp";
};

export type ExamInventoryResult = {
  available: number;
  examTypeKeys: string[];
};

const TOPIC_MATCH = (topics: string[]) =>
  topics
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);

export async function countEligibleGovQuestions(
  db: SupabaseClient,
  input: ExamInventoryInput,
): Promise<ExamInventoryResult> {
  const examTypeKeys = examBankTypeKeys({
    code: input.exam.code,
    name: input.exam.name,
    legacy_exam_type: input.exam.legacy_exam_type,
  });
  if (examTypeKeys.length === 0) {
    return { available: 0, examTypeKeys };
  }

  const topics = TOPIC_MATCH(Array.isArray(input.topics) ? input.topics : []);
  const needsRowScan = topics.length > 0 || Boolean(input.difficulty);

  if (!needsRowScan) {
    const { count, error } = await db
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("is_public", true)
      .eq("is_verified", true)
      .in("exam_type", examTypeKeys);
    if (error) throw new Error(error.message);
    return { available: count ?? 0, examTypeKeys };
  }

  let query = db
    .from("questions")
    .select("id, subject, topic, difficulty")
    .eq("is_public", true)
    .eq("is_verified", true)
    .in("exam_type", examTypeKeys)
    .limit(2000);
  if (input.difficulty) {
    query = query.eq("difficulty", input.difficulty);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  if (topics.length === 0) {
    return { available: (data ?? []).length, examTypeKeys };
  }

  const available = (data ?? []).filter((row) => {
    const subject = String(row.subject ?? "").trim().toLowerCase();
    const topic = String(row.topic ?? "").trim().toLowerCase();
    return topics.some((t) => subject.includes(t) || topic.includes(t) || t.includes(subject) || t.includes(topic));
  }).length;

  return { available, examTypeKeys };
}

export function inventoryInsufficientPayload(
  available: number,
  requested: number,
): {
  error: string;
  code: "QUESTION_INVENTORY_INSUFFICIENT";
  available: number;
  requested: number;
  required: number;
} {
  return {
    error: `Only ${available} approved questions are available for this configuration.`,
    code: "QUESTION_INVENTORY_INSUFFICIENT",
    available,
    requested,
    required: requested,
  };
}
