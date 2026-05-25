import { supabase } from "@/lib/supabase/client";

/** Primary cover letter text for AI interview context. */
export async function loadPrimaryCoverLetterText(
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("content, parsed_summary, title")
    .eq("user_id", userId)
    .eq("type", "cover_letter")
    .eq("is_primary", true)
    .maybeSingle();

  if (error) {
    console.warn("[loadPrimaryCoverLetterText]", error.message);
    return null;
  }

  const text =
    (typeof data?.parsed_summary === "string" && data.parsed_summary.trim()) ||
    (typeof data?.content === "string" && data.content.trim()) ||
    null;

  return text;
}

/** Combined resume + cover letter block for generate-answer / generate-hint. */
export async function buildResumeContextForAI(
  userId: string,
  resumeSummary: string | null | undefined
): Promise<string> {
  const parts: string[] = [];
  if (resumeSummary?.trim()) {
    parts.push(`Resume summary:\n${resumeSummary.trim()}`);
  }

  const cover = await loadPrimaryCoverLetterText(userId);
  if (cover) {
    parts.push(`Cover letter:\n${cover.slice(0, 8000)}`);
  }

  return parts.join("\n\n") || "None provided.";
}
