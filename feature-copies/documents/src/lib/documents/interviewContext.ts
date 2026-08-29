import { supabase } from "@/lib/supabase/client";
import {
  formatParsedResumeForAI,
  parseResumeContentString,
} from "@/lib/documents/resumeParse";
import type { ParsedResume } from "@/types/ai.types";

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

/** Combined resume + JD + instructions + cover letter for generate-answer / generate-hint. */
export async function buildResumeContextForAI(
  userId: string,
  options?: {
    resumeSummary?: string | null;
    resumeContent?: string | null;
    parsedResume?: ParsedResume | null;
    jdSnippet?: string | null;
    instructions?: string | null;
    role?: string | null;
    company?: string | null;
  },
): Promise<string> {
  const parsed =
    options?.parsedResume ??
    parseResumeContentString(options?.resumeContent ?? null);

  const cover = await loadPrimaryCoverLetterText(userId);

  const fromParsed = formatParsedResumeForAI(parsed, {
    jdSnippet: options?.jdSnippet,
    instructions: options?.instructions,
    coverLetter: cover,
    role: options?.role,
    company: options?.company,
  });

  if (fromParsed !== "None provided.") return fromParsed;

  if (options?.resumeSummary?.trim()) {
    return formatParsedResumeForAI(null, {
      jdSnippet: options.jdSnippet,
      instructions: options?.instructions,
      coverLetter: cover,
      role: options?.role,
      company: options?.company,
    }).replace(
      "None provided.",
      `Resume summary:\n${options.resumeSummary.trim()}`,
    );
  }

  return fromParsed;
}
