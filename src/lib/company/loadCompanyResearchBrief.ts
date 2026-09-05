/**
 * Load cached company research brief for coach context injection.
 */
import { supabase } from "@/lib/supabase/client";
import { normalizeCompanyName } from "@/lib/company/normalizeCompanyName";

export type CompanyResearchBriefBlock = {
  company: string;
  summary: string | null;
  promptBlock: string;
};

function briefToPromptBlock(company: string, raw: Record<string, unknown>): string {
  const parts: string[] = [`Company: ${company}`];
  const summary =
    typeof raw.summary === "string"
      ? raw.summary
      : typeof raw.overview === "string"
        ? raw.overview
        : null;
  if (summary) parts.push(`Summary: ${summary.slice(0, 2_000)}`);
  const culture = raw.culture_signals ?? raw.culture;
  if (Array.isArray(culture) && culture.length) {
    parts.push(`Culture: ${culture.slice(0, 6).join("; ")}`);
  }
  const format = raw.interview_format;
  if (typeof format === "string" && format.trim()) {
    parts.push(`Interview format: ${format.trim()}`);
  }
  const stack = raw.tech_stack;
  if (typeof stack === "string" && stack.trim()) {
    parts.push(`Tech stack: ${stack.trim()}`);
  } else if (Array.isArray(stack) && stack.length) {
    parts.push(`Tech stack: ${stack.slice(0, 12).join(", ")}`);
  }
  const news = raw.recent_news;
  if (Array.isArray(news) && news.length) {
    parts.push(`Recent news: ${news.slice(0, 4).join("; ")}`);
  }
  return parts.join("\n");
}

/** Load user's cached company research for coach prompts (RLS-scoped). */
export async function loadCompanyResearchBriefBlock(
  userId: string,
  company: string | null | undefined,
): Promise<CompanyResearchBriefBlock | null> {
  const normalized = normalizeCompanyName(company);
  if (!userId || !normalized) return null;

  try {
    const { data, error } = await supabase
      .from("company_research")
      .select("raw_data, company_name")
      .eq("user_id", userId)
      .eq("company_name_normalized", normalized)
      .maybeSingle();

    if (error || !data?.raw_data || typeof data.raw_data !== "object") {
      return null;
    }

    const raw = data.raw_data as Record<string, unknown>;
    const displayName =
      typeof data.company_name === "string" && data.company_name.trim()
        ? data.company_name.trim()
        : company!.trim();

    const summary =
      typeof raw.summary === "string"
        ? raw.summary
        : typeof raw.overview === "string"
          ? raw.overview
          : null;

    return {
      company: displayName,
      summary,
      promptBlock: briefToPromptBlock(displayName, raw),
    };
  } catch {
    return null;
  }
}
