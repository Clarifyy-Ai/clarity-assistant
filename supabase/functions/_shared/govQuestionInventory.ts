/**
 * Server-side eligible question inventory for Government Exam papers.
 * Uses canonical DB RPC — same policy as paper assembly.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { examBankTypeKeys } from "./examTypeMap.ts";

export type ExamInventoryInput = {
  examId?: string | null;
  exam: {
    code?: string | null;
    name?: string | null;
    legacy_exam_type?: string | null;
  };
  language?: string | null;
  topics?: string[] | null;
  difficulty?: "EASY" | "MEDIUM" | "HARD" | null;
  sourcePolicy?: "approved_public" | "public_pyp" | "approved_bank";
};

export type ExamInventoryResult = {
  available: number;
  examTypeKeys: string[];
  inventoryVersion?: string;
  inventorySnapshot?: Record<string, unknown>;
};

const TOPIC_MATCH = (topics: string[]) =>
  topics
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);

const OFFICIAL_SOURCE_FILTER =
  "is_verified.eq.true,source_type.in.(official_verified,verified_public_source),source.eq.OFFICIAL_PYP,source.eq.PYP,source.eq.previous_year";

/** Single source for inventory policy — must match check-exam-paper-availability. */
export function sourcePolicyForMode(
  mode: string,
): "public_pyp" | "approved_bank" {
  return mode === "official_previous" ? "public_pyp" : "approved_bank";
}

export async function countEligibleGovQuestions(
  db: SupabaseClient,
  input: ExamInventoryInput,
): Promise<ExamInventoryResult> {
  const examId = String(input.examId ?? "").trim();
  const topics = TOPIC_MATCH(Array.isArray(input.topics) ? input.topics : []);
  const sourcePolicy =
    input.sourcePolicy === "public_pyp" ? "public_pyp" : "approved_bank";

  if (examId) {
    const { data, error } = await db.rpc("count_gov_exam_eligible_questions", {
      p_exam_id: examId,
      p_language: input.language ?? "en",
      p_topics: topics.length ? topics : null,
      p_difficulty: input.difficulty ?? null,
      p_source_policy: sourcePolicy,
    });
    if (!error && data && typeof data === "object") {
      const row = data as Record<string, unknown>;
      const keys = Array.isArray(row.exam_type_keys)
        ? (row.exam_type_keys as string[])
        : [];
      return {
        available: Number(row.available) || 0,
        examTypeKeys: keys,
        inventoryVersion: String(row.inventory_version ?? "gov_inventory_v2"),
        inventorySnapshot: row as Record<string, unknown>,
      };
    }
    if (error) {
      console.error("[govQuestionInventory] RPC failed:", error.message);
      throw new Error(error.message);
    }
  }

  // Legacy row scan only when examId is absent (pre-registry wizard paths).
  console.warn("[govQuestionInventory] missing examId — legacy row scan");
  const examTypeKeys = examBankTypeKeys({
    code: input.exam.code,
    name: input.exam.name,
    legacy_exam_type: input.exam.legacy_exam_type,
  });
  if (examTypeKeys.length === 0) {
    return { available: 0, examTypeKeys, inventoryVersion: "legacy_fallback" };
  }

  const needsRowScan = topics.length > 0 || Boolean(input.difficulty);

  if (!needsRowScan) {
    let countQuery = db
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("is_public", true)
      .eq("publish_status", "published")
      .eq("review_status", "approved")
      .in("exam_type", examTypeKeys);
    if (sourcePolicy === "public_pyp") {
      countQuery = countQuery.or(OFFICIAL_SOURCE_FILTER);
    }
    const { count, error } = await countQuery;
    if (error) throw new Error(error.message);
    return {
      available: count ?? 0,
      examTypeKeys,
      inventoryVersion: "legacy_fallback",
    };
  }

  let query = db
    .from("questions")
    .select("id, subject, topic, difficulty")
    .eq("is_public", true)
    .eq("publish_status", "published")
    .eq("review_status", "approved")
    .in("exam_type", examTypeKeys)
    .limit(2000);
  if (sourcePolicy === "public_pyp") {
    query = query.or(OFFICIAL_SOURCE_FILTER);
  }
  if (input.difficulty) {
    query = query.eq("difficulty", input.difficulty);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  if (topics.length === 0) {
    return {
      available: (data ?? []).length,
      examTypeKeys,
      inventoryVersion: "legacy_fallback",
    };
  }

  const available = (data ?? []).filter((row) => {
    const subject = String(row.subject ?? "").trim().toLowerCase();
    const topic = String(row.topic ?? "").trim().toLowerCase();
    return topics.some((t) => subject.includes(t) || topic.includes(t) || t.includes(subject) || t.includes(topic));
  }).length;

  return { available, examTypeKeys, inventoryVersion: "legacy_fallback" };
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
