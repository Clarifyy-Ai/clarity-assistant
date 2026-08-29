/**
 * Offline coaching hints when generate-hint edge function is unavailable.
 */

export function getLocalHintFallback(question: string, interviewType = "behavioural"): string {
  const q = question.trim();
  const type = interviewType.toLowerCase();

  if (type.includes("technical") || type.includes("system")) {
    return [
      "**Approach**",
      "1. Clarify requirements and constraints (scale, latency, users).",
      "2. Outline a high-level design before diving into details.",
      "3. Call out trade-offs and why you chose this path.",
      "4. Mention monitoring, failure modes, and how you'd test it.",
      "",
      `**For this question:** "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}"`,
      "- Start with the simplest solution that works.",
      "- Name 2–3 key components and how data flows between them.",
      "- Close with what you'd optimize if traffic grew 10×.",
    ].join("\n");
  }

  return [
    "**STAR outline**",
    "**S** — Set the scene: team, company context, your role.",
    "**T** — Task: what problem or goal you owned.",
    "**A** — Action: specific steps *you* took (use “I”, not “we”).",
    "**R** — Result: measurable outcome + one lesson learned.",
    "",
    `**For this question:** "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}"`,
    "- Pick one concrete example from work, school, or a personal project.",
    "- Keep it under 90 seconds; lead with the result, then unpack the story.",
    "- End with how you'd apply that lesson in this role.",
  ].join("\n");
}
