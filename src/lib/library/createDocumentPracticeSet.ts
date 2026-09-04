import { generateQuestions } from "@/lib/api/ai";
import { ApiClientError } from "@/lib/api/apiClient";
import type { LicenseType } from "@/lib/content/license";
import { canCreatePracticeSetFromParsedDoc } from "@/lib/library/documentRights";
import { supabase } from "@/lib/supabase/client";

const PARSED_CONTEXT_CAP = 12_000;
const PRACTICE_QUESTION_COUNT = 8;

export type CreateDocumentPracticeSetInput = {
  userId: string;
  documentId: string;
  documentName: string;
  contentRights: LicenseType;
  rightsConfirmed: boolean;
  processingStatus: string | null | undefined;
  parsedContent: string | null | undefined;
  contentHash?: string | null;
  parserVersion?: string | null;
};

export type CreateDocumentPracticeSetResult = {
  practiceSetId: string;
  questionIds: string[];
  reused: boolean;
};

function truncateParsedContent(raw: string | null | undefined): string {
  return String(raw ?? "").trim().slice(0, PARSED_CONTEXT_CAP);
}

export function practiceSetIdempotencyKey(opts: {
  userId: string;
  documentId: string;
  contentHash?: string | null;
  parserVersion?: string | null;
}): string {
  const digest = String(opts.contentHash ?? opts.parserVersion ?? "v1").trim() || "v1";
  return `library-practice:${opts.userId}:${opts.documentId}:${digest}`;
}

/**
 * Generate interview practice questions from a completed library document parse,
 * persist them in answer_bank, and attach IDs to document_practice_sets.
 */
export async function createDocumentPracticeSet(
  input: CreateDocumentPracticeSetInput,
): Promise<CreateDocumentPracticeSetResult> {
  const parsed = truncateParsedContent(input.parsedContent);
  if (
    !canCreatePracticeSetFromParsedDoc({
      ownerId: input.userId,
      viewerId: input.userId,
      rightsConfirmed: input.rightsConfirmed,
      contentRights: input.contentRights,
      processingStatus: input.processingStatus,
      hasParsedContent: parsed.length > 0,
    })
  ) {
    throw new Error(
      "Wait until document parsing completes successfully before creating a practice set.",
    );
  }

  const { data: existing, error: existingErr } = await supabase
    .from("document_practice_sets")
    .select("id, question_ids")
    .eq("document_id", input.documentId)
    .eq("owner_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);

  const existingIds = Array.isArray(existing?.question_ids)
    ? existing.question_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (existing?.id && existingIds.length > 0) {
    return { practiceSetId: existing.id, questionIds: existingIds, reused: true };
  }

  const idempotencyKey = practiceSetIdempotencyKey({
    userId: input.userId,
    documentId: input.documentId,
    contentHash: input.contentHash,
    parserVersion: input.parserVersion,
  });

  let generated;
  try {
    generated = await generateQuestions(
      {
        type: "Resume Based",
        count: PRACTICE_QUESTION_COUNT,
        difficulty: "mixed",
        resume_context: parsed,
        focus_areas: ["document practice", "role readiness"],
        allow_fallback: true,
      },
      { idempotencyKey },
    );
  } catch (err) {
    if (err instanceof ApiClientError && (err.status === 402 || err.code === "INSUFFICIENT_CREDITS")) {
      throw new Error("Not enough credits to generate a practice set.");
    }
    throw err instanceof Error ? err : new Error("Practice question generation failed.");
  }

  const questions = (generated.questions ?? []).filter(
    (q) => String(q.question_text || q.question || "").trim().length > 0,
  );
  if (questions.length === 0) {
    throw new Error("No practice questions were generated from this document.");
  }

  const answerRows = questions.map((q) => {
    const text = String(q.question_text || q.question).trim();
    const tags = Array.isArray(q.tags) ? q.tags.filter((t) => typeof t === "string") : [];
    return {
      user_id: input.userId,
      question_text: text,
      answer_text: "",
      source: `library:${input.documentId}`,
      category: "library_practice",
      tags: [...tags, "library-practice", String(q.difficulty || "mixed")].slice(0, 12),
    };
  });

  const { data: insertedAnswers, error: answerErr } = await supabase
    .from("answer_bank")
    .insert(answerRows)
    .select("id");
  if (answerErr) throw new Error(answerErr.message);
  const questionIds = (insertedAnswers ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
  if (questionIds.length === 0) {
    throw new Error("Practice questions could not be saved to your Question Bank.");
  }

  const title = `Practice from ${input.documentName}`.slice(0, 200);
  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from("document_practice_sets")
      .update({ title, question_ids: questionIds })
      .eq("id", existing.id)
      .eq("owner_id", input.userId);
    if (updateErr) throw new Error(updateErr.message);
    return { practiceSetId: existing.id, questionIds, reused: false };
  }

  const { data: created, error: createErr } = await supabase
    .from("document_practice_sets")
    .insert({
      document_id: input.documentId,
      owner_id: input.userId,
      title,
      question_ids: questionIds,
    })
    .select("id")
    .single();
  if (createErr) throw new Error(createErr.message);
  if (!created?.id) throw new Error("Practice set could not be created.");
  return { practiceSetId: created.id, questionIds, reused: false };
}
