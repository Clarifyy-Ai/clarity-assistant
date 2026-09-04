/**
 * Build preference / grounding snippets from Live Copilot setup fields
 * so hint/answer Edge calls receive wizard context (not only resume/JD text).
 */

export type LiveSessionPreferenceFields = {
  seniority?: string | null;
  focus_competencies?: string[];
  topics_to_avoid?: string[];
  skills_to_emphasize?: string[];
  skills_not_to_claim?: string[];
  answer_bank_context_ids?: string[];
  interview_stage?: string | null;
  industry?: string | null;
};

function cleanList(values: string[] | undefined, max = 12): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Human-readable block appended into resume/session preference context. */
export function buildLivePreferencePromptBlock(
  fields: LiveSessionPreferenceFields,
  answerBankSnippets?: string[],
): string {
  const lines: string[] = [];
  if (fields.seniority?.trim()) lines.push(`Seniority: ${fields.seniority.trim()}`);
  if (fields.industry?.trim()) lines.push(`Industry: ${fields.industry.trim()}`);
  if (fields.interview_stage?.trim()) {
    lines.push(`Interview stage: ${fields.interview_stage.trim()}`);
  }

  const focus = cleanList(fields.focus_competencies);
  if (focus.length) lines.push(`Focus competencies: ${focus.join(", ")}`);

  const emphasize = cleanList(fields.skills_to_emphasize);
  if (emphasize.length) lines.push(`Skills to emphasize: ${emphasize.join(", ")}`);

  const avoid = cleanList(fields.topics_to_avoid);
  if (avoid.length) lines.push(`Topics to avoid: ${avoid.join(", ")}`);

  const notClaim = cleanList(fields.skills_not_to_claim);
  if (notClaim.length) {
    lines.push(
      `Skills NOT to claim (never invent experience with these): ${notClaim.join(", ")}`,
    );
  }

  const bank = (answerBankSnippets ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (bank.length) {
    lines.push("Selected Answer Bank stories:");
    for (const snippet of bank) {
      lines.push(`- ${snippet.slice(0, 500)}`);
    }
  }

  return lines.join("\n");
}

/** Map wizard seniority labels to CoachingContext experience_level when possible. */
export function mapSeniorityToExperienceLevel(
  seniority: string | null | undefined,
): "intern" | "junior" | "mid" | "senior" | "staff" | "principal" | "director" | "vp" | null {
  if (!seniority?.trim()) return null;
  const s = seniority.trim().toLowerCase();
  if (s === "intern" || s === "fresher") return "intern";
  if (s === "junior") return "junior";
  if (s === "mid" || s === "mid-level" || s === "midlevel") return "mid";
  if (s === "senior") return "senior";
  if (s === "lead" || s === "staff") return "staff";
  if (s === "manager" || s === "director") return "director";
  if (s === "principal") return "principal";
  if (s === "vp") return "vp";
  return null;
}
