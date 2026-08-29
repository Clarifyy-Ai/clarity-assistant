/**
 * Client helpers for durable Prep Rephraser history (prep_rephrase_history).
 */
import { supabase } from "@/lib/supabase/client";
import type { RephraserAlternatives } from "@/lib/prep/rephraserPersistence";

export type PrepRephraseHistoryRow = {
  id: string;
  input_hash: string;
  original_text: string;
  alternatives: RephraserAlternatives;
  provider: string | null;
  model: string | null;
  credit_op_id: string | null;
  status: string;
  created_at: string;
};

function asAlternatives(value: unknown): RephraserAlternatives | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.formal !== "string" ||
    typeof candidate.confident !== "string" ||
    typeof candidate.concise !== "string"
  ) {
    return null;
  }
  return {
    formal: candidate.formal,
    confident: candidate.confident,
    concise: candidate.concise,
  };
}

export async function listPrepRephraseHistory(
  userId: string,
  limit = 20,
): Promise<PrepRephraseHistoryRow[]> {
  const { data, error } = await supabase
    .from("prep_rephrase_history")
    .select(
      "id,input_hash,original_text,alternatives,provider,model,credit_op_id,status,created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const alternatives = asAlternatives(row.alternatives);
      if (!alternatives) return null;
      return {
        id: String(row.id),
        input_hash: String(row.input_hash ?? ""),
        original_text: String(row.original_text ?? ""),
        alternatives,
        provider: (row.provider as string | null) ?? null,
        model: (row.model as string | null) ?? null,
        credit_op_id: (row.credit_op_id as string | null) ?? null,
        status: String(row.status ?? "completed"),
        created_at: String(row.created_at ?? ""),
      } satisfies PrepRephraseHistoryRow;
    })
    .filter((row): row is PrepRephraseHistoryRow => row !== null);
}

export async function upsertPrepRephraseHistory(params: {
  userId: string;
  inputHash: string;
  originalText: string;
  alternatives: RephraserAlternatives;
  provider?: string | null;
  model?: string | null;
  creditOpId?: string | null;
  status?: "completed" | "failed" | "offline_fallback";
}): Promise<void> {
  const { error } = await supabase.from("prep_rephrase_history").upsert(
    {
      user_id: params.userId,
      input_hash: params.inputHash,
      original_text: params.originalText,
      alternatives: params.alternatives,
      provider: params.provider ?? null,
      model: params.model ?? null,
      credit_op_id: params.creditOpId ?? null,
      status: params.status ?? "completed",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,input_hash" },
  );
  if (error) throw error;
}
